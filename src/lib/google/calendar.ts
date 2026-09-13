import "server-only";
import { getGoogleAccessToken, isGoogleConfigured } from "./auth";
import { IST_TZ, toRfc3339Ist } from "@/lib/meetings/time";
import type { Interval } from "@/lib/meetings/slots";

/**
 * Calendar access for intro calls, behind a provider interface so the booking
 * flow runs end to end with no Google account at all — same pattern as the
 * WhatsApp and email providers.
 */

export interface HeldEvent {
  eventId: string;
  htmlLink?: string;
  meetUrl?: string;
}

export interface CalendarProvider {
  readonly name: string;
  freeBusy(fromIso: string, toIso: string): Promise<Interval[]>;
  createTentative(args: {
    summary: string; description: string; startIso: string; endIso: string;
  }): Promise<HeldEvent>;
  /** Confirms the hold and invites the lead, returning a Meet link if one was made. */
  confirm(eventId: string, attendeeEmail: string): Promise<HeldEvent>;
  move(eventId: string, startIso: string, endIso: string): Promise<void>;
  cancel(eventId: string): Promise<void>;
}

const CAL_ID = () => encodeURIComponent(process.env.GOOGLE_CALENDAR_ID ?? "primary");
const BASE = "https://www.googleapis.com/calendar/v3";

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const token = await getGoogleAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`calendar ${res.status}: ${body.slice(0, 200)}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

// ------------------------------------------------------------------- google

class GoogleCalendar implements CalendarProvider {
  readonly name = "google";

  async freeBusy(fromIso: string, toIso: string): Promise<Interval[]> {
    const json = await call<{ calendars?: Record<string, { busy?: Interval[] }> }>(
      "/freeBusy",
      {
        method: "POST",
        body: JSON.stringify({
          timeMin: fromIso,
          timeMax: toIso,
          timeZone: IST_TZ,
          items: [{ id: process.env.GOOGLE_CALENDAR_ID ?? "primary" }],
        }),
      },
    );
    const cal = Object.values(json.calendars ?? {})[0];
    return cal?.busy ?? [];
  }

  async createTentative(args: {
    summary: string; description: string; startIso: string; endIso: string;
  }): Promise<HeldEvent> {
    // No attendee yet, and sendUpdates=none: the lead must not receive a Google
    // invite for a meeting the owner has not confirmed. `tentative` still shows
    // as busy in freeBusy, which is what holds the slot.
    const json = await call<{ id: string; htmlLink?: string }>(
      `/calendars/${CAL_ID()}/events?sendUpdates=none`,
      {
        method: "POST",
        body: JSON.stringify({
          summary: args.summary,
          description: args.description,
          status: "tentative",
          start: { dateTime: toRfc3339Ist(new Date(args.startIso)), timeZone: IST_TZ },
          end: { dateTime: toRfc3339Ist(new Date(args.endIso)), timeZone: IST_TZ },
        }),
      },
    );
    return { eventId: json.id, htmlLink: json.htmlLink };
  }

  async confirm(eventId: string, attendeeEmail: string): Promise<HeldEvent> {
    const json = await call<{
      id: string; htmlLink?: string;
      conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
    }>(
      `/calendars/${CAL_ID()}/events/${encodeURIComponent(eventId)}?sendUpdates=all&conferenceDataVersion=1`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: "confirmed",
          attendees: [{ email: attendeeEmail }],
          conferenceData: {
            createRequest: {
              requestId: `baari-${eventId}`.slice(0, 64),
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }),
      },
    );
    const meet = json.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri;
    return { eventId: json.id, htmlLink: json.htmlLink, meetUrl: meet };
  }

  async move(eventId: string, startIso: string, endIso: string): Promise<void> {
    await call(`/calendars/${CAL_ID()}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
      method: "PATCH",
      body: JSON.stringify({
        start: { dateTime: toRfc3339Ist(new Date(startIso)), timeZone: IST_TZ },
        end: { dateTime: toRfc3339Ist(new Date(endIso)), timeZone: IST_TZ },
      }),
    });
  }

  async cancel(eventId: string): Promise<void> {
    await call(`/calendars/${CAL_ID()}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
      method: "DELETE",
    });
  }
}

// --------------------------------------------------------------------- mock

/**
 * Deterministic stand-in. Reports a standing 13:00-14:00 IST lunch block every
 * day so the picker visibly has holes in it, which makes the busy-subtraction
 * obvious when demoing.
 */
class MockCalendar implements CalendarProvider {
  readonly name = "mock";

  async freeBusy(fromIso: string, toIso: string): Promise<Interval[]> {
    const out: Interval[] = [];
    const from = new Date(fromIso);
    const to = new Date(toIso);
    for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86_400_000)) {
      const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      // 13:00 IST == 07:30 UTC
      const start = new Date(day.getTime() + (13 * 60 - 330) * 60_000);
      out.push({
        start: start.toISOString(),
        end: new Date(start.getTime() + 3_600_000).toISOString(),
      });
    }
    console.info(`[calendar:mock] freeBusy ${fromIso} → ${toIso} (${out.length} synthetic busy blocks)`);
    return out;
  }

  async createTentative(args: { summary: string; startIso: string }): Promise<HeldEvent> {
    const eventId = `mock_${crypto.randomUUID()}`;
    console.info(`[calendar:mock] hold "${args.summary}" at ${args.startIso} → ${eventId}`);
    return { eventId, htmlLink: `https://calendar.google.com/mock/${eventId}` };
  }

  async confirm(eventId: string, attendeeEmail: string): Promise<HeldEvent> {
    console.info(`[calendar:mock] confirm ${eventId}, invite ${attendeeEmail}`);
    return {
      eventId,
      htmlLink: `https://calendar.google.com/mock/${eventId}`,
      meetUrl: "https://meet.google.com/mock-baari-demo",
    };
  }

  async move(eventId: string, startIso: string): Promise<void> {
    console.info(`[calendar:mock] move ${eventId} → ${startIso}`);
  }

  async cancel(eventId: string): Promise<void> {
    console.info(`[calendar:mock] cancel ${eventId}`);
  }
}

// ----------------------------------------------------------------- selection

let cached: CalendarProvider | null = null;

export function getCalendar(): CalendarProvider {
  if (cached) return cached;
  const kind = (process.env.MEETING_CALENDAR ?? "mock").toLowerCase();

  if (kind === "google") {
    if (!isGoogleConfigured()) {
      console.error("[calendar] MEETING_CALENDAR=google but Google OAuth is not configured — falling back to mock.");
      cached = new MockCalendar();
    } else {
      cached = new GoogleCalendar();
    }
  } else {
    cached = new MockCalendar();
  }
  return cached;
}

export function resetCalendar() {
  cached = null;
}
