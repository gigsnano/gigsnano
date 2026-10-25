import type { Metadata } from "next";
import { Suspense } from "react";

import { MobileAuthPage } from "@/components/auth/mobile-auth-page";

export const metadata: Metadata = {
  title: "Sign in to the app",
  robots: { index: false, follow: false },
};

export default function MobileAuthRoute() {
  return (
    <Suspense fallback={null}>
      <MobileAuthPage />
    </Suspense>
  );
}
