import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProjectWorkspace } from "@/components/project-workspace";

export default async function ProjectWorkspacePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <ProjectWorkspace projectId={id} viewer={session.user} returnToProjects={query.from === "projects"} />;
}
