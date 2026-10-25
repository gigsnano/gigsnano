import type { Metadata } from "next";

import { PublicIntakeForm } from "@/components/intake/public/public-intake-form";

export const metadata: Metadata = {
  title: "Submit a request",
  description: "Send a request to the team — no account needed.",
};

export default async function PublicIntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return <PublicIntakeForm token={token} />;
}
