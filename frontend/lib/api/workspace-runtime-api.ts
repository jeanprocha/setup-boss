import {
  runtimeDeleteJson,
  runtimeGetJson,
  runtimePatchJson,
  runtimePostJson,
} from "@/lib/api/client";
import type {
  SetupWorkspaceDto,
  SetupWorkspaceMutationResponse,
} from "@/lib/api/workspace-types";
import type { MiniActivityDto } from "@/lib/api/mini-activity-types";
import type { WorkspaceRunDto } from "@/lib/api/workspace-run-types";
import type {
  WorkspaceRunGitStatusResponse,
  WorkspaceRunPrepareGitResponse,
  WorkspaceGitDto,
} from "@/lib/api/workspace-git-types";
import { RuntimeApiError } from "@/lib/api/runtime-errors";

type ListJson<T> = { ok?: boolean; data?: T };

function enc(id: string) {
  return encodeURIComponent(String(id || "").trim());
}

export type WorkspaceWritePayload = {
  name?: string;
  projectIds?: string[];
};

export async function fetchWorkspaces(): Promise<SetupWorkspaceDto[]> {
  const j = await runtimeGetJson<ListJson<SetupWorkspaceDto[]>>("/workspaces", {
    timeoutMs: 12_000,
  });
  return Array.isArray(j?.data) ? j.data : [];
}

export function formatWorkspaceValidationMessage(
  err: unknown,
  fallback: string,
): string {
  if (err instanceof RuntimeApiError && err.message.trim()) {
    return err.message;
  }
  return fallback;
}

export async function postWorkspace(
  body: { name: string; projectIds: string[] },
): Promise<SetupWorkspaceDto> {
  const j = await runtimePostJson<SetupWorkspaceMutationResponse>(
    "/workspaces",
    { name: body.name.trim(), projectIds: body.projectIds },
    { timeoutMs: 15_000 },
  );
  if (!j?.data?.workspaceId) {
    throw new RuntimeApiError("Resposta inválida ao criar workspace", "contract");
  }
  return j.data;
}

export async function patchWorkspace(
  workspaceId: string,
  body: WorkspaceWritePayload,
): Promise<SetupWorkspaceDto> {
  const id = enc(workspaceId);
  const j = await runtimePatchJson<SetupWorkspaceMutationResponse>(
    `/workspaces/${id}`,
    body,
    { timeoutMs: 15_000 },
  );
  if (!j?.data?.workspaceId) {
    throw new RuntimeApiError("Resposta inválida ao actualizar workspace", "contract");
  }
  return j.data;
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const id = enc(workspaceId);
  await runtimeDeleteJson<{ ok?: boolean }>(`/workspaces/${id}`, {
    timeoutMs: 15_000,
  });
}

export type CreateWorkspaceRunPayload = {
  workspaceId: string;
  title: string;
  description?: string | null;
  status?: string;
  globalSpec?: string | Record<string, unknown> | null;
  globalPlan?: string | Record<string, unknown> | null;
  miniActivities?: Array<{
    order: number;
    title: string;
    description?: string | null;
    targetProjectId: string;
    dependsOnMiniActivityIds?: string[];
  }>;
};

export async function postWorkspaceRun(
  body: CreateWorkspaceRunPayload,
): Promise<WorkspaceRunDto> {
  const j = await runtimePostJson<{ ok?: boolean; data?: WorkspaceRunDto }>(
    "/workspace-runs",
    body,
    { timeoutMs: 30_000 },
  );
  if (!j?.data?.workspaceRunId) {
    throw new RuntimeApiError(
      "Resposta inválida ao criar WorkspaceRun",
      "contract",
    );
  }
  return j.data;
}

export type PatchWorkspaceRunPayload = {
  title?: string;
  description?: string | null;
  status?: string;
  globalSpec?: string | Record<string, unknown> | null;
  globalPlan?: string | Record<string, unknown> | null;
};

export async function patchWorkspaceRun(
  workspaceRunId: string,
  body: PatchWorkspaceRunPayload,
): Promise<WorkspaceRunDto> {
  const id = enc(workspaceRunId);
  const j = await runtimePatchJson<{ ok?: boolean; data?: WorkspaceRunDto }>(
    `/workspace-runs/${id}`,
    body,
    { timeoutMs: 20_000 },
  );
  if (!j?.data?.workspaceRunId) {
    throw new RuntimeApiError(
      "Resposta inválida ao actualizar WorkspaceRun",
      "contract",
    );
  }
  return j.data;
}

export async function fetchWorkspaceRuns(
  workspaceId?: string | null,
): Promise<WorkspaceRunDto[]> {
  const q =
    workspaceId != null && String(workspaceId).trim()
      ? `?workspaceId=${enc(workspaceId)}`
      : "";
  const j = await runtimeGetJson<ListJson<WorkspaceRunDto[]>>(
    `/workspace-runs${q}`,
    { timeoutMs: 12_000 },
  );
  return Array.isArray(j?.data) ? j.data : [];
}

export async function fetchWorkspaceRun(
  workspaceRunId: string,
): Promise<WorkspaceRunDto | null> {
  const id = enc(workspaceRunId);
  if (!id) return null;
  try {
    const j = await runtimeGetJson<ListJson<WorkspaceRunDto>>(
      `/workspace-runs/${id}`,
      { timeoutMs: 12_000 },
    );
    return j?.data ?? null;
  } catch (e) {
    if (e instanceof RuntimeApiError && e.status === 404) return null;
    throw e;
  }
}

