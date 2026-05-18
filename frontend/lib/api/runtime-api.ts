import {
  runtimeDeleteJson,
  runtimeGetJson,
  runtimePostJson,
} from "@/lib/api/client";
import { isRunReadModelConflictError } from "@/lib/runtime/run-read-model-http";
import type {
  ArtifactContentJson,
  RunEvidenceJson,
} from "@/lib/api/evidence-types";
import type {
  ArtifactContentDto,
  RunEvidenceDto,
} from "@/lib/api/evidence-types";
import type {
  ApiJobSummary,
  ApiProjectRow,
  ApiRuntimeEventRow,
  RuntimeHealthDto,
  RuntimeHeartbeatDto,
  RunObservabilityBundleDto,
} from "@/lib/api/runtime-types";
import type { StructuredPreRunError } from "@/lib/runtime/intake/pre-run-error";
import {
  parseProjectGovernanceUx,
  type ProjectGovernanceUx,
} from "@/lib/runtime/governance/ia-governance-ux";

type HealthJson = {
  ok?: boolean;
  daemon?: string;
  pid?: number | null;
  uptimeMs?: number | null;
};

type ProjectsJson = { ok?: boolean; data?: ApiProjectRow[] };

type ProjectBundleJson = {
  ok?: boolean;
  data?: { recentJobs?: ApiJobSummary[] };
};

type EventsJson = { ok?: boolean; data?: ApiRuntimeEventRow[] };

type RunObservabilityJson = { ok?: boolean; data?: RunObservabilityBundleDto };

export async function fetchRunObservabilityBundle(
  runKey: string,
): Promise<RunObservabilityBundleDto | null> {
  const enc = encodeURIComponent(String(runKey || "").trim());
  if (!enc) return null;
  try {
    const j = (await runtimeGetJson<RunObservabilityJson>(
      `/runs/${enc}/runtime-observability`,
      { timeoutMs: 22_000 },
    )) as RunObservabilityJson;
    if (!j.ok || !j.data) return null;
    return j.data;
  } catch {
    return null;
  }
}

type StatusJson = {
  ok?: boolean;
  data?: {
    queue?: { health?: string };
  };
};

type HeartbeatJson = { ok?: boolean; data?: RuntimeHeartbeatDto };

export async function fetchRuntimeHealth(): Promise<RuntimeHealthDto> {
  const j = (await runtimeGetJson<HealthJson>("/health")) ?? {};
  return {
    ok: Boolean(j.ok),
    daemon:
      j.daemon === "running" || j.daemon === "stopped"
        ? j.daemon
        : String(j.daemon || "unknown"),
    pid: typeof j.pid === "number" ? j.pid : null,
    uptimeMs: typeof j.uptimeMs === "number" ? j.uptimeMs : null,
  };
}

