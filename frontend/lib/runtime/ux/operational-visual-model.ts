import type { RunUxActiveStep, RuntimeUxEvent, RuntimeUxKind } from "./runtime-ux-types.ts";

/** Passos visíveis na timeline operacional simplificada (UX-C). */
export type OperationalVisualStepId =
  | "intake"
  | "clarification"
  | "refined_plan"
  | "versioning"
  | "execution"
  | "completed";

export const OPERATIONAL_VISUAL_STEP_ORDER: readonly OperationalVisualStepId[] =
  [
    "intake",
    "clarification",
    "refined_plan",
    "versioning",
    "execution",
    "completed",
  ] as const;

export const OPERATIONAL_VISUAL_STEP_LABELS: Record<
  OperationalVisualStepId,
  string
> = {
  intake: "Intake",
  clarification: "Clarificação",
  refined_plan: "Plano refinado",
  versioning: "Versionamento",
  execution: "Execução",
  completed: "Concluído",
};

const INTERNAL_TO_VISUAL: Record<RunUxActiveStep, OperationalVisualStepId | "failed"> =
  {
    intake: "intake",
    clarification: "clarification",
    plan: "refined_plan",
    approval: "refined_plan",
    git: "versioning",
    strategy: "execution",
    execution: "execution",
    review: "execution",
    correction: "execution",
    completed: "completed",
    failed: "failed",
  };

const KIND_TO_VISUAL_CHECKPOINT: Partial<
  Record<RuntimeUxKind, OperationalVisualStepId>
> = {
  intake: "intake",
  clarification: "clarification",
  plan: "refined_plan",
  approval: "refined_plan",
  git: "versioning",
  strategy: "execution",
  execution: "execution",
  review: "execution",
  correction: "execution",
  knowledge: "execution",
  workspace: "execution",
};

const EXECUTION_MACRO_KINDS = new Set<RuntimeUxKind>([
  "strategy",
  "execution",
  "review",
  "correction",
  "knowledge",
  "workspace",
]);

export function mapInternalActiveStepToVisual(
  step: RunUxActiveStep,
): OperationalVisualStepId | "failed" {
  return INTERNAL_TO_VISUAL[step] ?? "execution";
}

export function mapUxKindToVisualCheckpoint(
  kind: RuntimeUxKind,
): OperationalVisualStepId | null {
  return KIND_TO_VISUAL_CHECKPOINT[kind] ?? null;
}

export function isExecutionMacroKind(kind: RuntimeUxKind): boolean {
  return EXECUTION_MACRO_KINDS.has(kind);
}

export function visualStepLabel(
  step: OperationalVisualStepId | "failed" | "waiting_action",
): string {
  if (step === "failed") return "Falhou";
  if (step === "waiting_action") return "Aguardando ação";
  return OPERATIONAL_VISUAL_STEP_LABELS[step];
}

function readEventType(ev: RuntimeUxEvent): string {
  const raw = ev.raw as { type?: string } | undefined;
  return String(raw?.type ?? "").toLowerCase();
}

function readEventData(ev: RuntimeUxEvent): Record<string, unknown> {
  const raw = ev.raw as { data?: Record<string, unknown> } | undefined;
  return raw?.data && typeof raw.data === "object" ? raw.data : {};
}

/** Mensagem viva do macro-step Execução a partir do último evento relevante. */
export function executionMacroActivityMessage(
  last: RuntimeUxEvent | null,
): string {
  if (!last) return "A preparar execução…";

  const t = readEventType(last);
  const msg = last.message?.trim();

  if (t === "strategy_started" || t === "strategy_requested") {
    return "A analisar e planear alterações…";
  }
  if (t === "strategy_completed") {
    if (readEventData(last).skipped === true) {
      return "A iniciar alterações no código…";
    }
    return msg || "A iniciar alterações no código…";
  }
  if (t === "strategy_failed") {
    return msg || "Falha ao planear execução.";
  }
  if (t === "execution_started" || t === "execution_triggered") {
    return msg || "A executar alterações…";
  }
  if (t === "review_started") {
    return "A executar revisão automática…";
  }
  if (t === "review_completed" || t === "review_rejected") {
    return msg || "Revisão automática em curso…";
  }
  if (t === "correction_started") {
    return "A aplicar correção…";
  }
  if (t === "correction_completed") {
    return msg || "Correção aplicada.";
  }
  if (/knowledge/.test(t)) {
    return "A atualizar base de conhecimento…";
  }
  if (last.title?.trim() && !/estratégia/i.test(last.title)) {
    return last.title.trim();
  }
  if (msg) return msg;
  return "Execução em curso…";
}

export type VersioningCheckpointContext = {
  branch?: string | null;
  gitStatus?: string | null;
  preparePending?: boolean;
  executeBlockCode?: string | null;
};

/** Mensagens do checkpoint Versionamento. */
export function versioningCheckpointMessage(
  status: "pending" | "active" | "waiting" | "completed" | "failed",
  ctx: VersioningCheckpointContext,
): string {
  const branch = ctx.branch?.trim();
  if (status === "completed" && branch) {
    return `Branch pronta para execução: ${branch}`;
  }
  if (status === "completed") {
    return "Branch pronta para execução";
  }
  if (status === "failed") {
    return "Falha ao preparar branch";
  }
  if (ctx.preparePending || ctx.gitStatus === "git_branch_pending") {
    return branch
      ? `Preparando branch ${branch}…`
      : "Preparando branch feature/…";
  }
  if (status === "waiting" || status === "active") {
    if (branch) return `Preparando branch ${branch}…`;
    return "Branch ainda não preparada";
  }
  if (
    ctx.executeBlockCode === "git_branch_required" ||
    ctx.gitStatus === undefined
  ) {
    return "Branch ainda não preparada";
  }
  return "";
}

export function needsVersioningPrepareCta(ctx: VersioningCheckpointContext): boolean {
  if (ctx.preparePending || ctx.gitStatus === "git_branch_pending") {
    return false;
  }
  if (ctx.gitStatus === "git_branch_ready") return false;
  if (ctx.executeBlockCode === "git_branch_required") return true;
  if (ctx.gitStatus === "git_branch_failed") return true;
  return false;
}