export async function fetchWorkspaceRunGitStatus(workspaceRunId: string) {
  const id = enc(workspaceRunId);
  const j = await runtimeGetJson<WorkspaceRunGitStatusResponse>(
    `/workspace-runs/${id}/git-status`,
    { timeoutMs: 12_000 },
  );
  return j.data;
}

export async function postPrepareWorkspaceGit(
  workspaceRunId: string,
  body: {
    activityBranch?: string;
    skipProjectIds?: string[];
    force?: boolean;
  } = {},
): Promise<WorkspaceRunPrepareGitResponse> {
  const id = enc(workspaceRunId);
  return runtimePostJson<WorkspaceRunPrepareGitResponse>(
    `/workspace-runs/${id}/prepare-git`,
    body,
    { timeoutMs: 180_000 },
  );
}

export async function postRetryPrepareWorkspaceGitProject(
  workspaceRunId: string,
  projectId: string,
  body: { force?: boolean } = {},
): Promise<WorkspaceRunPrepareGitResponse> {
  return runtimePostJson<WorkspaceRunPrepareGitResponse>(
    `/workspace-runs/${enc(workspaceRunId)}/retry-prepare-git/${enc(projectId)}`,
    body,
    { timeoutMs: 180_000 },
  );
}

export async function postStartWorkspaceRun(workspaceRunId: string) {
  return runtimePostJson<{ ok: true; data: WorkspaceRunDto; meta?: Record<string, unknown> }>(
    `/workspace-runs/${enc(workspaceRunId)}/start`,
    {},
    { timeoutMs: 120_000 },
  );
}

export async function postResumeWorkspaceRun(workspaceRunId: string) {
  return runtimePostJson<{ ok: true; data: WorkspaceRunDto; meta?: Record<string, unknown> }>(
    `/workspace-runs/${enc(workspaceRunId)}/resume`,
    {},
    { timeoutMs: 120_000 },
  );
}

export async function postRetryWorkspaceMiniActivity(
  workspaceRunId: string,
  miniActivityId: string,
) {
  return runtimePostJson<{ ok: true; data: WorkspaceRunDto; meta?: Record<string, unknown> }>(
    `/workspace-runs/${enc(workspaceRunId)}/retry-mini-activity/${enc(miniActivityId)}`,
    {},
    { timeoutMs: 120_000 },
  );
}

export async function postSkipWorkspaceMiniActivity(
  workspaceRunId: string,
  miniActivityId: string,
) {
  return runtimePostJson<{ ok: true; data: WorkspaceRunDto; meta?: Record<string, unknown> }>(
    `/workspace-runs/${enc(workspaceRunId)}/skip-mini-activity/${enc(miniActivityId)}`,
    {},
    { timeoutMs: 120_000 },
  );
}

export function workspaceGitFromRun(run: WorkspaceRunDto | null): WorkspaceGitDto | null {
  return run?.git ?? null;
}

export type WorkspaceRunSyncStatusDto = {
  enabled: boolean;
  intervalMs?: number;
  effectiveIntervalMs?: number;
  cap?: number;
  activeRuns?: number;
  processedLastTick?: number;
  skippedByCapLastTick?: number;
  lastTickAt?: string | null;
  lastDurationMs?: number;
  totalTicks?: number;
  totalAdvanced?: number;
  totalCompleted?: number;
  totalFailed?: number;
  totalErrors?: number;
  sseConnectedClients?: number;
  sseEventsEmitted?: number;
};

export async function fetchWorkspaceRunSyncStatus(): Promise<WorkspaceRunSyncStatusDto | null> {
  const j = await runtimeGetJson<{
    ok?: boolean;
    data?: { workspaceRunSync?: WorkspaceRunSyncStatusDto | null };
  }>("/status", { timeoutMs: 6000 });
  const s = j?.data?.workspaceRunSync;
  if (!s || typeof s !== "object") return null;
  return {
    enabled: s.enabled !== false,
    intervalMs: typeof s.intervalMs === "number" ? s.intervalMs : undefined,
    effectiveIntervalMs:
      typeof s.effectiveIntervalMs === "number" ? s.effectiveIntervalMs : undefined,
    cap: typeof s.cap === "number" ? s.cap : undefined,
    activeRuns: typeof s.activeRuns === "number" ? s.activeRuns : undefined,
    processedLastTick:
      typeof s.processedLastTick === "number" ? s.processedLastTick : undefined,
    skippedByCapLastTick:
      typeof s.skippedByCapLastTick === "number" ? s.skippedByCapLastTick : undefined,
    lastTickAt: typeof s.lastTickAt === "string" ? s.lastTickAt : null,
    lastDurationMs: typeof s.lastDurationMs === "number" ? s.lastDurationMs : undefined,
    totalTicks: typeof s.totalTicks === "number" ? s.totalTicks : undefined,
    totalAdvanced: typeof s.totalAdvanced === "number" ? s.totalAdvanced : undefined,
    totalCompleted: typeof s.totalCompleted === "number" ? s.totalCompleted : undefined,
    totalFailed: typeof s.totalFailed === "number" ? s.totalFailed : undefined,
    totalErrors: typeof s.totalErrors === "number" ? s.totalErrors : undefined,
    sseConnectedClients:
      typeof s.sseConnectedClients === "number" ? s.sseConnectedClients : undefined,
    sseEventsEmitted:
      typeof s.sseEventsEmitted === "number" ? s.sseEventsEmitted : undefined,
  };
}
