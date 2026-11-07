type ProjectMetricInput = { status: string; progress: number; dueDate: string | null };

export function jakartaDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
}

export function projectMetrics(project: ProjectMetricInput, today = jakartaDate()) {
  const isOpen = project.status !== "PUBLISHED" && project.status !== "CANCELLED" && project.progress < 100;
  const isOverdue = Boolean(project.dueDate && project.dueDate < today && isOpen);
  const qualityIssue = (project.progress === 100 && project.status === "BACKLOG") || (project.progress < 100 && project.status === "PUBLISHED");
  return { isOpen, isOverdue, qualityIssue };
}
