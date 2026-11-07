import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return <DashboardShell viewer={session.user} />;
}
