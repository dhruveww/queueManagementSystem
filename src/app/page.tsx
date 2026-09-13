import { PLANS } from "@/lib/billing/razorpay";
import { Benefits } from "@/components/site/Benefits";
import { Contact } from "@/components/site/Contact";
import { DemoSection } from "@/components/site/DemoSection";
import { Faq } from "@/components/site/Faq";
import { Hero } from "@/components/site/Hero";
import { Nav } from "@/components/site/Nav";
import { Pricing, type PlanCard } from "@/components/site/Pricing";
import { ScrollProgress } from "@/components/site/primitives";
import { Usp } from "@/components/site/Usp";

/**
 * The product site. Prices come from the same `PLANS` the billing flow charges
 * against, so the page can never quote a number Razorpay won't honour.
 */
export default function Home() {
  const plans: PlanCard[] = [PLANS.basic, PLANS.pro].map((p) => ({
    tier: p.tier,
    name: p.name,
    priceInr: p.priceInr,
    features: p.features,
  }));

  return (
    <div className="site">
      <ScrollProgress />
      <Nav />
      <main>
        <Hero />
        <DemoSection />
        <Benefits />
        <Usp />
        <Pricing plans={plans} />
        <Faq />
        <Contact />
      </main>
    </div>
  );
}
