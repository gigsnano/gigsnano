import { cn } from "@/lib/utils";
import type { IProject } from "@/types";

export type ProjectLogoSize = "xs" | "sm" | "md" | "lg";

const SIZE: Record<ProjectLogoSize, { box: string; rounded: string; text: string }> = {
  xs: { box: "size-5", rounded: "rounded", text: "text-xs" },
  sm: { box: "size-7", rounded: "rounded-md", text: "text-sm" },
  md: { box: "size-9", rounded: "rounded-md", text: "text-base" },
  lg: { box: "size-14", rounded: "rounded-xl", text: "text-3xl" },
};

/** The fields ProjectLogo needs — a Pick so partial project shapes work too. */
export type ProjectLogoData = Pick<
  IProject,
  "logo_image_url" | "logo_emoji" | "identifier"
> & { name?: string };

/**
 * The project's logo, shown everywhere a project is listed (GIN-44). Precedence:
 * uploaded image → emoji → identifier initials. Caller supplies the frame
 * (border/bg/shadow/position) via `className`; this renders the content sized to
 * fill. `logo_color` is intentionally ignored — the create flow never sets it.
 */
export function ProjectLogo({
  project,
  size = "md",
  className,
}: {
  project: ProjectLogoData;
  size?: ProjectLogoSize;
  className?: string;
}) {
  const s = SIZE[size];
  const box = cn(
    "flex shrink-0 items-center justify-center overflow-hidden",
    s.box,
    s.rounded,
    className,
  );

  if (project.logo_image_url) {
    return (
      // Capability URL to a user upload — not a Next-optimizable static asset.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={project.logo_image_url}
        alt={`${project.name ?? "Project"} logo`}
        className={cn(box, "object-cover")}
      />
    );
  }

  return (
    <span className={cn(box, s.text)}>
      {project.logo_emoji ? (
        <span aria-hidden>{project.logo_emoji}</span>
      ) : (
        <span className="text-[0.7em] font-bold uppercase leading-none text-primary">
          {project.identifier}
        </span>
      )}
    </span>
  );
}
