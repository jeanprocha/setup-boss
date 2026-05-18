/** Fase SSE para decisões de polling (P1d). */
export type MissionSsePhase =
  | "connected"
  | "reconnecting"
  | "degraded"
  | "disconnected"
  | "idle"
  | string;

export function isValidRunSelectionKey(runKey: string | null | undefined): boolean {
  return Boolean(runKey && String(runKey).trim());
}

export function isSseTransportLive(phase: MissionSsePhase): boolean {
  return phase === "connected";
}

/** Pre-run: só quando não há corrida activa na shell. */
export function preRunDiagnosticsPollPolicy(opts: {
  reachable: boolean;
  hasProject: boolean;
  hasActiveRun: boolean;
}): { enabled: boolean; intervalMs: number | false } {
  if (!opts.reachable || !opts.hasProject || opts.hasActiveRun) {
    return { enabled: false, intervalMs: false };
  }
  return { enabled: true, intervalMs: 15_000 };
}

/** Governance: só com projectId válido no registry e runtime online. */
export function governanceQueryEnabled(opts: {
  governanceEnabled: boolean;
}): boolean {
  return opts.governanceEnabled;
}

/** Eventos runtime: fallback lento com SSE; mais frequente offline/degraded. */
export function runtimeEventsPollIntervalMs(opts: {
  reachable: boolean;
  ssePhase: MissionSsePhase;
}): number | false {
  if (!opts.reachable) return false;
  if (isSseTransportLive(opts.ssePhase)) return 90_000;
  if (opts.ssePhase === "reconnecting" || opts.ssePhase === "degraded") {
    return 22_000;
  }
  return 14_000;
}

/** Execução: só com runKey válida e orquestração activa. */
export function executionPollIntervalMs(opts: {
  reachable: boolean;
  runKeyValid: boolean;
  orchestrationActive: boolean;
  sseConnected: boolean;
}): number | false {
  if (!opts.reachable || !opts.runKeyValid || !opts.orchestrationActive) {
    return false;
  }
  if (opts.sseConnected) return 28_000;
  return 12_000;
}

/** Bundle observability por run. */
export function runObservabilityPollIntervalMs(opts: {
  reachable: boolean;
  runKeyValid: boolean;
  sseConnected: boolean;
}): number | false {
  if (!opts.reachable || !opts.runKeyValid) return false;
  if (opts.sseConnected) return 45_000;
  return 20_000;
}

/** Lista de runs: mais lenta com SSE a alimentar invalidações. */
export function projectRunsPollIntervalMs(opts: {
  reachable: boolean;
  sseConnected: boolean;
}): number | false {
  if (!opts.reachable) return false;
  if (opts.sseConnected) return 28_000;
  return 20_000;
}

/** Health: mantém heartbeat sem retry agressivo. */
export function healthPollIntervalMs(queryStatus: string): number | false {
  if (queryStatus === "error") return 20_000;
  return 12_000;
}
