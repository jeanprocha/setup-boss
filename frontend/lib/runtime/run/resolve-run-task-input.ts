/** taskArg de job após intake costuma ser path para `.setup-boss/inbox/*-task.md`. */
const TASK_FILE_PATH_RE =
  /(?:^|[\\/])\.setup-boss[\\/]inbox[\\/].+-task\.md$/i;

function taskArgLooksLikeStoredFile(taskArg: string): boolean {
  const t = taskArg.trim();
  if (!t) return false;
  if (TASK_FILE_PATH_RE.test(t.replace(/\\/g, "/"))) return true;
  if (/[\\/]/.test(t) && /\.md$/i.test(t)) return true;
  return false;
}

export function resolveRunTaskInput(opts: {
  taskArg?: string | null;
  metadata?: Record<string, unknown> | null;
}): string | null {
  const meta = opts.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const stored =
      meta.intakeTaskText ??
      meta.intake_task_text ??
      meta.taskText ??
      meta.task_text;
    if (typeof stored === "string" && stored.trim()) {
      return stored.trim();
    }
  }

  const taskArg =
    opts.taskArg != null ? String(opts.taskArg).trim() : "";
  if (taskArg && !taskArgLooksLikeStoredFile(taskArg)) {
    return taskArg;
  }

  return null;
}
