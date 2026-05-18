"use client";

import { Button } from "@/components/ui/button";

import { ScrollArea } from "@/components/ui/scroll-area";

import { Separator } from "@/components/ui/separator";

import { EmptyState } from "@/components/primitives/EmptyState";

import { cn } from "@/lib/utils";

import { scrollToExecutionAnchor } from "@/components/features/execution-timeline/execution-scroll-anchor";

import { useRunEvents } from "@/hooks/use-run-events";

import { useRunOperational } from "@/hooks/use-run-operational";

import { useRunSummary } from "@/hooks/use-run-summary";

import { useRunObservabilityBundle } from "@/hooks/use-run-observability-bundle";

import { useOrchestration } from "@/hooks/use-orchestration";

import { useRunEvidence } from "@/hooks/use-run-evidence";

import { useMissionShellStore } from "@/stores/mission-shell-store";

import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";

import { useRuntimeSseStore } from "@/stores/runtime-sse-store";

import { runPhaseDisplayLabel } from "@/lib/runtime/adapters/runtime-labels";

import { runtimeStateLabels } from "@/lib/runtime/runtime-ui-types";

import {
  buildCoarsePipeline,
  coarseContainingHighlight,
  type CoarsePipelineId,
  type CoarsePipelineStatus,
} from "@/lib/runtime/observability/coarse-pipeline";

import {
  parseIsoDuration,
  pickLastImportantEvent,
} from "@/lib/runtime/observability/observability-event-helpers";

import { runtimeEventLogCategory } from "@/lib/runtime/observability/runtime-log-category";

import type { ComplexityLevel } from "@/lib/runtime/strategy/strategy-types";

import type { RuntimeEventDto } from "@/lib/api/runtime-types";

import { AlertTriangle, Clipboard, Inbox } from "lucide-react";

import { useCallback, useMemo } from "react";

import { useI18n } from "@/lib/i18n/use-i18n";
import { RuntimeOperationalHeartbeatBadge } from "@/components/features/observability/RuntimeOperationalHeartbeatBadge";
import { RuntimeObservabilityLogs } from "@/components/features/observability/RuntimeObservabilityLogs";

function badgeTone(s: string) {
  const x = s.toLowerCase();

  if (x.includes("fail") || x.includes("error"))
    return "border-border/60 bg-muted/25 text-rose-600 dark:text-rose-400";

  if (x.includes("block") || x.includes("warn"))
    return "border-border/60 bg-muted/25 text-amber-700 dark:text-amber-400";

  if (x.includes("complete") || x.includes("success") || x.includes("ready"))
    return "border-border/50 bg-muted/15 text-foreground/85";

  return "border-border/50 bg-muted/10 text-muted-foreground";
}

function coarseLabel(
  t: (k: string, p?: Record<string, string | number>) => string,
  id: CoarsePipelineId,
) {
  switch (id) {
    case "intake":
      return t("observability.coarseIntake");

    case "clarification":
      return t("observability.coarseClarification");

    case "strategy":
      return t("observability.coarseStrategy");

    case "executor":
      return t("observability.coarseExecutor");

    case "review":
      return t("observability.coarseReview");

    default:
      return t("observability.coarseWrapup");
  }
}

function coarseGlyph(st: CoarsePipelineStatus, active: boolean) {
  if (st === "failed") return "✗";

  if (st === "done") return "✓";

  if (st === "active" || active) return "●";

  return "○";
}

function countEventsByCategory(
  events: readonly RuntimeEventDto[],
  cat: string,
): number {
  return events.filter((e) => runtimeEventLogCategory(e) === cat).length;
}

function artifactImpactZones(
  paths: readonly string[],
  t: (k: string) => string,
): string[] {
  const zones = new Set<string>();

  for (const p of paths) {
    const x = p.toLowerCase();

    if (x.includes("frontend")) zones.add(t("observability.zoneFrontend"));
    else if (x.includes("docs")) zones.add(t("observability.zoneDocs"));
    else if (
      x.includes("scripts") ||
      x.includes("runtime") ||
      x.includes("daemon")
    )
      zones.add(t("observability.zoneRuntime"));
    else if (x.includes("core")) zones.add(t("observability.zoneCore"));
    else if (x.length) zones.add(t("observability.zoneOther"));
  }

  return [...zones].slice(0, 6);
}

