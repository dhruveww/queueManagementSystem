import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Clock, Users, MapPin } from "lucide-react";
import { getGuestStatus } from "@/lib/domain/queue";
import { formatWait } from "@/lib/domain/waitTime";
import { StatusLive } from "./StatusLive";
import { OPEN_QUEUE_STATUSES } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StatusPage({
  params,
}: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const status = await getGuestStatus(token);
  if (!status) notFound();

  const { entry, outlet, position, aheadOfYou, waitLow, waitHigh } = status;
  const active = OPEN_QUEUE_STATUSES.includes(entry.status);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-5 pb-16 pt-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-saffron-600">
          Baari · Your place in line
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ink-900">{outlet.name}</h1>
      </header>

      {entry.status === "notified" && (
        <section className="pulse-ring rounded-3xl bg-status-free p-6 text-center text-white">
          <CheckCircle2 className="mx-auto size-10" aria-hidden />
          <p className="mt-3 text-2xl font-bold">Your table is ready!</p>
          <p className="mt-2 text-sm text-white/90">
            Please come to the host desk within {outlet.grace_period_min} minutes.
            Show token <span className="font-bold tnum">{entry.ticket_code}</span>.
          </p>
        </section>
      )}

      {entry.status === "waiting" && (
        <section className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-ink-100">
          <p className="text-sm text-ink-500">You are</p>
          <p className="mt-1 text-6xl font-bold leading-none text-ink-900 tnum">#{position}</p>
          <p className="mt-2 text-sm text-ink-500">
            {aheadOfYou === 0
              ? "You're next in line"
              : `${aheadOfYou} ${aheadOfYou === 1 ? "group" : "groups"} ahead of you`}
          </p>
          <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-saffron-50 px-4 py-3">
            <Clock className="size-5 text-saffron-600" aria-hidden />
            <span className="text-lg font-semibold text-saffron-900 tnum">
              {formatWait(waitLow, waitHigh)}
            </span>
          </div>
        </section>
      )}

      {entry.status === "seated" && (
        <Closed title="You're seated — enjoy!" tone="good">
          Thanks for using Baari at {outlet.name}.
        </Closed>
      )}
      {entry.status === "left" && (
        <Closed title="You've left the line">
          Scan the QR at the door any time to join again.
        </Closed>
      )}
      {entry.status === "no_show" && (
        <Closed title="Your table was released">
          We held it as long as we could. Please speak to the host desk to rejoin.
        </Closed>
      )}
      {entry.status === "cancelled" && (
        <Closed title="This entry was cancelled">Please check with the host desk.</Closed>
      )}

      <dl className="mt-6 grid grid-cols-3 gap-3 text-center">
        <Stat icon={<span className="text-base font-bold">#</span>} label="Token" value={entry.ticket_code} />
        <Stat icon={<Users className="size-4" aria-hidden />} label="Party" value={String(entry.party_size)} />
        <Stat
          icon={<MapPin className="size-4" aria-hidden />}
          label="Seating"
          value={entry.zone_pref ? entry.zone_pref.toUpperCase() : "Any"}
        />
      </dl>

      {active && (
        <p className="mt-6 rounded-xl bg-ink-100 p-4 text-center text-sm text-ink-600">
          Keep this page open, or just wait — we'll WhatsApp you the moment your table is ready.
        </p>
      )}

      <StatusLive token={token} active={active} />

      {!active && (
        <Link
          href={`/q/${outlet.slug}`}
          className="mt-6 block rounded-2xl bg-saffron-500 py-4 text-center text-base font-semibold text-white"
        >
          Join the line again
        </Link>
      )}
    </main>
  );
}

function Closed({
  title, children, tone = "neutral",
}: { title: string; children: React.ReactNode; tone?: "good" | "neutral" }) {
  return (
    <section
      className={
        tone === "good"
          ? "rounded-3xl bg-status-free/10 p-6 text-center ring-1 ring-status-free/30"
          : "rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-ink-100"
      }
    >
      <p className="text-xl font-bold text-ink-900">{title}</p>
      <p className="mt-2 text-sm text-ink-500">{children}</p>
    </section>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-ink-100">
      <dt className="flex items-center justify-center gap-1 text-xs text-ink-400">
        {icon} {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold text-ink-900 tnum">{value}</dd>
    </div>
  );
}
