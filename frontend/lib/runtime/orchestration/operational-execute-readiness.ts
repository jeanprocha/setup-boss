import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";
import type { RunGitSummaryDto } from "../../api/runtime-types.ts";

/** Fases do job (`metadata.uiPhase`) que bloqueiam execute antes dos gates reais. */
export function isStaleEarlyJobPhase(phaseRaw: string | null | undefined): boolean {
  const p = String(phaseRaw || "").toLowerCase();
  return p === "intake" || p === "clarify" || p === "clarification";
}

/**
 * Artefactos operacionais indicam execução elegível apesar de `summary.phase` stale.
 * Alinhado a versionamento completo + plano aprovado (Fase 7).
 */
export function isOperationalExecuteReadyDespiteStaleJobPhase(input: {
  clarification: ClarificationBundleDto | null | undefined;
  git?: RunGitSummaryDto | null;
}): boolean {
  const clar = input.clarification;
  if (!clar) return false;

  const approval = clar.approval?.status;
  const runtimePhase = clar.session?.runtimePhase;
  const p2 = clar.session?.phase2Status;

  const approved =
    approval === "approved" || runtimePhase === "ready_for_execution";
  if (!approved) return false;

  const phase2Ready =
    !p2 ||
    p2 === "ready_for_execution" ||
    runtimePhase === "ready_for_execution";
  if (!phase2Ready) return false;

  return String(input.git?.status ?? "") === "git_branch_ready";
}

/** Se o guard `execution_not_applicable` deve bloquear (fase job stale sem artefactos prontos). */
export function shouldBlockExecutionNotApplicable(input: {
  phaseRaw?: string | null;
  clarification: ClarificationBundleDto | null | undefined;
  git?: RunGitSummaryDto | null;
}): boolean {
  const phase = String(input.phaseRaw || "").toLowerCase();
  if (phase !== "intake" && phase !== "clarify" && phase !== "clarification") {
    return false;
  }
  return !isOperationalExecuteReadyDespiteStaleJobPhase({
    clarification: input.clarification,
    git: input.git,
  });
}

export function describeOperationalExecuteReadiness(input: {
  clarification: ClarificationBundleDto | null | undefined;
  git?: RunGitSummaryDto | null;
}): Record<string, string | null> {
  const clar = input.clarification;
  return {
    approval: clar?.approval?.status ?? null,
    runtimePhase: clar?.session?.runtimePhase ?? null,
    phase2Status: clar?.session?.phase2Status ?? null,
    gitStatus: input.git?.status ?? null,
    activityBranch: input.git?.activityBranch ?? null,
  };
}
