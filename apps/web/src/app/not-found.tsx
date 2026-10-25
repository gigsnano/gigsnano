import { EmptyState } from "@/components/empty-state";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center">
      <EmptyState
        assetKey="error-404"
        title="Page not found"
        description="This page doesn't exist or may have moved. Let's get you back on track."
        actions={[{ label: "Back to home", href: "/" }]}
      />
    </main>
  );
}
