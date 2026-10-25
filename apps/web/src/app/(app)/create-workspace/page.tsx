import { CreateWorkspaceForm } from "@/components/auth/create-workspace-form";

export default function CreateWorkspacePage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <CreateWorkspaceForm />
    </div>
  );
}
