"use client";

import { useActionState, useState } from "react";
import { Users, Loader2, MessageCircle } from "lucide-react";
import { joinQueueAction, type JoinState } from "./actions";
import { ZONE_KIND_LABEL, type ZoneKind } from "@/lib/types";
import { cn } from "@/lib/cn";

interface Props {
  slug: string;
  maxPartySize: number;
  zoneOptions: ZoneKind[];
  estimateLabel: string;
  peopleAhead: number;
}

const PARTY_CHIPS = [1, 2, 3, 4, 5, 6, 8];

export function JoinForm({ slug, maxPartySize, zoneOptions, estimateLabel, peopleAhead }: Props) {
  const [state, action, pending] = useActionState<JoinState, FormData>(joinQueueAction, {});
  const [party, setParty] = useState(2);
  const [zone, setZone] = useState<ZoneKind | "">("");

  const err = (f: string) => state.fieldErrors?.[f];

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="partySize" value={party} />
      <input type="hidden" name="zonePref" value={zone} />

      <div className="rounded-2xl bg-saffron-50 border border-saffron-200 p-4">
        <p className="text-sm text-saffron-900">
          <span className="font-semibold">{peopleAhead}</span>{" "}
          {peopleAhead === 1 ? "group is" : "groups are"} waiting right now.
          Current wait is roughly{" "}
          <span className="font-semibold tnum">{estimateLabel}</span>.
        </p>
      </div>

      <Field label="Your name" error={err("name")}>
        <input
          name="name" required autoComplete="name" enterKeyHint="next"
          placeholder="e.g. Ananya"
          className={inputClass(!!err("name"))}
        />
      </Field>

      <Field
        label="WhatsApp number"
        hint="Enter the number linked to your WhatsApp — that's where we'll message you."
        error={err("phone")}
      >
        <div className="flex">
          <span className="inline-flex items-center rounded-l-xl border border-r-0 border-ink-200 bg-ink-100 px-3 text-ink-600 text-base">
            +91
          </span>
          <input
            name="phone" required type="tel" inputMode="numeric" autoComplete="tel-national"
            maxLength={11} placeholder="98765 43210"
            className={cn(inputClass(!!err("phone")), "rounded-l-none tnum")}
          />
        </div>
      </Field>

      <fieldset>
        <legend className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-800">
          <Users className="size-4" aria-hidden /> How many of you?
        </legend>
        <div className="flex flex-wrap gap-2">
          {PARTY_CHIPS.filter((n) => n <= maxPartySize).map((n) => (
            <button
              key={n} type="button" onClick={() => setParty(n)}
              aria-pressed={party === n}
              className={cn(
                "min-w-12 rounded-xl border px-4 py-3 text-base font-semibold tnum transition",
                party === n
                  ? "border-saffron-500 bg-saffron-500 text-white"
                  : "border-ink-200 bg-white text-ink-700 active:bg-ink-100",
              )}
            >
              {n}
            </button>
          ))}
          <label className="flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3">
            <span className="text-sm text-ink-500">More</span>
            <input
              type="number" min={1} max={maxPartySize} value={party}
              onChange={(e) => setParty(Math.min(maxPartySize, Math.max(1, +e.target.value || 1)))}
              className="w-14 bg-transparent py-3 text-base font-semibold tnum outline-none"
              aria-label="Party size"
            />
          </label>
        </div>
      </fieldset>

      {zoneOptions.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-800">
            Seating preference <span className="font-normal text-ink-400">(optional)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            <ZoneChip active={zone === ""} onClick={() => setZone("")}>No preference</ZoneChip>
            {zoneOptions.map((z) => (
              <ZoneChip key={z} active={zone === z} onClick={() => setZone(z)}>
                {ZONE_KIND_LABEL[z]}
              </ZoneChip>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-400">
            We'll try, but the next suitable table always wins over a preference.
          </p>
        </fieldset>
      )}

      <Field label="Anything we should know?" hint="Birthday, wheelchair access, high chair…">
        <input name="notes" maxLength={200} placeholder="Optional" className={inputClass(false)} />
      </Field>

      <label className="flex gap-3 rounded-xl bg-ink-50 p-4 text-sm text-ink-700">
        <input
          name="consent" type="checkbox" required
          className="mt-0.5 size-5 shrink-0 accent-saffron-500"
        />
        <span>
          I agree to receive queue updates from this restaurant on WhatsApp. My number is
          used only for this visit and is deleted automatically afterwards.
          {err("consent") && (
            <span className="mt-1 block font-medium text-red-600">{err("consent")}</span>
          )}
        </span>
      </label>

      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{state.error}</p>
      )}

      <button
        type="submit" disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-saffron-500 px-6 py-4 text-lg font-semibold text-white shadow-lg shadow-saffron-500/25 transition active:scale-[0.99] disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <MessageCircle className="size-5" aria-hidden />}
        {pending ? "Joining…" : "Join the line"}
      </button>

      <p className="text-center text-xs text-ink-400">
        No app, no login. Powered by <span className="font-semibold text-ink-500">Baari</span>.
      </p>
    </form>
  );
}

function inputClass(hasError: boolean) {
  return cn(
    "w-full rounded-xl border bg-white px-4 py-3 text-base outline-none transition",
    "focus:border-saffron-500 focus:ring-2 focus:ring-saffron-200",
    hasError ? "border-red-400" : "border-ink-200",
  );
}

function Field({
  label, hint, error, children,
}: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-ink-800">{label}</span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-xs text-ink-400">{hint}</span>}
      {error && <span className="mt-1.5 block text-xs font-medium text-red-600">{error}</span>}
    </label>
  );
}

function ZoneChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      className={cn(
        "rounded-xl border px-4 py-2.5 text-sm font-medium transition",
        active
          ? "border-saffron-500 bg-saffron-500 text-white"
          : "border-ink-200 bg-white text-ink-700 active:bg-ink-100",
      )}
    >
      {children}
    </button>
  );
}
