"use client";

import { useState } from "react";

import { ConnectedAgentsPanel } from "@/components/account/agents/connected-agents-panel";
import { TokensPanel } from "@/components/account/tokens/tokens-panel";
import { useAuthUser, useChangePassword, useUpdateAccount } from "@/hooks/auth/use-auth";
import { Button } from "@/components/ui/button";

const field =
  "h-9 w-full max-w-md rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const TITLES: Record<string, { title: string; description: string }> = {
  profile: { title: "Profile", description: "Your name and email shown across the workspace." },
  security: { title: "Security", description: "Password and session settings." },
  notifications: { title: "Notifications", description: "Email and in-app notification preferences." },
};

export function AccountSettingsForm({ tab }: { tab: string }) {
  if (tab === "agents") return <ConnectedAgentsPanel />;
  if (tab === "tokens") return <TokensPanel />;
  return <AccountSettingsFormInner tab={tab} />;
}

function AccountSettingsFormInner({ tab }: { tab: string }) {
  const { data: user } = useAuthUser();
  const update = useUpdateAccount();
  const changePassword = useChangePassword();
  const meta = TITLES[tab] ?? { title: "Settings", description: "" };

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [emailDigest, setEmailDigest] = useState(user?.email_digest ?? true);
  const [productUpdates, setProductUpdates] = useState(user?.product_updates ?? false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saved, setSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [prevUserId, setPrevUserId] = useState(user?.id);

  if (user && user.id !== prevUserId) {
    setPrevUserId(user.id);
    setDisplayName(user.display_name);
    setEmailDigest(user.email_digest);
    setProductUpdates(user.product_updates);
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === "profile") {
      await update.mutateAsync({ display_name: displayName.trim() });
    } else if (tab === "notifications") {
      await update.mutateAsync({ email_digest: emailDigest, product_updates: productUpdates });
    } else if (tab === "security") {
      setPasswordError(null);
      if (newPassword !== confirmPassword) {
        setPasswordError("New passwords do not match.");
        return;
      }
      if (newPassword.length < 8) {
        setPasswordError("New password must be at least 8 characters.");
        return;
      }
      await changePassword.mutateAsync({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <form onSubmit={onSubmit} className="max-w-2xl px-10 py-8">
      <h1 className="text-lg font-semibold">{meta.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{meta.description}</p>

      <div className="mt-6 flex flex-col gap-4">
        {tab === "profile" ? (
          <>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Display name
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Email
              <input type="email" readOnly value={user?.email ?? ""} className={field + " opacity-70"} />
            </label>
          </>
        ) : null}

        {tab === "security" ? (
          <>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Current password
              <input
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              New password
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Confirm new password
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={field}
              />
            </label>
            {passwordError ? <p className="text-sm text-destructive">{passwordError}</p> : null}
            {changePassword.isError ? (
              <p className="text-sm text-destructive">Could not update password. Try again.</p>
            ) : null}
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={changePassword.isPending}
                className="active:scale-[0.97]"
              >
                {changePassword.isPending ? "Updating…" : "Update password"}
              </Button>
              {saved ? <span className="text-sm text-emerald-600">Password updated</span> : null}
            </div>
          </>
        ) : null}

        {tab === "notifications" ? (
          <>
            <label className="flex flex-col gap-1 rounded-lg border p-3">
              <span className="text-sm font-medium">Email me about notifications</span>
              <span className="text-xs text-muted-foreground">
                Security emails (password reset, invites) always send regardless of this setting.
              </span>
              <input
                type="checkbox"
                checked={emailDigest}
                onChange={(e) => setEmailDigest(e.target.checked)}
                className="mt-2 size-4 accent-primary"
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <span className="text-sm">Product updates</span>
              <input
                type="checkbox"
                checked={productUpdates}
                onChange={(e) => setProductUpdates(e.target.checked)}
                className="size-4 accent-primary"
              />
            </label>
          </>
        ) : null}

        {tab !== "security" ? (
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={update.isPending} className="active:scale-[0.97]">
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
            {saved ? <span className="text-sm text-emerald-600">Saved</span> : null}
          </div>
        ) : null}
      </div>
    </form>
  );
}
