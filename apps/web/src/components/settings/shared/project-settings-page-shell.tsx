import { cn } from "@/lib/utils";

export function ProjectSettingsPageShell({
  title,
  description,
  width = "default",
  children,
}: {
  title: string;
  description: string;
  /** `wide` for tool pages (document import, repository files). */
  width?: "default" | "wide";
  children: React.ReactNode;
}) {
  return (
    <div className={cn("px-10 py-8", width === "wide" ? "max-w-5xl" : "max-w-2xl")}>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}
