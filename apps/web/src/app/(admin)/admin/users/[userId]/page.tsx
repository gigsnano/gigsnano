import { UserDetailPage } from "@/components/admin/users/user-detail-page";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return <UserDetailPage userId={userId} />;
}
