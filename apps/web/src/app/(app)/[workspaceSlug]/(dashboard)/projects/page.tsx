import { ProjectsPage } from "@/components/projects/projects-page";

export default async function ProjectsRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return <ProjectsPage workspaceSlug={workspaceSlug} />;
}
