export const runtimeQueryKeys = {
  root: ["runtime"] as const,
  health: () => [...runtimeQueryKeys.root, "health"] as const,
  status: () => [...runtimeQueryKeys.root, "status"] as const,
  heartbeat: () => [...runtimeQueryKeys.root, "heartbeat"] as const,
  projects: () => [...runtimeQueryKeys.root, "projects"] as const,
  preRunDiagnostics: () => ["runtime", "preRunDiagnostics"] as const,
  projectGovernance: (projectId: string | null) =>
    [...runtimeQueryKeys.root, "governance", projectId] as const,
  projectRuns: (projectId: string | null, includeArchived?: boolean) =>
    [
      ...runtimeQueryKeys.root,
      "projectRuns",
      projectId,
      { includeArchived: Boolean(includeArchived) },
    ] as const,
  events: (
    projectId: string | null,
    limit: number,
    runKey?: string | null,
  ) =>
    [
      ...runtimeQueryKeys.root,
      "events",
      { projectId, limit, runKey: runKey ?? null },
    ] as const,
  runObservabilityBundle: (runKey: string | null) =>
    [...runtimeQueryKeys.root, "runObservability", runKey] as const,
  runEvidence: (runKey: string | null) =>
    [...runtimeQueryKeys.root, "runEvidence", runKey] as const,
  artifactContent: (runKey: string | null, artifactId: string | null) =>
    [...runtimeQueryKeys.root, "artifactContent", { runKey, artifactId }] as const,
  clarification: (runKey: string | null) =>
    [...runtimeQueryKeys.root, "clarification", runKey] as const,
  execution: (runKey: string | null) =>
    [...runtimeQueryKeys.root, "execution", runKey] as const,
  operationalReview: (runKey: string | null) =>
    [...runtimeQueryKeys.root, "operationalReview", runKey] as const,
  operationalFinalization: (runKey: string | null) =>
    [...runtimeQueryKeys.root, "operationalFinalization", runKey] as const,
  strategy: (runKey: string | null) =>
    [...runtimeQueryKeys.root, "strategy", runKey] as const,
  workspaces: () => [...runtimeQueryKeys.root, "workspaces"] as const,
  workspaceRuns: (workspaceId: string | null) =>
    [...runtimeQueryKeys.root, "workspaceRuns", workspaceId] as const,
  workspaceRunDetail: (workspaceRunId: string | null) =>
    [...runtimeQueryKeys.root, "workspaceRunDetail", workspaceRunId] as const,
  workspaceRunGit: (workspaceRunId: string | null) =>
    [...runtimeQueryKeys.root, "workspaceRunGit", workspaceRunId] as const,
} as const;
