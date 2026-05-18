import type { RunSummaryDto, RuntimeEventDto } from "@/lib/api/runtime-types";
import type { RunOperationalVm } from "@/hooks/use-run-operational";
import type { ClarificationBundleDto } from "@/lib/runtime/clarification/clarification-types";
import {
  isClarificationCollectionComplete,
  isClarificationWorkflowComplete,
} from "@/lib/runtime/clarification/clarification-operational-state";
import type { StrategyBundleDto } from "@/lib/runtime/strategy/strategy-types";
import { strategyAutoStartInProgress } from "@/lib/runtime/strategy/strategy-auto-start-policy";
import { strategyAwaitingUserKickoff } from "@/lib/runtime/strategy/strategy-operational-state";
import type { ExecutionBundleDto } from "@/lib/runtime/execution/execution-types";
import {
  integrityStateLabel,
  runPhaseDisplayLabel,
  runtimeStateShortLabel,
} from "@/lib/runtime/adapters/runtime-labels";
import { isKnowledgeBootstrapPhase } from "@/lib/runtime/knowledge/knowledge-bootstrap-types";
import {
  translateKnowledgeBootstrapPhase,
  translateRunOperationalFocus,
} from "@/lib/runtime/translation/runtime-translation-layer";
import { humanCtaToTimelineAction } from "@/lib/runtime/navigation/human-cta-to-timeline-action";
import type { OperationalPipelineRow } from "@/lib/runtime/execution/derive-operational-pipeline";
import {
  executionCardAnchorId,
  operationalToSurfaceStatus,
  type ExecutionTimelineCard,
  type ExecutionTimelineCardAction,
  type ExecutionTimelineCardHighlight,
  type ExecutionTimelineCardSection,
} from "@/lib/runtime/execution/execution-timeline-card-types";

export type BuildExecutionTimelineCardsContext = {
  rows: readonly OperationalPipelineRow[];
  runId: string | null;
  projectId: string | null;
  projectLabel: string | null;
  newActivityFlow: boolean;
  summary: RunSummaryDto | null;
  events: readonly RuntimeEventDto[];
  operational: RunOperationalVm | null;
  clarificationApplies: boolean;
  strategyApplies: boolean;
  executionApplies: boolean;
  clarificationBundle: ClarificationBundleDto | null;
  strategyBundle: StrategyBundleDto | null;
  executionBundle: ExecutionBundleDto | null;
  attentionHint: string | null;
  operationalHeadline: string | null;
  dominantStrategyHandoff: boolean;
};

function trunc(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function lastEventMatching(
  events: readonly RuntimeEventDto[],
  pred: (e: RuntimeEventDto) => boolean,
): RuntimeEventDto | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (pred(e)) return e;
  }
  return null;
}

function fmtEventTs(ev: RuntimeEventDto | null): string | null {
  if (!ev) return null;
  return ev.ts ?? null;
}

function defaultExpandedFor(
  row: OperationalPipelineRow,
  status: import("@/lib/runtime/execution/operational-step-status").OperationalStepStatus,
  opts: { humanSlot?: boolean },
): boolean {
  if (row.timelinePhase !== "current") return false;
  if (
    status === "waiting_input" ||
    status === "waiting_user" ||
    status === "blocked" ||
    status === "failed"
  )
    return true;
  return Boolean(opts.humanSlot);
}

function baseCard(
  row: OperationalPipelineRow,
  patch: Partial<ExecutionTimelineCard>,
): ExecutionTimelineCard {
  const d = row.definition;
  return {
    stepId: d.id,
    anchorId: executionCardAnchorId(d.id),
    title: d.title,
    status: row.status,
    surfaceStatus: operationalToSurfaceStatus(row.status),
    summaryLine: patch.summaryLine ?? "—",
    timestamp: patch.timestamp ?? null,
    highlights: patch.highlights ?? [],
    expandedSections: patch.expandedSections ?? [],
    actions: patch.actions ?? [],
    expandable: patch.expandable ?? true,
    defaultExpanded:
      patch.defaultExpanded ??
      defaultExpandedFor(row, row.status, { humanSlot: false }),
    priority: d.order,
    category: d.category,
    hasEmbeddedSlot: patch.hasEmbeddedSlot ?? false,
    checkpointSeverity: patch.checkpointSeverity ?? null,
  };
}

/**
 * Constrói cards a partir de `ctx.rows` já filtrado para a timeline viva
 * (`filterLiveOperationalPipelineRows`): uma linha → um card visível.
 */
