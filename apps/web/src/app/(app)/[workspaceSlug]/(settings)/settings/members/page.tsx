import { MembersList } from "@/components/members/members-list";

export default async function MembersSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return (
    // Wider than the max-w-2xl the form-shaped settings pages use: this one is a
    // five-column table, and at prose width the columns crush each other. Billing
    // widens for the same reason.
    <div className="max-w-5xl px-10 py-8">
      <h1 className="text-lg font-semibold">Members</h1>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">People with access to this workspace.</p>
      <MembersList workspaceSlug={workspaceSlug} />
    </div>
  );
}