export async function fetchRuntimeHeartbeat(): Promise<RuntimeHeartbeatDto | null> {
  try {
    const j = (await runtimeGetJson<HeartbeatJson>("/runtime/heartbeat", {
      timeoutMs: 6000,
    })) as HeartbeatJson;
    if (!j.ok || !j.data) return null;
    const d = j.data;
    return {
      daemonAlive: Boolean(d.daemonAlive),
      runningJobsCount:
        typeof d.runningJobsCount === "number" && Number.isFinite(d.runningJobsCount)
          ? d.runningJobsCount
          : 0,
      currentJobId:
        d.currentJobId != null && String(d.currentJobId).trim()
          ? String(d.currentJobId)
          : null,
      currentRunId:
        d.currentRunId != null && String(d.currentRunId).trim()
          ? String(d.currentRunId)
          : null,
      lastRuntimeActivityAt:
        typeof d.lastRuntimeActivityAt === "string" ? d.lastRuntimeActivityAt : null,
      workerState: d.workerState === "busy" ? "busy" : "idle",
      queueSize:
        typeof d.queueSize === "number" && Number.isFinite(d.queueSize) ? d.queueSize : 0,
      daemonStartedAt:
        typeof d.daemonStartedAt === "string" ? d.daemonStartedAt : null,
      updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function fetchRuntimeStatusQueueHealth(): Promise<
  "ok" | "degraded" | "unknown"
> {
  try {
    const j = (await runtimeGetJson<StatusJson>("/status", {
      timeoutMs: 6000,
    })) as StatusJson;
    const h = j.data?.queue?.health;
    if (h === "ok" || h === "degraded") return h;
    return "unknown";
  } catch {
    return "unknown";
  }
}

export async function fetchRuntimeProjects(): Promise<ApiProjectRow[]> {
  const j = (await runtimeGetJson<ProjectsJson>("/projects")) as ProjectsJson;
  if (!j.ok || !Array.isArray(j.data)) {
    throw new Error("runtime_projects_contract");
  }
  return j.data;
}

export async function fetchRuntimeProjectRecentJobs(
  projectId: string,
  opts?: { includeArchived?: boolean },
): Promise<ApiJobSummary[]> {
  const enc = encodeURIComponent(projectId);
  const sp = new URLSearchParams();
  if (opts?.includeArchived) sp.set("includeArchived", "1");
  const q = sp.toString();
  const j = (await runtimeGetJson<ProjectBundleJson>(
    `/projects/${enc}${q ? `?${q}` : ""}`,
    { timeoutMs: 12_000 },
  )) as ProjectBundleJson;
  if (!j.ok || !j.data || !Array.isArray(j.data.recentJobs)) {
    return [];
  }
  return j.data.recentJobs;
}

export async function postArchiveRun(runIdOrJobId: string): Promise<{
  ok: boolean;
  data?: { archivedAt?: string; runId?: string | null; jobId?: string };
}> {
  const enc = encodeURIComponent(runIdOrJobId);
  return runtimePostJson(`/runs/${enc}/archive`, {}, { timeoutMs: 15_000 });
}

export async function postDeleteRun(runIdOrJobId: string): Promise<{
  ok: boolean;
  data?: { runId?: string | null; jobId?: string };
}> {
  const enc = encodeURIComponent(runIdOrJobId);
  return runtimePostJson(`/runs/${enc}/delete`, {}, { timeoutMs: 15_000 });
}

export async function deleteRuntimeProject(projectId: string): Promise<{
  ok: boolean;
  data?: {
    projectId: string;
    removedJobs: number;
    registryRemoved: boolean;
  };
}> {
  const enc = encodeURIComponent(String(projectId || "").trim());
  return runtimeDeleteJson(`/projects/${enc}`, { timeoutMs: 45_000 });
}

export async function fetchRunEvidence(
  runIdOrJobId: string,
): Promise<RunEvidenceDto | null> {
  const enc = encodeURIComponent(runIdOrJobId);
  try {
    const j = (await runtimeGetJson<RunEvidenceJson>(
      `/runs/${enc}/evidence`,
      { timeoutMs: 12_000 },
    )) as RunEvidenceJson;
    if (!j.ok || !j.data) return null;
    return j.data;
  } catch (e) {
    if (isRunReadModelConflictError(e)) {
      return null;
    }
    throw e;
  }
}

export async function fetchArtifactContent(
  runIdOrJobId: string,
  artifactId: string,
): Promise<ArtifactContentDto | null> {
  const encRun = encodeURIComponent(runIdOrJobId);
  const encArt = encodeURIComponent(artifactId);
  const j = (await runtimeGetJson<ArtifactContentJson>(
    `/runs/${encRun}/artifacts/${encArt}`,
    { timeoutMs: 12_000 },
  )) as ArtifactContentJson;
  if (!j.ok || !j.data) return null;
  return j.data;
}

export async function fetchRuntimeEvents(opts: {
  projectId?: string | null;
  limit?: number;
  runKey?: string | null;
}): Promise<ApiRuntimeEventRow[]> {
  const lim = opts.limit ?? 120;
  const params = new URLSearchParams();
  params.set("limit", String(lim));
  if (opts.projectId) params.set("projectId", opts.projectId);
  if (opts.runKey) params.set("runKey", String(opts.runKey).trim());
  const j = (await runtimeGetJson<EventsJson>(
    `/events?${params.toString()}`,
  )) as EventsJson;
  if (!j.ok || !Array.isArray(j.data)) {
    return [];
  }
  return j.data;
}

type PreRunDiagnosticsJson = {
  ok?: boolean;
  data?: {
    channel?: string;
    limit?: number;
    code?: string;
    phase?: string;
    events?: StructuredPreRunError[];
  };
};

type ProjectGovernanceJson = {
  ok?: boolean;
  data?: Record<string, unknown>;
};

export async function fetchProjectGovernance(
  projectId: string,
): Promise<ProjectGovernanceUx | null> {
  const enc = encodeURIComponent(String(projectId || "").trim());
  if (!enc) return null;
  try {
    const j = (await runtimeGetJson<ProjectGovernanceJson>(
      `/projects/${enc}/governance`,
      { timeoutMs: 45_000 },
    )) as ProjectGovernanceJson;
    if (!j.ok || !j.data) return null;
    return parseProjectGovernanceUx(j.data);
  } catch {
    return null;
  }
}

export async function fetchPreRunDiagnosticEvents(opts: {
  projectId?: string | null;
  limit?: number;
  code?: string | null;
  phase?: string | null;
}): Promise<StructuredPreRunError[]> {
  const params = new URLSearchParams();
  params.set("channel", "pre_run");
  params.set("limit", String(opts.limit ?? 40));
  if (opts.projectId) params.set("projectId", opts.projectId);
  if (opts.code) params.set("code", opts.code);
  if (opts.phase) params.set("phase", opts.phase);
  try {
    const j = (await runtimeGetJson<PreRunDiagnosticsJson>(
      `/diagnostics/events?${params.toString()}`,
      { timeoutMs: 12_000 },
    )) as PreRunDiagnosticsJson;
    if (!j.ok || !j.data?.events) return [];
    return j.data.events;
  } catch {
    return [];
  }
}