export function buildExecutionTimelineCards(
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard[] {
  return ctx.rows.map((row) => buildCardForRow(row, ctx));
}

function buildCardForRow(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const id = row.definition.id;
  switch (id) {
    case "knowledge_bootstrap":
      return cardKnowledgeBootstrap(row, ctx);
    case "task_intake":
      return cardTaskIntake(row, ctx);
    case "request_received":
      return cardRequestReceived(row, ctx);
    case "run_created":
      return cardRunCreated(row, ctx);
    case "run_started":
      return cardRunStarted(row, ctx);
    case "operational_state":
      return cardOperationalState(row, ctx);
    case "clarification":
      return cardClarification(row, ctx);
    case "clarification_questions":
      return cardClarificationQuestions(row, ctx);
    case "clarification_answers":
      return cardClarificationAnswers(row, ctx);
    case "clarification_approval":
      return cardClarificationApproval(row, ctx);
    case "strategy_generated":
      return cardStrategyGenerated(row, ctx);
    case "strategy_approval":
      return cardStrategyApproval(row, ctx);
    case "execution_plan":
      return cardExecutionPlan(row, ctx);
    case "current_phase":
      return cardCurrentPhase(row, ctx);
    case "current_subtask":
      return cardCurrentSubtask(row, ctx);
    case "executor_running":
      return cardExecutorRunning(row, ctx);
    case "patch_applied":
      return cardPatchApplied(row, ctx);
    case "files_changed":
      return cardFilesChanged(row, ctx);
    case "diff_summary":
      return cardDiffSummary(row, ctx);
    case "tests_running":
      return cardTestsRunning(row, ctx);
    case "tests_result":
      return cardTestsResult(row, ctx);
    case "review_in_progress":
      return cardReviewInProgress(row, ctx);
    case "review_approved":
      return cardReviewApproved(row, ctx);
    case "review_rejected":
      return cardReviewRejected(row, ctx);
    case "auto_correction":
      return cardAutoCorrection(row, ctx);
    case "retry_execution":
      return cardRetryExecution(row, ctx);
    case "retry_review":
      return cardRetryReview(row, ctx);
    case "flow_blocked":
      return cardFlowBlocked(row, ctx);
    case "waiting_human_input":
      return cardWaitingHuman(row, ctx);
    case "waiting_approval":
      return cardWaitingApproval(row, ctx);
    case "action_required":
      return cardActionRequired(row, ctx);
    case "execution_paused":
      return cardExecutionPaused(row, ctx);
    case "execution_resumed":
      return cardExecutionResumed(row, ctx);
    case "execution_cancelled":
      return cardExecutionCancelled(row, ctx);
    case "execution_completed":
      return cardExecutionCompleted(row, ctx);
    case "final_result":
      return cardFinalResult(row, ctx);
    case "activity_summary":
      return cardActivitySummary(row, ctx);
    case "knowledge_update":
      return cardKnowledgeUpdate(row, ctx);
    case "commit_generated":
      return cardCommitGenerated(row, ctx);
    case "pr_generated":
      return cardPrGenerated(row, ctx);
    default:
      return baseCard(row, {
        summaryLine: ctx.summary?.label
          ? trunc(ctx.summary.label, 96)
          : "Sem dados desta etapa nesta vista.",
      });
  }
}

const KNOWLEDGE_FAILURE_CODES = new Set([
  "KNOWLEDGE_BASE_MISSING",
  "KNOWLEDGE_BASE_UNTRACKED",
  "KNOWLEDGE_BASE_IGNORED",
  "KNOWLEDGE_BASE_NOT_GIT",
  "KNOWLEDGE_BASE_WRONG_PATH",
  "PROJECT_ROOT_UNRESOLVED",
]);

function knowledgePhaseFromFailedEvent(
  events: readonly RuntimeEventDto[],
): import("@/lib/runtime/knowledge/knowledge-bootstrap-types").KnowledgeBootstrapPhase | null {
  const fail = [...events]
    .reverse()
    .find(
      (e) =>
        e.type === "knowledge_bootstrap_failed" ||
        (e.payload &&
          typeof e.payload === "object" &&
          KNOWLEDGE_FAILURE_CODES.has(
            String((e.payload as { code?: string }).code || ""),
          )) ||
        (e.metadata &&
          typeof e.metadata === "object" &&
          KNOWLEDGE_FAILURE_CODES.has(
            String((e.metadata as { code?: string }).code || ""),
          )),
    );
  if (!fail) return null;

  const payload =
    fail.payload && typeof fail.payload === "object"
      ? (fail.payload as { phase?: string; code?: string })
      : null;
  const meta =
    fail.metadata && typeof fail.metadata === "object"
      ? (fail.metadata as { phase?: string; code?: string })
      : null;
  const phaseRaw = payload?.phase ?? meta?.phase;
  if (isKnowledgeBootstrapPhase(phaseRaw)) return phaseRaw;

  const code = payload?.code ?? meta?.code ?? "";
  if (code === "KNOWLEDGE_BASE_UNTRACKED" || code === "KNOWLEDGE_BASE_IGNORED") {
    return "knowledge_bootstrap_untracked";
  }
  if (code === "KNOWLEDGE_BASE_WRONG_PATH") {
    return "knowledge_bootstrap_wrong_path";
  }
  return "knowledge_bootstrap_missing";
}

function cardKnowledgeBootstrap(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const failedPhase = knowledgePhaseFromFailedEvent(ctx.events);
  const kbFailed = failedPhase != null;
  const kbReady =
    !kbFailed &&
    (row.status === "completed" ||
      ctx.events.some((e) => e.type === "knowledge_bootstrap_ready"));
  const phase = kbFailed
    ? failedPhase
    : kbReady
      ? "knowledge_bootstrap_ready"
      : row.status === "running" || row.status === "active"
        ? "knowledge_bootstrap_running"
        : "knowledge_bootstrap_running";
  const human = translateKnowledgeBootstrapPhase(phase);
  const actions: ExecutionTimelineCardAction[] = [];
  if (human.cta) {
    actions.push(humanCtaToTimelineAction(human.cta, "knowledge-bootstrap-cta"));
  }
  return baseCard(row, {
    summaryLine: human.headline,
    timestamp: ctx.summary?.startedAtLabel ?? null,
    highlights: [{ label: "Base", value: "docs/.IA" }],
    expandedSections: human.description
      ? [{ title: "Detalhe", kind: "text", body: human.description }]
      : [],
    actions,
    checkpointSeverity: kbFailed ? "error" : kbReady ? "success" : "info",
  });
}

function cardTaskIntake(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const showComposer = ctx.newActivityFlow && !ctx.runId;
  const title = ctx.summary?.activityTitle?.trim() || ctx.summary?.label;
  const summaryLine = title
    ? trunc(title, 120)
    : ctx.projectLabel
      ? `Projeto ${ctx.projectLabel} — descreva o pedido abaixo.`
      : "Escolha um projeto e descreva o pedido.";
  const highlights: ExecutionTimelineCardHighlight[] = [];
  if (ctx.projectLabel)
    highlights.push({ label: "Projeto", value: ctx.projectLabel });
  if (ctx.summary?.branchHint)
    highlights.push({ label: "Branch", value: ctx.summary.branchHint });
  const sections: ExecutionTimelineCardSection[] = [];
  if (ctx.summary?.label) {
    sections.push({
      title: "Pedido (título)",
      kind: "text",
      body: ctx.summary.label,
    });
  }
  if (ctx.summary?.runId) {
    sections.push({
      title: "Corrida",
      kind: "keyValue",
      items: [
        { key: "Run", value: ctx.summary.runId },
        { key: "Estado", value: runtimeStateShortLabel(ctx.summary.state) },
      ],
    });
  }
  return baseCard(row, {
    summaryLine: showComposer
      ? ctx.projectLabel
        ? `Projeto ${ctx.projectLabel}`
        : "Descreva o pedido abaixo."
      : summaryLine,
    timestamp: showComposer ? null : (ctx.summary?.startedAtLabel ?? null),
    highlights: showComposer ? [] : highlights,
    expandedSections: showComposer ? [] : sections,
    hasEmbeddedSlot: showComposer,
    expandable: !showComposer,
    defaultExpanded: showComposer
      ? true
      : defaultExpandedFor(row, row.status, { humanSlot: showComposer }) ||
        showComposer,
  });
}

function cardRequestReceived(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const ev = lastEventMatching(ctx.events, (e) =>
    ["job_enqueued", "intake_completed"].includes(e.type.toLowerCase()),
  );
  const summaryLine = ev
    ? `Intake aceite · ${ev.type.replace(/_/g, " ")}`
    : ctx.runId
      ? "Pedido enfileirado no runtime."
      : "Aguardando envio do pedido.";
  return baseCard(row, {
    summaryLine,
    timestamp: fmtEventTs(ev),
    highlights: ev
      ? [{ label: "Canal", value: ev.channel }, { label: "Severidade", value: ev.severity }]
      : [],
    expandedSections: ev
      ? [
          {
            title: "Checkpoint",
            kind: "keyValue",
            items: [
              { key: "Tipo", value: ev.type },
              { key: "Mensagem", value: trunc(ev.message, 400) },
            ],
          },
        ]
      : [],
  });
}

function cardRunCreated(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const ev = lastEventMatching(
    ctx.events,
    (e) => e.type.toLowerCase() === "run_created",
  );
  const rid = ctx.summary?.runId ?? ctx.summary?.id ?? "—";
  const summaryLine = ev
    ? `Corrida criada · ${trunc(rid, 36)}`
    : ctx.runId
      ? `Corrida ${trunc(rid, 36)} registada.`
      : "Ainda sem corrida persistida.";
  return baseCard(row, {
    summaryLine,
    timestamp: fmtEventTs(ev),
    highlights: [
      { label: "Run", value: trunc(rid, 48) },
      ...(ctx.projectLabel
        ? [{ label: "Projeto", value: ctx.projectLabel }]
        : []),
    ],
    expandedSections: ev
      ? [
          {
            title: "Evento run_created",
            kind: "keyValue",
            items: [
              { key: "Id evento", value: ev.id },
              { key: "Mensagem", value: trunc(ev.message, 360) },
            ],
          },
        ]
      : [],
  });
}

function cardRunStarted(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const ev = lastEventMatching(
    ctx.events,
    (e) => e.type.toLowerCase() === "runtime_started",
  );
  const summaryLine = ev
    ? "Worker iniciou a corrida."
    : ctx.summary?.state === "running" ||
        (ctx.summary && ctx.summary.state !== "success")
      ? "Runtime em processamento."
      : "Arranque ainda não observado nos eventos.";
  return baseCard(row, {
    summaryLine,
    timestamp: fmtEventTs(ev),
    highlights: ev
      ? [{ label: "Canal", value: ev.channel }]
      : [],
    expandedSections: ev
      ? [{ title: "Detalhe", kind: "text", body: trunc(ev.message, 500) }]
      : [],
  });
}

function cardOperationalState(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const s = ctx.summary;
  const human =
    s &&
    translateRunOperationalFocus({
      summary: s,
      clarificationPhase:
        ctx.clarificationBundle?.session.runtimePhase ?? null,
      strategyPhase: ctx.strategyBundle?.summary.runtimePhase ?? null,
      executionPhase: ctx.executionBundle?.summary.lifecycle.phase ?? null,
    });
  const headline =
    ctx.operationalHeadline ?? human?.headline ?? (s ? runtimeStateShortLabel(s.state) : "—");
  const sections: ExecutionTimelineCardSection[] = [];
  if (human?.description) {
    sections.push({
      title: "Situação",
      kind: "text",
      body: human.description,
    });
  }
  const actions: ExecutionTimelineCardAction[] = [];
  if (human?.cta) {
    actions.push(humanCtaToTimelineAction(human.cta, "operational-focus-cta"));
  }
  if (s) {
    sections.push({
      title: "Detalhe técnico (observabilidade)",
      kind: "keyValue",
      items: [
        { key: "Fase (API)", value: s.phase },
        { key: "Estado UI", value: s.state },
        { key: "Job", value: s.jobStatus ?? "—" },
      ],
    });
  }
  if (ctx.attentionHint) {
    sections.push({
      title: "Sinal de atenção",
      kind: "warning",
      body: ctx.attentionHint,
    });
  }
  if (ctx.operational?.lastEvent) {
    const le = ctx.operational.lastEvent;
    sections.push({
      title: "Último evento",
      kind: "logPreview",
      body: `${le.ts} · ${le.type}\n${trunc(le.message, 600)}`,
    });
  }
  return baseCard(row, {
    summaryLine: trunc(headline, 140),
    timestamp: ctx.operational?.updatedAtLabel ?? null,
    highlights: s
      ? [
          { label: "Run", value: trunc(s.runId ?? s.id, 32) },
          { label: "Integridade", value: ctx.operational?.integrity ?? "—" },
        ]
      : [],
    expandedSections: sections,
    actions,
    defaultExpanded:
      defaultExpandedFor(row, row.status, { humanSlot: Boolean(ctx.attentionHint) }) ||
      Boolean(ctx.attentionHint && row.timelinePhase === "current"),
  });
}

function cardClarification(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const b = ctx.clarificationBundle;
  const collectionDone = b ? isClarificationCollectionComplete(b) : false;
  const pending =
    b?.questions.filter((q) => q.status === "pending").length ?? 0;
  const answered =
    b?.questions.filter((q) => q.status === "answered").length ?? 0;
  const summaryLine = b
    ? collectionDone
      ? answered > 0
        ? `${answered} pergunta${answered === 1 ? "" : "s"} respondida${answered === 1 ? "" : "s"} — clarificação concluída`
        : "Clarificação concluída"
      : pending > 0
        ? `${pending} pergunta${pending === 1 ? "" : "s"} por responder`
        : b.questions.length > 0
          ? "Respostas registadas — pode gerar o plano refinado"
          : "Aguarda perguntas de clarificação"
    : "Clarificação indisponível.";
  const slot =
    ctx.clarificationApplies && ctx.summary && b && !collectionDone;
  return baseCard(row, {
    summaryLine,
    timestamp: b?.session.updatedAt ?? null,
    highlights: [],
    expandedSections: [],
    hasEmbeddedSlot: Boolean(slot),
    defaultExpanded:
      defaultExpandedFor(row, row.status, { humanSlot: Boolean(slot && row.timelinePhase === "current") }) ||
      (Boolean(slot) && row.timelinePhase === "current"),
  });
}

function cardClarificationQuestions(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const qs = ctx.clarificationBundle?.questions ?? [];
  const summaryLine = qs.length
    ? `${qs.length} pergunta${qs.length === 1 ? "" : "s"}`
    : "Sem perguntas nesta etapa.";
  return baseCard(row, {
    summaryLine,
    highlights: [],
    expandedSections: [],
  });
}

function cardClarificationAnswers(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const b = ctx.clarificationBundle;
  const nQ = b?.questions.length ?? 0;
  const nA =
    b?.questions.filter((q) => q.status === "answered").length ?? 0;
  const summaryLine =
    nQ > 0
      ? nA >= nQ
        ? "Todas as perguntas respondidas"
        : `${nA} de ${nQ} respondidas`
      : "—";
  return baseCard(row, {
    summaryLine,
    highlights: [],
    expandedSections: [],
  });
}

function cardClarificationApproval(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const b = ctx.clarificationBundle;
  const a = b?.approval;
  const prev = b?.refinement;
  const st = a?.status ?? "none";
  const workflowDone = isClarificationWorkflowComplete(b?.session.runtimePhase);
  const slot =
    ctx.clarificationApplies &&
    ctx.summary &&
    b &&
    !workflowDone &&
    (prev?.available || st === "pending" || st === "rejected");
  const summaryLine =
    st === "approved"
      ? "Plano refinado aprovado"
      : st === "rejected"
        ? "Plano refinado rejeitado"
        : prev?.available
          ? trunc(prev.refinedTask ?? "Plano refinado disponível", 120)
          : st === "pending"
            ? "Aguarda aprovação do plano refinado"
            : "Plano refinado em preparação";
  return baseCard(row, {
    summaryLine,
    highlights: [],
    expandedSections: [],
    hasEmbeddedSlot: Boolean(slot),
    defaultExpanded:
      Boolean(slot && row.timelinePhase === "current") ||
      (st === "pending" && row.timelinePhase === "current" ? true : undefined),
  });
}

function cardStrategyGenerated(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const b = ctx.strategyBundle;
  const rec = b?.recommendation;
  const rp = b?.summary.runtimePhase;
  const needsRetry = strategyAwaitingUserKickoff(ctx.clarificationBundle, b);
  const autoGenerating =
    rp === "strategy_generating" ||
    strategyAutoStartInProgress(ctx.clarificationBundle, b);
  const summaryLine = autoGenerating
    ? "A gerar estratégia de execução no runtime…"
    : needsRetry
      ? "Falha ao gerar estratégia — tente novamente."
      : rec
        ? trunc(rec.executionApproach, 140)
        : "Estratégia ainda não disponível.";
  const slot = ctx.strategyApplies && ctx.summary;
  const strategyKickoffUi = needsRetry;
  const expandedSections: ExecutionTimelineCardSection[] = [];
  if (autoGenerating) {
    expandedSections.push({
      title: "Em progresso",
      kind: "text",
      body:
        "O runtime está a gerar a estratégia (decomposição, ordenação e contexto partilhado). Não é necessária acção sua neste momento.",
    });
  } else if (needsRetry) {
    expandedSections.push({
      title: "Ação necessária",
      kind: "actionRequired",
      body:
        "A geração automática da estratégia falhou. Use «Tentar gerar estratégia novamente» para repetir o POST no runtime.",
    });
  }
  if (b) {
    expandedSections.push(
      {
        title: "Abordagem",
        kind: "text",
        body: rec?.executionApproach ?? "—",
      },
      {
        title: "Riscos",
        kind: "list",
        lines: b.risks.map((r) => `${r.level}: ${r.label}`).slice(0, 12),
      },
    );
  }
  return baseCard(row, {
    summaryLine,
    highlights: autoGenerating
      ? [{ label: "Estado", value: "A gerar" }]
      : needsRetry
        ? [{ label: "Estado", value: "Falhou — retry" }]
        : b
          ? [
              {
                label: "Subtarefas",
                value: `${b.summary.readySubtaskCount}/${b.summary.subtaskCount} prontas`,
              },
              {
                label: "Risco exec.",
                value: b.complexity.executionRisk,
              },
            ]
          : [],
    expandedSections,
    actions: strategyKickoffUi
      ? [
          {
            id: "strategy-kickoff-retry",
            label: "Tentar gerar estratégia novamente",
            intent: "strategy_kickoff",
          },
        ]
      : [],
    hasEmbeddedSlot: Boolean(slot),
    defaultExpanded:
      Boolean(slot && (autoGenerating || strategyKickoffUi)) || undefined,
  });
}

function cardStrategyApproval(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const rp = ctx.strategyBundle?.summary.runtimePhase ?? "—";
  const summaryLine = `Fase runtime · ${rp}`;
  return baseCard(row, {
    summaryLine,
    expandedSections: ctx.strategyBundle
      ? [
          {
            title: "Prontidão",
            kind: "keyValue",
            items: [
              {
                key: "Readiness",
                value: ctx.strategyBundle.summary.operationalReadiness,
              },
              {
                key: "Bloqueios",
                value: String(ctx.strategyBundle.summary.blockingCount),
              },
            ],
          },
        ]
      : [],
    defaultExpanded:
      (rp === "strategy_ready" || rp === "strategy_blocked") &&
      row.timelinePhase === "current"
        ? true
        : undefined,
  });
}

function cardExecutionPlan(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const b = ctx.strategyBundle;
  const ord = b?.ordering;
  const summaryLine = ord
    ? `Plano · ${ord.orderingMode} · ${ord.sequence.length} passos`
    : "Plano macro indisponível.";
  return baseCard(row, {
    summaryLine,
    expandedSections: ord
      ? [
          {
            title: "Sequência",
            kind: "list",
            lines: ord.sequence
              .slice(0, 20)
              .map((s) => `${s.position}. ${trunc(s.title, 80)} (${s.status})`),
          },
        ]
      : [],
  });
}

function cardCurrentPhase(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const life = ctx.executionBundle?.summary.lifecycle.phase ?? "—";
  const summaryLine = `Lifecycle · ${life}`;
  return baseCard(row, {
    summaryLine,
    highlights: ctx.executionBundle
      ? [
          {
            label: "Progresso",
            value: `${ctx.executionBundle.summary.progress.completed}/${ctx.executionBundle.summary.progress.total}`,
          },
        ]
      : [],
    expandedSections: ctx.executionBundle
      ? [
          {
            title: "Execução",
            kind: "keyValue",
            items: [
              { key: "Saúde", value: ctx.executionBundle.summary.health },
              { key: "Retry", value: `${ctx.executionBundle.summary.retry.count}/${ctx.executionBundle.summary.retry.maxAttempts}` },
            ],
          },
        ]
      : [],
  });
}

function cardCurrentSubtask(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const subs = ctx.executionBundle?.subtasks ?? [];
  const id = ctx.executionBundle?.summary.lifecycle.currentSubtaskId;
  const cur = id ? subs.find((s) => s.id === id) : subs.find((s) => s.state === "running");
  const summaryLine = cur
    ? `${trunc(cur.title, 100)} · ${cur.state}`
    : "Nenhuma subtarefa activa identificada.";
  return baseCard(row, {
    summaryLine,
    expandedSections: cur
      ? [
          {
            title: "Subtarefa",
            kind: "keyValue",
            items: [
              { key: "Estado", value: cur.state },
              { key: "Review", value: cur.review.status },
              { key: "Bloqueio", value: cur.blockerLabel ?? "—" },
            ],
          },
        ]
      : [],
  });
}

function cardExecutorRunning(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const running = ctx.executionBundle?.subtasks.filter((s) => s.state === "running") ?? [];
  const summaryLine = running.length
    ? `${running.length} subtarefa(s) em execução/review`
    : "Executor idle ou fase sem subtarefa running.";
  const slot = ctx.executionApplies && ctx.summary;
  return baseCard(row, {
    summaryLine,
    highlights: running.map((s) => ({
      label: trunc(s.title, 20),
      value: s.state,
    })),
    expandedSections:
      running.length > 0
        ? [
            {
              title: "Em curso",
              kind: "list",
              lines: running.map((s) => `${s.title} · ${s.state}`),
            },
          ]
        : [],
    hasEmbeddedSlot: Boolean(slot),
    defaultExpanded:
      Boolean(slot && running.length > 0 && row.timelinePhase === "current") ||
      undefined,
  });
}

function cardPatchApplied(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const c = ctx.executionBundle?.summary.correction;
  const summaryLine = c
    ? `Correção g${c.generation} · ${c.status}`
    : "Sem ciclo de correcção activo.";
  return baseCard(row, {
    summaryLine,
    expandedSections: c
      ? [
          {
            title: "Correção",
            kind: "keyValue",
            items: [
              { key: "Resumo", value: c.summary ? trunc(c.summary, 320) : "—" },
              { key: "Rejeição", value: c.rejectionReason ? trunc(c.rejectionReason, 200) : "—" },
            ],
          },
        ]
      : [],
  });
}

function cardFilesChanged(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const arts = ctx.strategyBundle?.sharedContext.artifacts ?? [];
  const summaryLine = arts.length
    ? `${arts.length} artefacto(s) referenciados na estratégia`
    : "Lista de ficheiros alterados não exposta pelo bundle.";
  return baseCard(row, {
    summaryLine,
    expandedSections:
      arts.length > 0
        ? [{ title: "Artefactos (contexto)", kind: "list", lines: arts.slice(0, 25) }]
        : [],
  });
}

function cardDiffSummary(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const c = ctx.executionBundle?.summary.correction;
  const body = c?.summary ?? c?.rejectionReason;
  return baseCard(row, {
    summaryLine: body ? trunc(body, 120) : "Sem delta textual consolidado nesta vista.",
    expandedSections: body
      ? [{ title: "Resumo", kind: "text", body: trunc(body, 1200) }]
      : [],
  });
}

function cardTestsRunning(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  void ctx;
  return baseCard(row, {
    summaryLine:
      "O bundle de execução não expõe comando de testes — nada em curso reportado.",
    expandedSections: [
      {
        title: "Nota",
        kind: "text",
        body: "Quando o runtime publicar comandos/saída de testes, esta secção mostrará o comando activo e duração.",
      },
    ],
  });
}

function cardTestsResult(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  void ctx;
  return baseCard(row, {
    summaryLine:
      "Sem resultado agregado de testes no contrato actual do bundle.",
    expandedSections: [],
  });
}

function cardReviewInProgress(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const r = ctx.executionBundle?.summary.review;
  const summaryLine = r
    ? `Review · ${r.status}`
    : "Review indisponível.";
  return baseCard(row, {
    summaryLine,
    expandedSections: r
      ? [
          {
            title: "Estado",
            kind: "keyValue",
            items: [
              { key: "Revisor (hint)", value: r.reviewerHint ?? "—" },
              { key: "Decidido", value: r.decidedAt ?? "—" },
            ],
          },
        ]
      : [],
  });
}

function cardReviewApproved(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const r = ctx.executionBundle?.summary.review;
  return baseCard(row, {
    summaryLine:
      r?.status === "approved"
        ? "Review aprovada."
        : "Ainda sem aprovação de review registada.",
    expandedSections: [],
  });
}

function cardReviewRejected(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const r = ctx.executionBundle?.summary.review;
  const reason = r?.rejectionReason;
  return baseCard(row, {
    summaryLine: reason
      ? trunc(reason, 120)
      : "Sem motivo de rejeição persistido.",
    expandedSections: reason
      ? [{ title: "Findings", kind: "error", body: reason }]
      : [],
    defaultExpanded: Boolean(reason && row.timelinePhase === "current"),
  });
}

function cardAutoCorrection(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const c = ctx.executionBundle?.summary.correction;
  return baseCard(row, {
    summaryLine: c?.status === "active" ? "Correção automática activa." : `Correção · ${c?.status ?? "—"}`,
    expandedSections: c
      ? [
          {
            title: "Loop",
            kind: "metrics",
            body: `Geração ${c.generation} · aprovada após correcção: ${c.approvedAfterCorrection ? "sim" : "não"}`,
          },
        ]
      : [],
  });
}

function cardRetryExecution(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const r = ctx.executionBundle?.summary.retry;
  return baseCard(row, {
    summaryLine: r
      ? `Retry ${r.count}/${r.maxAttempts}${r.reason ? ` · ${trunc(r.reason, 80)}` : ""}`
      : "Sem estado de retry.",
    expandedSections: r
      ? [
          {
            title: "Retry",
            kind: "keyValue",
            items: [
              { key: "Activo", value: r.active ? "sim" : "não" },
              { key: "Última tentativa", value: r.lastAttemptAt ?? "—" },
            ],
          },
        ]
      : [],
  });
}

function cardRetryReview(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  void ctx;
  return baseCard(row, {
    summaryLine:
      "Re-review depende do estado de review/correcção — ver secções anteriores.",
    expandedSections: [],
  });
}

function cardFlowBlocked(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const b = ctx.executionBundle?.summary.blockers?.[0];
  return baseCard(row, {
    summaryLine: b
      ? `Bloqueio · ${trunc(b.label, 100)}`
      : ctx.summary?.state === "blocked"
        ? "Corrida bloqueada."
        : "Sem bloqueio explícito listado.",
    expandedSections: b
      ? [
          {
            title: "Bloqueio",
            kind: "warning",
            body: `${b.severity} · ${b.label} (${b.source ?? "?"})`,
          },
        ]
      : [],
    defaultExpanded: Boolean(b && row.timelinePhase === "current"),
  });
}

function cardWaitingHuman(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const st = ctx.summary?.state;
  const summaryLine =
    st === "waiting_clarification_answers"
      ? "Aguarda as suas respostas."
      : st === "waiting_clarification_questions"
        ? "Aguarda perguntas de clarificação."
        : "—";
  return baseCard(row, {
    summaryLine,
    defaultExpanded:
      (st === "waiting_clarification_answers" ||
        st === "waiting_clarification_questions") &&
      row.timelinePhase === "current"
        ? true
        : undefined,
  });
}

function cardWaitingApproval(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const st = ctx.summary?.state === "waiting_approval";
  const actions: ExecutionTimelineCardAction[] = st
    ? [
        {
          id: "approve",
          label: "Aprovar (usar painéis abaixo)",
          intent: "approve",
          disabled: true,
        },
        {
          id: "reject",
          label: "Rejeitar (usar painéis abaixo)",
          intent: "reject",
          disabled: true,
        },
      ]
    : [];
  return baseCard(row, {
    summaryLine: st
      ? "Aguarda a sua decisão."
      : "—",
    actions,
    defaultExpanded: st && row.timelinePhase === "current" ? true : undefined,
  });
}

function cardActionRequired(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const hint =
    ctx.attentionHint ??
    (ctx.dominantStrategyHandoff
      ? "Concluir aprovação da estratégia para desbloquear execução."
      : null);
  return baseCard(row, {
    summaryLine: hint ? trunc(hint, 140) : "Nenhuma acção obrigatória destacada.",
    expandedSections: hint
      ? [{ title: "Acção", kind: "actionRequired", body: hint }]
      : [],
    defaultExpanded: Boolean(hint && row.timelinePhase === "current"),
  });
}

function cardExecutionPaused(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  void ctx;
  return baseCard(row, {
    summaryLine:
      "Pausa explícita não consta no bundle de execução desta corrida.",
  });
}

function cardExecutionResumed(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const rc = ctx.executionBundle?.summary.recovery;
  return baseCard(row, {
    summaryLine: rc
      ? `Recuperação · ${rc.status}`
      : "Sem evento de retoma isolado.",
    expandedSections: rc?.summary
      ? [{ title: "Recuperação", kind: "text", body: trunc(rc.summary, 400) }]
      : [],
  });
}

function cardExecutionCancelled(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const js = ctx.summary?.jobStatus?.toLowerCase() ?? "";
  const cancelled = js.includes("cancel");
  return baseCard(row, {
    summaryLine: cancelled
      ? "Job marcado como cancelado na fila."
      : "Cancelamento não detectado no jobStatus actual.",
    expandedSections: ctx.summary
      ? [
          {
            title: "Job",
            kind: "keyValue",
            items: [{ key: "jobStatus", value: ctx.summary.jobStatus ?? "—" }],
          },
        ]
      : [],
  });
}

function cardExecutionCompleted(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const p = ctx.executionBundle?.summary.progress;
  const ok = ctx.summary?.state === "success";
  return baseCard(row, {
    summaryLine: ok
      ? `Concluída · ${p?.completed ?? "?"}/${p?.total ?? "?"} subtarefas`
      : "Conclusão ainda não confirmada pelo estado da corrida.",
    expandedSections: [],
  });
}

function cardFinalResult(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const ok = ctx.summary?.state === "success";
  const op = ctx.operational;
  const sections: ExecutionTimelineCardSection[] = [];

  if (ok && op) {
    sections.push({
      title: "Resumo da corrida",
      kind: "keyValue",
      items: [
        { key: "Run", value: op.runKey },
        { key: "Tarefa", value: op.taskTitle },
        { key: "Estado", value: runtimeStateShortLabel(op.runtimeState) },
        { key: "Fase", value: runPhaseDisplayLabel(op.currentPhaseRaw) },
        { key: "Integridade", value: integrityStateLabel(op.integrity) },
        { key: "Início", value: op.startedAtLabel ?? "—" },
        { key: "Actualizado", value: op.updatedAtLabel ?? "—" },
        { key: "Avisos", value: String(op.warningsCount) },
        { key: "Erros", value: String(op.errorsCount) },
      ],
    });
    sections.push({
      title: "Último evento",
      kind: "text",
      body:
        op.lastEvent?.message ??
        "Sem eventos nesta janela para esta corrida.",
    });
  }

  const hasDetail = sections.length > 0;
  return baseCard(row, {
    summaryLine:
      ok && ctx.summary
        ? `Entrega: ${trunc(ctx.summary.label, 100)}`
        : "Resultado final pendente ou corrida sem sucesso.",
    highlights: [],
    expandedSections: sections,
    hasEmbeddedSlot: false,
    expandable: hasDetail,
    defaultExpanded: hasDetail,
  });
}

function cardActivitySummary(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const t = ctx.operational?.taskTitle ?? ctx.summary?.label ?? "—";
  return baseCard(row, {
    summaryLine: trunc(t, 140),
    expandedSections: [
      {
        title: "Resumo operacional",
        kind: "keyValue",
        items: [
          { key: "Fase", value: ctx.summary?.phase ?? "—" },
          { key: "Estado", value: ctx.summary?.state ?? "—" },
        ],
      },
    ],
  });
}

function cardKnowledgeUpdate(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  void ctx;
  return baseCard(row, {
    summaryLine:
      "Nenhum diff de knowledge (.IA) é exposto pelo runtime nesta vista.",
    expandedSections: [],
  });
}

function cardCommitGenerated(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  void ctx;
  return baseCard(row, {
    summaryLine:
      "Metadados de commit não fazem parte do resumo exposto ao Mission Control.",
    expandedSections: [],
  });
}

function cardPrGenerated(
  row: OperationalPipelineRow,
  ctx: BuildExecutionTimelineCardsContext,
): ExecutionTimelineCard {
  const b = ctx.summary?.branchHint;
  return baseCard(row, {
    summaryLine: b
      ? `Branch referenciada: ${b}`
      : "Sem PR/MR ligado — integrações Git ainda não publicam link aqui.",
    expandedSections: [],
  });
}
