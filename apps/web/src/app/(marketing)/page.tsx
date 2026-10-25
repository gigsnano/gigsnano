import type { Metadata } from "next";

import { Hero } from "@/components/marketing/landing/hero";
import { FeaturePillars } from "@/components/marketing/landing/feature-pillars";
import { AgentPipeline } from "@/components/marketing/landing/agent-pipeline";
import { StatsBand } from "@/components/marketing/landing/stats-band";
import { HowItWorks } from "@/components/marketing/landing/how-it-works";
import { ProductShowcases } from "@/components/marketing/landing/product-showcase";
import { IntegrationsMarquee } from "@/components/marketing/landing/integrations-marquee";
import { FeatureGrid } from "@/components/marketing/landing/feature-grid";
import { Pricing } from "@/components/marketing/landing/pricing";
import { CtaBand } from "@/components/marketing/landing/cta-band";

export const metadata: Metadata = {
  title: "GigsNano — AI-native project management",
  description:
    "Plan greenfield and brownfield projects through a guided Sprint-0 — brief, PRD, architecture, epics, and sprint plan — with a specialized BMAD agent on every card.",
};

export default function MarketingPage() {
  return (
    <>
      <Hero />
      <FeaturePillars />
      <AgentPipeline />
      <StatsBand />
      <HowItWorks />
      <ProductShowcases />
      <IntegrationsMarquee />
      <FeatureGrid />
      <Pricing />
      <CtaBand />
    </>
  );
}
