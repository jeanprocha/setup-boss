import type { ApiJobSummary, RunSummaryDto } from "@/lib/api/runtime-types";
import { deriveHonestRunDisplay } from "@/lib/runtime/adapters/derive-honest-run-display";
import {
  mapApiGitSummary,
  resolveBranchHintFromJob,
} from "@/lib/runtime/adapters/map-run-git-summary";
import { resolveRunTaskInput } from "@/lib/runtime/run/resolve-run-task-input";

function basenameTask(taskArg: string | null | undefined): string {
  if (!taskArg) return "job";
  const s = String(taskArg).replace(/\\/g, "/");
  const seg = s.split("/").pop();
  return seg && seg.trim() ? seg.trim() : s;
}

function humanRunLabel(
  taskArg: string | null | undefined,
  runId: string | null | undefined,
): string {
  const base = basenameTask(taskArg);
  if (/task\.md$/i.test(base)) {
    const rid = runId?.trim();
    if (rid && base.includes(rid)) {
      return `Atividade · ${rid.slice(0, 10)}…`;
    }
    const m = /^(\d{8}-\d+)/.exec(base);
    if (m) return `Atividade · ${m[1]}…`;
    return "Atividade";
  }
  return base;
}

function formatClock(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return d.toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function mapStatusToPhase(status: string): string {
  switch (status) {
    case "running":
      return "execution";
    case "pending":
      return "queue";
    case "completed":
      return "done";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return status || "unknown";
  }
}

function phaseFromJobMetadata(job: ApiJobSummary, status: string): string {
  const meta = job.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const uiPhase = meta.uiPhase ?? meta.ui_phase;
    if (typeof uiPhase === "string" && uiPhase.trim()) return uiPhase.trim();
  }
  return mapStatusToPhase(status);
}

export function mapApiJobToRunSummary(job: ApiJobSummary): RunSummaryDto {
  const status = String(job.status || "");
  const meta =
    job.metadata && typeof job.metadata === "object" && !Array.isArray(job.metadata)
      ? job.metadata
      : null;
  const honest = deriveHonestRunDisplay(status, meta);
  const fromApi =
    typeof job.activityTitle === "string" && job.activityTitle.trim()
      ? job.activityTitle.trim()
      : null;

  const label = fromApi || humanRunLabel(job.taskArg, job.runId != null ? String(job.runId) : null);
  const git = mapApiGitSummary(job.git);

  return {
    id: String(job.id),
    runId: job.runId != null ? String(job.runId) : null,
    projectId: job.projectId != null ? String(job.projectId) : null,
    label,
    activityTitle: job.activityTitle != null ? String(job.activityTitle) : null,
    taskInput: resolveRunTaskInput({ taskArg: job.taskArg, metadata: meta }),
    archived: job.archived === true,
    phase: phaseFromJobMetadata(job, status),
    state: honest.state,
    operationalStatusKey: honest.operationalStatusKey,
    startedAtLabel: formatClock(job.startedAt ?? job.createdAt),
    branchHint: resolveBranchHintFromJob(job),
    git,
    jobStatus: status,
    retryable: job.retryable === true,
  };
}