function KvGrid({
  rows,
}: {
  rows: readonly { label: string; value: string; emphasize?: boolean }[];
}) {
  return (
    <dl className="space-y-0.5">
      {rows.map((r, i) => (
        <div
          key={`${r.label}-${i}`}
          className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-baseline gap-x-3 text-[8px] leading-snug"
        >
          <dt className="text-muted-foreground">{r.label}</dt>

          <dd
            className={cn(
              "truncate text-right font-mono text-foreground/90 tabular-nums",
              r.emphasize &&
                "text-[rgb(var(--v-theme-primary))] dark:text-teal-100/90",
            )}
            title={r.value}
          >
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TechSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("border-b border-border/35 py-1.5 last:border-b-0", className)}
    >
      <h3 className="mb-1 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>

      {children}
    </section>
  );
}

export function RuntimeObservabilityTechnical() {
  const { t } = useI18n();

  const projectId = useMissionShellStore((s) => s.selectedProjectId);

  const selectedRunId = useMissionShellStore((s) => s.selectedRunId);

  const newActivityFlow = useMissionShellStore((s) => s.newActivityFlow);

  const stepNavItems = useMissionShellStore((s) => s.stepNavItems);

  const highlight = useMissionShellStore((s) => s.timelineNavHighlightIndex);

  const setTimelineNavHighlightIndex = useMissionShellStore(
    (s) => s.setTimelineNavHighlightIndex,
  );

  const summary = useRunSummary(projectId, selectedRunId);

  const { events } = useRunEvents(projectId, selectedRunId);

  const connection = useRuntimeConnectionStore((s) => s.connection);

  const lastHealth = useRuntimeConnectionStore((s) => s.lastHealth);

  const queueHealth = useRuntimeConnectionStore((s) => s.queueHealth);

  const operational = useRunOperational(summary, events, connection.degraded);

  const runKey = summary?.runId ?? summary?.id ?? selectedRunId;

  const orch = useOrchestration(summary, runKey);

  const obsQ = useRunObservabilityBundle(runKey);

  const evidence = useRunEvidence(projectId, selectedRunId);

  const ssePhase = useRuntimeSseStore((s) => s.phase);

  const sseStale = useRuntimeSseStore((s) => s.isStale());

  const sseReconnect = useRuntimeSseStore((s) => s.reconnectAttempt);

  const lastHb = useRuntimeSseStore((s) => s.lastHeartbeatAt);

  const lastEv = useRuntimeSseStore((s) => s.lastEventAt);

  const sseErr = useRuntimeSseStore((s) => s.lastError);

  const stepTitle = useMemo(() => {
    if (!stepNavItems.length) return null;

    const i = Math.min(Math.max(0, highlight), stepNavItems.length - 1);

    return stepNavItems[i]?.title ?? null;
  }, [highlight, stepNavItems]);

  const coarseSteps = useMemo(
    () => buildCoarsePipeline(stepNavItems),
    [stepNavItems],
  );

  const activeCoarse = useMemo(
    () => coarseContainingHighlight(stepNavItems, highlight),

    [highlight, stepNavItems],
  );

  const important = useMemo(() => pickLastImportantEvent(events), [events]);

  const importantCategory = important
    ? runtimeEventLogCategory(important)
    : null;

  const queueDur = parseIsoDuration(
    obsQ.data?.queueJob?.startedAt ?? null,

    obsQ.data?.queueJob?.finishedAt ?? null,
  );

  const wallFromEvents = useMemo(() => {
    if (events.length < 2) return null;

    const sorted = [...events].sort(
      (a, b) => Date.parse(a.tsIso) - Date.parse(b.tsIso),
    );

    return parseIsoDuration(sorted[0]!.tsIso, sorted[sorted.length - 1]!.tsIso);
  }, [events]);

  const exec = orch.execution;

  const activeSub = exec.activeSubtask;

  const pollingFallback =
    connection.reachable &&
    (ssePhase === "idle" || ssePhase === "reconnecting" || sseStale);

  const modelHint =
    orch.strategy.bundle?.recommendation?.modelStrategy ??
    orch.strategy.bundle?.summary.label ??
    null;

  const modeHint =
    orch.strategy.bundle?.recommendation?.recommendedMode ?? null;

  const complexityLevel: ComplexityLevel | null =
    orch.strategy.bundle?.complexity?.level ?? null;

  const executionRisk = orch.strategy.bundle?.complexity?.executionRisk ?? null;

  const onCoarseNavigate = useCallback(
    (anchorIndex: number, scrollTargetId: string | null) => {
      setTimelineNavHighlightIndex(anchorIndex);

      scrollToExecutionAnchor(scrollTargetId);
    },

    [setTimelineNavHighlightIndex],
  );

  const { attentionPrimary, sseAttentionLine } = useMemo(() => {
    const primary: { tone: "rose" | "amber"; text: string }[] = [];

    if (!connection.reachable) {
      primary.push({ tone: "rose", text: t("observability.attnApiOffline") });
    }

    if (summary?.state === "waiting_approval") {
      primary.push({
        tone: "amber",
        text: t("observability.attnAwaitApproval"),
      });
    }

    if (
      summary?.state === "waiting_clarification_answers" ||
      summary?.state === "waiting_clarification_questions"
    ) {
      primary.push({
        tone: "amber",
        text: t("observability.attnAwaitClarification"),
      });
    }

    if (summary?.state === "blocked") {
      primary.push({ tone: "amber", text: t("observability.attnBlocked") });
    }

    if (summary?.state === "failed") {
      primary.push({ tone: "rose", text: t("observability.attnRunFailed") });
    }

    if (activeSub?.review.status === "rejected") {
      primary.push({
        tone: "rose",
        text: t("observability.attnReviewRejected"),
      });
    }

    if (
      exec.bundle?.summary.retry.active &&
      exec.bundle.summary.retry.count >= exec.bundle.summary.retry.maxAttempts
    ) {
      primary.push({
        tone: "rose",
        text: t("observability.attnRetriesExhausted"),
      });
    }

    if (obsQ.data?.queueJob?.errorMessage) {
      primary.push({
        tone: "rose",

        text: `${t("observability.attnQueue")}: ${obsQ.data.queueJob.errorMessage}`,
      });
    }

    const sseLine =
      sseErr && connection.reachable
        ? `${t("observability.attnSse")}: ${sseErr}`
        : null;

    return { attentionPrimary: primary, sseAttentionLine: sseLine };
  }, [
    activeSub?.review.status,

    connection.reachable,

    exec.bundle?.summary.retry,

    obsQ.data?.queueJob?.errorMessage,

    sseErr,

    summary?.state,

    t,
  ]);

  const artifactSlots = useMemo(() => {
    const names = [
      "strategy.md",
      "review.json",
      "correction.json",
      "execution-observability.json",
    ];

    const found = evidence.bundle.artifacts.filter((a) =>
      names.some((n) => a.virtualPath.endsWith(n) || a.displayName === n),
    );

    const foundIds = new Set(found.map((f) => f.id));

    const rest = evidence.bundle.artifacts
      .filter((a) => !foundIds.has(a.id))
      .slice(0, 6);

    return [...found, ...rest];
  }, [evidence.bundle.artifacts]);

  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* noop */
    }
  }, []);

  const providerCalls = useMemo(
    () => countEventsByCategory(events, "provider"),
    [events],
  );

  const validationSignals = useMemo(
    () => countEventsByCategory(events, "validation"),
    [events],
  );

  const reviewSignals = useMemo(
    () => countEventsByCategory(events, "review"),
    [events],
  );

  const subtasks = useMemo(() => exec.bundle?.subtasks ?? [], [exec.bundle]);

  const reviewsRun = useMemo(
    () => subtasks.filter((s) => s.review.status !== "none").length,

    [subtasks],
  );

  const correctionLoops = useMemo(() => {
    const gens = subtasks.map((s) => s.correction.generation);

    const maxSub = gens.length ? Math.max(...gens) : 0;

    const rootGen = exec.bundle?.summary.correction.generation ?? 0;

    return Math.max(maxSub, rootGen);
  }, [subtasks, exec.bundle?.summary.correction.generation]);

  const clarify = orch.clarification.bundle;

  const clarifyApplies = orch.clarification.applies;

  const humanAnswers = clarify?.session.answersCount ?? null;

  const humanQuestionsOpen =
    clarify != null ? Math.max(0, clarify.session.pendingBlockingCount) : null;

  const approvalLabel =
    clarify?.approval.status === "approved"
      ? t("observability.humanApprovalYes")
      : clarify?.approval.status === "rejected"
        ? t("observability.humanApprovalRejected")
        : clarify?.approval.status === "pending"
          ? t("observability.humanApprovalPending")
          : "—";

  const questionRejections = useMemo(
    () =>
      clarify
        ? clarify.questions.filter((q) => q.status === "rejected").length
        : 0,

    [clarify],
  );

  const lastHumanIso = useMemo(() => {
    if (!clarify?.answers.length) return clarify?.session.updatedAt ?? null;

    const last = [...clarify.answers].sort(
      (a, b) => Date.parse(a.recordedAt ?? "") - Date.parse(b.recordedAt ?? ""),
    );

    return last[last.length - 1]?.recordedAt ?? clarify.session.updatedAt;
  }, [clarify]);

  const progressPct = useMemo(() => {
    const p = exec.bundle?.summary.progress;

    if (p && p.total > 0) return Math.round((p.completed / p.total) * 100);

    if (stepNavItems.length > 0) {
      const done = stepNavItems.filter(
        (s) => s.operationalStatus === "completed",
      ).length;

      return Math.round((done / stepNavItems.length) * 100);
    }

    return null;
  }, [exec.bundle?.summary.progress, stepNavItems]);

  const complexityLabel = complexityLevel
    ? t(`observability.complexity.${complexityLevel}`)
    : "—";

  const healthLabel =
    exec.bundle?.summary.health != null
      ? t(`observability.execHealth.${exec.bundle.summary.health}`)
      : operational?.integrity
        ? t(`observability.dataIntegrity.${operational.integrity}`)
        : "—";

  const flowHealthLabel = useMemo(() => {
    if (summary?.state === "failed")
      return t("observability.flowHealthCritical");

    if (attentionPrimary.length) return t("observability.flowHealthAttention");

    if (
      exec.bundle?.summary.health === "degraded" ||
      exec.bundle?.summary.health === "partial"
    )
      return t("observability.flowHealthDegraded");

    if (operational?.integrity === "degraded")
      return t("observability.flowHealthDegraded");

    if (operational?.integrity === "failed")
      return t("observability.flowHealthCritical");

    return t("observability.flowHealthStable");
  }, [
    attentionPrimary.length,
    exec.bundle?.summary.health,
    operational?.integrity,
    summary?.state,
    t,
  ]);

  const pipelineIaHint = useMemo(() => {
    const lp = exec.lifecyclePhase;

    if (!lp) return modelHint ?? "—";

    const key = `observability.lifecyclePhase.${lp}`;

    const translated = t(key);

    return translated !== key ? translated : (modelHint ?? lp);
  }, [exec.lifecyclePhase, modelHint, t]);

  const impactZones = useMemo(
    () =>
      artifactImpactZones(
        evidence.bundle.artifacts.map((a) => a.virtualPath),

        t,
      ),

    [evidence.bundle.artifacts, t],
  );

  const costHint =
    orch.strategy.bundle?.recommendation?.costPerformanceHint?.trim() || null;

  if (newActivityFlow || !selectedRunId) {
    return (
      <EmptyState
        icon={Inbox}
        title={t("timeline.noRunTitle")}
        hint={t("timeline.noRunObserveHint")}
        className="py-10"
      />
    );
  }

  const stateLabel =
    summary?.state != null
      ? (runtimeStateLabels[summary.state] ?? summary.state)
      : "—";

  const phaseLabel = runPhaseDisplayLabel(summary?.phase ?? "");

  const runningPulse =
    summary?.state === "running" ||
    summary?.state === "retrying" ||
    summary?.state === "correcting";

  const durationLabel = queueDur ?? wallFromEvents ?? "—";

  const headLine = phaseLabel.trim() ? phaseLabel : stateLabel;

  const subLine =
    stepTitle != null && String(stepTitle).trim()
      ? `${phaseLabel.trim() ? phaseLabel : stateLabel} → ${stepTitle}`
      : phaseLabel.trim()
        ? stateLabel
        : null;

  return (
    <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]]:p-1">
      <div className="px-2.5 pb-3 pt-1 text-[8px] leading-tight text-sidebar-foreground">
        <header className="border-b border-border/35 pb-2">
          <div className="flex items-start gap-2">
            <span
              className={cn(
                "mt-1.5 inline-flex size-1.5 shrink-0 rounded-full",
                runningPulse
                  ? "bg-[rgb(var(--v-theme-primary))]/90"
                  : "bg-muted-foreground/35",
              )}
              aria-hidden
            />

            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="truncate text-[8px] font-semibold leading-tight tracking-tight text-foreground">
                {headLine}
              </p>

              {subLine ? (
                <p className="truncate text-[8px] text-muted-foreground">
                  {subLine}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-2">
            <KvGrid
              rows={[
                {
                  label: t("observability.fieldProject"),
                  value: summary?.projectId ?? "—",
                },
                {
                  label: t("observability.fieldRunId"),
                  value: summary?.runId ?? "—",
                },
                { label: t("observability.execState"), value: stateLabel },
                { label: t("observability.metricDuration"), value: durationLabel },
                {
                  label: t("observability.heroComplexity"),
                  value: complexityLabel,
                },
                ...(executionRisk
                  ? [
                      {
                        label: t("observability.heroRisk"),
                        value: t(`observability.risk.${executionRisk}`),
                      },
                    ]
                  : []),
                {
                  label: t("observability.heroFlowHealth"),
                  value: flowHealthLabel,
                },
                {
                  label: t("observability.heroExecHealth"),
                  value: healthLabel,
                },
                ...(progressPct != null
                  ? [
                      {
                        label: t("observability.kvProgress"),
                        value: t("observability.heroProgress", {
                          pct: progressPct,
                        }),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        </header>

        {attentionPrimary.length ? (
          <div className="border-b border-border/35 py-2">
            <div className="flex items-start gap-1.5 text-[8px] font-semibold uppercase tracking-wide text-foreground">
              <AlertTriangle
                className="mt-0.5 size-3 shrink-0 text-amber-600 dark:text-amber-500"
                aria-hidden
              />

              {t("observability.attentionTitle")}
            </div>

            <ul className="mt-1 space-y-0.5">
              {attentionPrimary.map((x, i) => (
                <li
                  key={i}
                  className={cn(
                    "text-[8px] leading-snug",
                    x.tone === "rose"
                      ? "text-rose-700 dark:text-rose-400"
                      : "text-amber-800 dark:text-amber-400",
                  )}
                >
                  {x.text}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <TechSection title={t("observability.aiMetricsTitle")}>
          <KvGrid
            rows={[
              {
                label: t("observability.aiModelRequests"),
                value: String(providerCalls),
              },
              {
                label: t("observability.aiTokensIn"),
                value: "—",
                emphasize: true,
              },
              {
                label: t("observability.aiTokensOut"),
                value: "—",
                emphasize: true,
              },
              {
                label: t("observability.aiTokensTotal"),
                value: "—",
                emphasize: true,
              },
              {
                label: t("observability.aiCostEst"),
                value: costHint ?? t("observability.notAvailableMetric"),
              },
              {
                label: t("observability.aiProviders"),
                value: modelHint ?? t("observability.notAvailableMetric"),
              },
            ]}
          />

          <p className="mt-1 text-[8px] leading-snug text-muted-foreground">
            {t("observability.aiPipeline")}:{" "}
            <span className="text-foreground/85">{pipelineIaHint}</span>
            {modeHint ? (
              <span>
                {" "}
                · {t("observability.aiMode")}: {modeHint}
              </span>
            ) : null}
          </p>

          <p className="mt-0.5 text-[8px] text-muted-foreground/90">
            {t("observability.aiTokensNote")}
          </p>
        </TechSection>

        <TechSection title={t("observability.qualityTitle")}>
          <KvGrid
            rows={[
              {
                label: t("observability.qaReviewRun"),
                value: exec.bundle?.summary.review.status ?? "—",
              },
              {
                label: t("observability.qaCorrection"),
                value: exec.bundle?.summary.correction.status ?? "—",
              },
              {
                label: t("observability.qaValidations"),
                value: String(validationSignals),
              },
              {
                label: t("observability.qaReviewSignals"),
                value: String(reviewSignals),
              },
              {
                label: t("observability.qaIssues"),
                value: String(
                  (operational?.warningsCount ?? 0) +
                    (operational?.errorsCount ?? 0),
                ),
              },
              {
                label: t("observability.qaWarnings"),
                value: String(operational?.warningsCount ?? 0),
              },
            ]}
          />

          {exec.bundle?.summary.correction.summary ? (
            <p className="mt-1 border-l-2 border-border/60 pl-2 text-[8px] leading-snug text-foreground/88">
              {exec.bundle.summary.correction.summary}
            </p>
          ) : null}
        </TechSection>

        <TechSection title={t("observability.humanTitle")}>
          {clarifyApplies && clarify ? (
            <KvGrid
              rows={[
                {
                  label: t("observability.humanAnswers"),
                  value: humanAnswers != null ? String(humanAnswers) : "—",
                },
                { label: t("observability.humanApprovals"), value: approvalLabel },
                {
                  label: t("observability.humanRejections"),
                  value: String(
                    questionRejections +
                      (clarify.approval.status === "rejected" ? 1 : 0),
                  ),
                },
                {
                  label: t("observability.humanPending"),
                  value:
                    humanQuestionsOpen != null && humanQuestionsOpen > 0
                      ? String(humanQuestionsOpen)
                      : summary?.state === "waiting_approval"
                        ? t("observability.humanPendingApproval")
                        : "0",
                },
                {
                  label: t("observability.humanClarifyOpen"),
                  value: String(clarify.session.pendingBlockingCount),
                },
                {
                  label: t("observability.humanLast"),
                  value: lastHumanIso
                    ? new Date(lastHumanIso).toLocaleString()
                    : "—",
                },
              ]}
            />
          ) : (
            <p className="text-[8px] text-muted-foreground">
              {t("observability.humanNotInClarify")}
            </p>
          )}
        </TechSection>

        <TechSection title={t("observability.opsTitle")}>
          <KvGrid
            rows={[
              {
                label: t("observability.opsPhases"),
                value: String(stepNavItems.length || "—"),
              },
              {
                label: t("observability.opsSubtasks"),
                value: String(subtasks.length || "—"),
              },
              {
                label: t("observability.opsRetries"),
                value: String(exec.bundle?.summary.retry.count ?? "—"),
              },
              {
                label: t("observability.opsCorrectionLoops"),
                value: String(correctionLoops),
              },
              {
                label: t("observability.opsReviewsRun"),
                value: String(reviewsRun),
              },
              {
                label: t("observability.opsCurrentSub"),
                value: activeSub?.title ?? t("observability.currentExecEmpty"),
              },
            ]}
          />

          {activeSub ? (
            <p className="mt-1 text-[8px] text-muted-foreground">
              {t("observability.opsSubState")}:{" "}
              <span className="font-mono text-foreground/80">
                {activeSub.state}
              </span>
              {" · "}
              {t("observability.execReview")}:{" "}
              <span className="font-mono text-foreground/80">
                {activeSub.review.status}
              </span>
            </p>
          ) : null}
        </TechSection>

        <TechSection title={t("observability.timeTitle")}>
          <KvGrid
            rows={[
              { label: t("observability.timeTotal"), value: durationLabel },
              { label: t("observability.timeQueue"), value: queueDur ?? "—" },
              {
                label: t("observability.timeWallEvents"),
                value: wallFromEvents ?? "—",
              },
              {
                label: t("observability.timeIdleHuman"),
                value: t("observability.notAvailableMetric"),
              },
              {
                label: t("observability.timeAi"),
                value: t("observability.notAvailableMetric"),
              },
              {
                label: t("observability.timeReview"),
                value: t("observability.notAvailableMetric"),
              },
            ]}
          />
        </TechSection>

        <TechSection title={t("observability.impactTitle")}>
          <p className="text-[8px] leading-snug text-foreground/90">
            {t("observability.impactFiles")}: {evidence.bundle.artifacts.length}
            {impactZones.length ? (
              <span className="text-muted-foreground">
                {" "}
                · {impactZones.join(" · ")}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {" "}
                · {t("observability.impactUnknown")}
              </span>
            )}
          </p>
        </TechSection>

        {coarseSteps.length ? (
          <TechSection title={t("observability.pipelineMissionTitle")}>
            <div className="flex flex-wrap items-baseline gap-x-1 gap-y-1 text-[8px] leading-tight">
              {coarseSteps.map((cs, idx) => {
                const active = activeCoarse === cs.id;

                const g = coarseGlyph(cs.aggregate, active);

                const glyphClass =
                  cs.aggregate === "pending" && !active
                    ? "text-muted-foreground/70"
                    : cs.aggregate === "failed"
                      ? "text-rose-600 dark:text-rose-400"
                      : cs.aggregate === "done"
                        ? "text-foreground/75"
                        : "text-muted-foreground";

                return (
                  <span key={cs.id} className="inline-flex items-baseline gap-1">
                    {idx > 0 ? (
                      <span
                        className="text-muted-foreground/45"
                        aria-hidden
                      >
                        →
                      </span>
                    ) : null}

                    <button
                      type="button"
                      title={coarseLabel(t, cs.id)}
                      onClick={() =>
                        onCoarseNavigate(cs.anchorIndex, cs.scrollTargetId)
                      }
                      className={cn(
                        "inline-flex min-w-0 max-w-[7rem] items-baseline gap-1 truncate rounded-sm border border-transparent px-0.5 py-0.5 text-left transition-colors hover:border-border/50 hover:bg-muted/25",
                        active &&
                          "border-border/60 bg-muted/35 text-foreground underline decoration-[rgb(var(--v-theme-primary))]/70 decoration-1 underline-offset-2",
                      )}
                    >
                      <span
                        className={cn(
                          "shrink-0 font-mono text-[8px]",
                          glyphClass,
                          active &&
                            "text-[rgb(var(--v-theme-primary))] dark:text-teal-100/90",
                        )}
                      >
                        {g}
                      </span>

                      <span className="truncate font-medium text-foreground/90">
                        {coarseLabel(t, cs.id)}
                      </span>
                    </button>
                  </span>
                );
              })}
            </div>

            <p className="mt-1 text-[8px] text-muted-foreground">
              {t("observability.pipelineHint")}
            </p>
          </TechSection>
        ) : null}

        <TechSection title={t("observability.lastEventTitle")}>
          {important ? (
            <div className="space-y-1">
              <p className="text-[8px] font-medium leading-snug text-foreground">
                {important.message}
              </p>

              <p className="text-[8px] text-muted-foreground">
                {importantCategory ? (
                  <span className="font-mono text-foreground/70">
                    {importantCategory}
                  </span>
                ) : null}
                {importantCategory ? <span> · </span> : null}
                <span className="font-mono">{important.type}</span>
                <span> · </span>
                <span>{important.tsIso}</span>
              </p>
            </div>
          ) : (
            <p className="text-[8px] text-muted-foreground">
              {t("observability.noEventsIndexed")}
            </p>
          )}
        </TechSection>

        <div className="border-b border-border/35 py-2">
          <h3 className="mb-1 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("observability.nextActionExpected")}
          </h3>

          <p className="border-l-2 border-[rgb(var(--v-theme-primary))]/35 pl-2 text-[8px] leading-snug text-foreground/90">
            {orch.availability.message || "—"}
          </p>
        </div>

        <details className="group border-b border-border/35 py-1">
          <summary className="cursor-pointer list-none py-1 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="inline-flex w-full items-center gap-2">
              {t("observability.internalDetailsTitle")}

              <span className="ml-auto text-[8px] font-normal normal-case text-muted-foreground/80">
                {t("observability.internalDetailsHint")}
              </span>
            </span>
          </summary>

          <div className="space-y-2 border-t border-border/35 pb-2 pt-2">
            {sseAttentionLine ? (
              <p className="text-[8px] text-amber-800 dark:text-amber-400">
                {sseAttentionLine}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-1 text-[8px]">
              <span
                className={`rounded border px-1.5 py-px font-medium ${badgeTone(connection.reachable ? "ok" : "fail")}`}
              >
                {lastHealth?.daemon === "running"
                  ? t("observability.daemonRunning")
                  : t("observability.daemonOther", {
                      state: String(lastHealth?.daemon ?? "—"),
                    })}
              </span>

              <RuntimeOperationalHeartbeatBadge />

              <span className="rounded border border-border/50 bg-muted/20 px-1.5 py-px font-mono text-[8px]">
                PID {lastHealth?.pid ?? "—"}
              </span>

              <span
                className={`rounded border px-1.5 py-px font-medium ${badgeTone(ssePhase)}`}
              >
                SSE {ssePhase}
                {sseStale ? t("observability.sseStaleSuffix") : ""}
              </span>

              <span className="rounded border border-border/50 bg-muted/15 px-1.5 py-px">
                {t("observability.reconnectsLabel")} {sseReconnect}
              </span>

              <span className="rounded border border-border/50 bg-muted/15 px-1.5 py-px">
                {pollingFallback
                  ? t("observability.pollingActive")
                  : t("observability.pollingInactive")}
              </span>
            </div>

            <p className="font-mono text-[8px] leading-relaxed text-muted-foreground/90">
              <span>
                {t("observability.lastHeartbeat")}{" "}
                {lastHb ? new Date(lastHb).toISOString() : "—"}
              </span>

              {" · "}

              <span>
                {t("observability.lastSseEvent")}{" "}
                {lastEv ? new Date(lastEv).toISOString() : "—"}
              </span>

              {" · "}

              <span>
                {t("observability.runtimeMode")}: {connection.dataSource}
              </span>
            </p>

            <div className="flex flex-wrap gap-1">
              <span
                className={`rounded border px-1.5 py-px text-[8px] font-medium ${badgeTone(connection.reachable ? "ok" : "fail")}`}
              >
                {connection.reachable
                  ? t("observability.badgeApiOnline")
                  : t("observability.badgeApiOffline")}
              </span>

              <span
                className={`rounded border px-1.5 py-px text-[8px] font-medium ${badgeTone(queueHealth === "degraded" ? "warn" : "ok")}`}
              >
                {queueHealth === "degraded"
                  ? t("observability.queueDegraded")
                  : queueHealth === "ok"
                    ? t("observability.queueOk")
                    : t("observability.queueUnknown")}
              </span>
            </div>

            <Separator className="bg-border/40" />

            <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[8px]">
              <div className="text-muted-foreground">
                {t("observability.fieldProject")}
              </div>

              <div className="truncate text-right">
                {summary?.projectId ?? "—"}
              </div>

              <div className="text-muted-foreground">
                {t("observability.fieldRunId")}
              </div>

              <div className="truncate text-right">{summary?.runId ?? "—"}</div>

              <div className="text-muted-foreground">
                {t("observability.fieldJobId")}
              </div>

              <div className="truncate text-right">{summary?.id ?? "—"}</div>

              <div className="text-muted-foreground">
                {t("observability.fieldBranch")}
              </div>

              <div className="truncate text-right">
                {summary?.branchHint ?? "—"}
              </div>

              <div className="text-muted-foreground">
                {t("observability.fieldQueue")}
              </div>

              <div className="truncate text-right">
                {obsQ.data?.queueJob
                  ? obsQ.data.queueJob.status
                  : obsQ.isLoading
                    ? "…"
                    : "—"}
              </div>
            </div>

            {obsQ.data?.queueJob?.retryable ? (
              <p className="text-[8px] text-muted-foreground">
                {t("observability.queueRetryable")}
              </p>
            ) : null}

            <Separator className="bg-border/40" />

            <div className="space-y-1 font-mono text-[8px]">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">runtimePhase</span>

                <span className="truncate text-right text-foreground/85">
                  {phaseLabel}
                </span>
              </div>

              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">
                  orchestrationState
                </span>

                <span className="truncate text-right text-foreground/85">
                  {orch.orchestrationState}
                </span>
              </div>

              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">
                  execution.lifecycle
                </span>

                <span className="truncate text-right text-foreground/85">
                  {orch.execution.bundle?.summary.lifecycle.phase ?? "—"}
                </span>
              </div>
            </div>

            {operational ? (
              <p className="text-[8px] text-muted-foreground">
                {t("observability.lastOperationalUpdate", {
                  updatedAt: operational.updatedAtLabel ?? "—",

                  warnings: operational.warningsCount,

                  errors: operational.errorsCount,
                })}
              </p>
            ) : null}

            <p className="text-[8px] text-muted-foreground">
              {t("observability.pollingNote")}
            </p>

            <div className="text-[8px] font-semibold uppercase text-muted-foreground">
              {t("observability.artifactsPanelTitle")}
            </div>

            <p className="font-mono text-[8px] text-muted-foreground">
              outputDir · {obsQ.data?.outputDirBasename ?? "—"}
            </p>

            <ul className="max-h-36 space-y-px overflow-auto">
              {artifactSlots.length === 0 ? (
                <li className="text-[8px] text-muted-foreground">
                  {t("observability.artifactsEmpty")}
                </li>
              ) : (
                artifactSlots.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 border-b border-border/30 py-1 last:border-b-0"
                  >
                    <span
                      className="min-w-0 truncate text-[8px] text-foreground/90"
                      title={a.virtualPath}
                    >
                      {a.displayName}
                    </span>

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 shrink-0 gap-1 px-2 text-[8px] text-muted-foreground hover:text-foreground"
                      onClick={() => copyText(a.virtualPath)}
                    >
                      <Clipboard className="size-3" />

                      {t("observability.copyPath")}
                    </Button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </details>

        <TechSection title={t("observability.technicalLogsSection")}>
          <p className="mb-1 text-[8px] text-muted-foreground">
            {t("observability.debugConsoleHint")}
          </p>
          <div className="flex min-h-[12rem] max-h-72 flex-col overflow-hidden rounded-md border border-border/40">
            <RuntimeObservabilityLogs viewMode="full" compactToolbar />
          </div>
        </TechSection>

        <TechSection title={t("observability.telemetryTitle")} className="border-b-0">
          <KvGrid
            rows={[
              {
                label: t("observability.metricEvents"),
                value: String(events.length),
              },
              {
                label: t("observability.metricArtifacts"),
                value: String(evidence.bundle.artifacts.length),
              },
              {
                label: t("observability.metricRetries"),
                value: String(exec.bundle?.summary.retry.count ?? "—"),
              },
            ]}
          />
        </TechSection>
      </div>
    </ScrollArea>
  );
}
