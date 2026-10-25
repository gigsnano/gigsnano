import type { Metadata } from "next";

import { MobileDesignSystem } from "@/components/design-system/mobile/mobile-design-system";

export const metadata: Metadata = {
  title: "Mobile design system · GigsNano",
  robots: { index: false },
};

export default function MobileDesignSystemPage() {
  return <MobileDesignSystem />;
}
