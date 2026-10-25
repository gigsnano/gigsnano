import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { InvitationAcceptForm } from "@/components/auth/invitation-accept-form";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <AuthPageShell>
      <InvitationAcceptForm token={token} />
    </AuthPageShell>
  );
}
