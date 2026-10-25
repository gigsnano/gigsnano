import { AccountSettingsOpener } from "@/components/account/account-settings-opener";

export default async function AccountSettingsTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;
  return <AccountSettingsOpener tab={tab} />;
}
