import { SignInForm } from "@/components/auth/sign-in-form";
import { AuthPageShell } from "@/components/auth/auth-page-shell";

export default function SignInPage() {
  return (
    <AuthPageShell>
      <SignInForm />
    </AuthPageShell>
  );
}
