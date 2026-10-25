import { TransferRequestView } from "@/components/settings/project/transfer-request-view";

/** Landing page for a project-transfer email link (GIN-85). Auth-guarded by the
 *  (app) layout; the destination owner accepts or declines here. */
export default async function TransferRequestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <TransferRequestView token={token} />;
}
