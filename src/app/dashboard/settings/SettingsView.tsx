"use client";

import { useState, useTransition } from "react";
import { Copy, Check, Download, Plus, CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { updateOutletAction, addFloorAction, addZoneAction } from "./actions";
import { ZONE_KIND_LABEL, type Floor, type NotifTemplate, type Outlet, type Zone, type ZoneKind } from "@/lib/types";
import { cn } from "@/lib/cn";

interface TemplateRow { key: NotifTemplate; name: string; body: string; approval: string }

export function SettingsView({
  outlet, floors, zones, joinUrl, qrSvg, templates,
}: {
  outlet: Outlet; floors: Floor[]; zones: Zone[];
  joinUrl: string; qrSvg: string; templates: TemplateRow[];
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  function flash(text: string, bad = false) {
    setMsg({ text, bad });
    setTimeout(() => setMsg(null), 4000);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 pb-16">
      <h1 className="text-xl font-semibold text-white">Settings · {outlet.name}</h1>

      {/* ------------------------------------------------------------- QR */}
      <Card
        title="Your QR code"
        subtitle="Print this for the door, the standee, or the table tents. It never changes."
      >
        <div className="flex flex-wrap items-start gap-6">
          <div className="rounded-xl bg-white p-3" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="text-xs text-ink-500">Join link</p>
              <p className="mt-1 break-all font-mono text-sm text-ink-200">{joinUrl}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(joinUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="flex items-center gap-2 rounded-lg border border-ink-700 px-3 py-2 text-sm text-ink-200 hover:bg-ink-800"
              >
                {copied ? <Check className="size-4 text-status-free" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? "Copied" : "Copy link"}
              </button>
              <a
                href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`}
                download={`baari-${outlet.slug}-qr.svg`}
                className="flex items-center gap-2 rounded-lg border border-ink-700 px-3 py-2 text-sm text-ink-200 hover:bg-ink-800"
              >
                <Download className="size-4" aria-hidden /> Download SVG
              </a>
            </div>
            <p className="text-xs text-ink-500">
              Works from anywhere the guest can see it — a poster, your Google Maps
              listing, or an Instagram bio link.
            </p>
          </div>
        </div>
      </Card>

      {/* -------------------------------------------------- outlet settings */}
      <Card title="Queue behaviour" subtitle="How Baari handles waiting, notifying and no-shows here">
        <form
          action={(fd) => start(async () => {
            fd.set("outletId", outlet.id);
            const res = await updateOutletAction(fd);
            flash(res.ok ? "Settings saved" : res.error, !res.ok);
          })}
          className="grid gap-4 sm:grid-cols-2"
        >
          <Field label="Outlet name">
            <input name="name" defaultValue={outlet.name} required className={dark} />
          </Field>
          <Field label="Phone">
            <input name="phone" defaultValue={outlet.phone ?? ""} className={dark} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <input name="address" defaultValue={outlet.address ?? ""} className={dark} />
          </Field>

          <Field label="Check-in window" hint="Minutes a guest has to arrive after 'table ready'">
            <input name="grace_period_min" type="number" min={1} max={60}
                   defaultValue={outlet.grace_period_min} className={cn(dark, "tnum")} />
          </Field>
          <Field label="Grace re-offers" hint="Extra nudges before auto no-show">
            <input name="grace_reoffers" type="number" min={0} max={3}
                   defaultValue={outlet.grace_reoffers} className={cn(dark, "tnum")} />
          </Field>
          <Field label="'Getting close' threshold" hint="Message the guest when their wait drops below this">
            <input name="notify_lead_min" type="number" min={5} max={60}
                   defaultValue={outlet.notify_lead_min} className={cn(dark, "tnum")} />
          </Field>
          <Field label="Max party size">
            <input name="max_party_size" type="number" min={2} max={50}
                   defaultValue={outlet.max_party_size} className={cn(dark, "tnum")} />
          </Field>
          <Field label="Delete guest numbers after" hint="DPDP retention window, in days">
            <input name="pii_retention_days" type="number" min={1} max={365}
                   defaultValue={outlet.pii_retention_days} className={cn(dark, "tnum")} />
          </Field>
          <Field label="Feedback link" hint="Sent after the visit, Pro only">
            <input name="feedback_url" type="url" defaultValue={outlet.feedback_url ?? ""}
                   placeholder="https://g.page/r/..." className={dark} />
          </Field>

          <label className="flex items-center gap-3 sm:col-span-2">
            <input type="checkbox" name="is_open" defaultChecked={outlet.is_open}
                   className="size-5 accent-saffron-500" />
            <span className="text-sm text-ink-200">
              Accepting queue joins
              <span className="block text-xs text-ink-500">
                Turn this off to close the line without taking the QR code down.
              </span>
            </span>
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit" disabled={pending}
              className="rounded-xl bg-saffron-500 px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save settings"}
            </button>
          </div>
        </form>
      </Card>

      {/* ------------------------------------------------- floors and zones */}
      <Card
        title="Floors and zones"
        subtitle="Zones drive the guest's seating preference and, on Pro, the 3D floor switcher and heatmap"
      >
        <div className="space-y-4">
          {floors.map((f) => (
            <div key={f.id} className="rounded-lg border border-ink-800 p-3">
              <p className="font-medium text-white">
                {f.name} <span className="text-xs font-normal text-ink-500 tnum">level {f.level}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {zones.filter((z) => z.floor_id === f.id).map((z) => (
                  <span key={z.id} className="flex items-center gap-1.5 rounded-lg bg-ink-950 px-2.5 py-1.5 text-sm text-ink-300">
                    <span className="size-2.5 rounded-full" style={{ background: z.color }} aria-hidden />
                    {z.name}
                    <span className="text-xs text-ink-500">{ZONE_KIND_LABEL[z.kind]}</span>
                  </span>
                ))}
                {zones.filter((z) => z.floor_id === f.id).length === 0 && (
                  <span className="text-sm text-ink-500">No zones on this floor yet</span>
                )}
              </div>

              <form
                action={(fd) => start(async () => {
                  fd.set("outletId", outlet.id);
                  fd.set("floorId", f.id);
                  const res = await addZoneAction(fd);
                  flash(res.ok ? "Zone added" : res.error, !res.ok);
                })}
                className="mt-3 flex flex-wrap gap-2"
              >
                <input name="name" required placeholder="Zone name" className={cn(dark, "w-40")} />
                <select name="kind" className={cn(dark, "w-36")} defaultValue="indoor">
                  {(Object.keys(ZONE_KIND_LABEL) as ZoneKind[]).map((k) => (
                    <option key={k} value={k}>{ZONE_KIND_LABEL[k]}</option>
                  ))}
                </select>
                <input name="color" type="color" defaultValue="#64748b"
                       className="h-10 w-14 rounded-lg border border-ink-800 bg-ink-950" aria-label="Zone colour" />
                <button className="flex items-center gap-1.5 rounded-lg border border-ink-700 px-3 text-sm text-ink-200 hover:bg-ink-800">
                  <Plus className="size-4" aria-hidden /> Add zone
                </button>
              </form>
            </div>
          ))}

          <form
            action={(fd) => start(async () => {
              fd.set("outletId", outlet.id);
              const res = await addFloorAction(fd);
              flash(res.ok ? "Floor added" : res.error, !res.ok);
            })}
            className="flex flex-wrap gap-2"
          >
            <input name="name" required placeholder="Floor name (e.g. Rooftop)" className={cn(dark, "w-56")} />
            <input name="level" type="number" defaultValue={floors.length} className={cn(dark, "w-24 tnum")}
                   aria-label="Level" />
            <button className="flex items-center gap-1.5 rounded-lg bg-ink-800 px-3 py-2 text-sm text-ink-100">
              <Plus className="size-4" aria-hidden /> Add floor
            </button>
          </form>
        </div>
      </Card>

      {/* --------------------------------------------------- WhatsApp state */}
      <Card
        title="WhatsApp templates"
        subtitle="Every message is a pre-approved template. All six must be approved by Meta before you go live."
      >
        <ul className="space-y-2">
          {templates.map((t) => (
            <li key={t.key} className="rounded-lg border border-ink-800 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <ApprovalPill approval={t.approval} />
                <span className="font-mono text-xs text-ink-400">{t.name}</span>
              </div>
              <p className="mt-2 text-sm text-ink-300">{t.body}</p>
            </li>
          ))}
        </ul>
      </Card>

      {msg && (
        <div
          role="status"
          className={cn("fixed bottom-5 left-1/2 -translate-x-1/2 rounded-xl px-4 py-3 text-sm font-medium shadow-xl",
            msg.bad ? "bg-red-600 text-white" : "bg-white text-ink-900")}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}

function ApprovalPill({ approval }: { approval: string }) {
  const map: Record<string, { icon: React.ReactNode; cls: string }> = {
    approved: { icon: <CircleCheck className="size-3.5" aria-hidden />, cls: "bg-status-free/15 text-status-free" },
    pending: { icon: <CircleDashed className="size-3.5" aria-hidden />, cls: "bg-status-clearing/15 text-status-clearing" },
    rejected: { icon: <CircleX className="size-3.5" aria-hidden />, cls: "bg-red-500/15 text-red-400" },
  };
  const v = map[approval] ?? { icon: <CircleDashed className="size-3.5" aria-hidden />, cls: "bg-ink-800 text-ink-400" };
  return (
    <span className={cn("flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium capitalize", v.cls)}>
      {v.icon}{approval}
    </span>
  );
}

function Card({
  title, subtitle, children,
}: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink-800 bg-ink-900 p-5">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {subtitle && <p className="mb-4 mt-0.5 text-sm text-ink-500">{subtitle}</p>}
      {children}
    </section>
  );
}

function Field({
  label, hint, className, children,
}: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-sm text-ink-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
    </label>
  );
}

const dark =
  "w-full rounded-xl border border-ink-800 bg-ink-950 px-3 py-2.5 text-white outline-none focus:border-saffron-500";
