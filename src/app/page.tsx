import Link from "next/link";
import { MessageCircle, Box, BarChart3, QrCode, ArrowRight } from "lucide-react";
import { PLANS } from "@/lib/billing/razorpay";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-16">
      <p className="text-xs font-semibold uppercase tracking-widest text-saffron-600">Baari</p>
      <h1 className="mt-3 max-w-2xl text-4xl font-bold leading-tight text-ink-900 sm:text-5xl">
        Your turn — on WhatsApp.
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-600">
        Guests scan a QR at your door, join the line, and go browse. Baari messages them
        on WhatsApp the moment their table is ready. No app, no login, no SMS bills.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/login"
          className="flex items-center gap-2 rounded-xl bg-saffron-500 px-6 py-3.5 font-semibold text-white"
        >
          Staff sign in <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      <section className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Feature icon={<QrCode className="size-5" aria-hidden />} title="Scan to join">
          One QR on the door. A mobile page that loads fast on patchy 4G, asks for four
          things, and gives a live position and an honest wait range.
        </Feature>
        <Feature icon={<MessageCircle className="size-5" aria-hidden />} title="WhatsApp only">
          Every update goes to WhatsApp — confirmation, "you're getting close", table
          ready, grace nudge. No SMS anywhere, so no DLT paperwork and no per-message bill.
        </Feature>
        <Feature icon={<Box className="size-5" aria-hidden />} title="A 3D floor plan">
          Pro turns your restaurant into a rotatable, zoomable floor plan that colours
          itself live. Tap a guest, tap a table, they're seated.
        </Feature>
        <Feature icon={<BarChart3 className="size-5" aria-hidden />} title="Numbers that bite">
          Not a stats page. Where you lose guests by wait bucket, which zone is the
          bottleneck, and whether your own wait estimates are actually trustworthy.
        </Feature>
      </section>

      <section className="mt-16 grid gap-4 md:grid-cols-2">
        {[PLANS.basic, PLANS.pro].map((plan) => (
          <div
            key={plan.tier}
            className={
              plan.tier === "pro"
                ? "rounded-2xl border-2 border-saffron-400 bg-saffron-50 p-6"
                : "rounded-2xl border border-ink-200 bg-white p-6"
            }
          >
            <h2 className="text-lg font-semibold text-ink-900">{plan.name}</h2>
            <p className="mt-2 text-3xl font-bold text-ink-900">
              ₹{plan.priceInr.toLocaleString("en-IN")}
              <span className="ml-1 text-sm font-normal text-ink-500">/outlet/month</span>
            </p>
            <ul className="mt-4 space-y-1.5 text-sm text-ink-600">
              {plan.features.map((f) => <li key={f}>· {f}</li>)}
            </ul>
          </div>
        ))}
      </section>

      <footer className="mt-16 border-t border-ink-200 pt-6 text-sm text-ink-400">
        Baari · Built for Indian restaurants. Guest numbers are used only for the visit
        and deleted automatically afterwards.
      </footer>
    </main>
  );
}

function Feature({
  icon, title, children,
}: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="inline-flex size-10 items-center justify-center rounded-xl bg-saffron-100 text-saffron-700">
        {icon}
      </span>
      <h3 className="mt-3 font-semibold text-ink-900">{title}</h3>
      <p className="mt-1 text-sm text-ink-500">{children}</p>
    </div>
  );
}
