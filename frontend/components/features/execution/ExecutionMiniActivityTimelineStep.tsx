"use client";

import { useMemo } from "react";
import type { MaterializedMiniActivityDto } from "@/lib/runtime/execution/execution-types";
import {
  badgeToneForVisualState,
  buildMiniActivityOperationalHistory,
  deriveMiniActivityTimelineTier,
  formatHistoryTimestamp,
  labelMiniActivityVisualState,
  resolveDependencyTitles,
  resolveMiniActivityVisualState,
  type MiniActivityTimelineTier,
} from "@/lib/runtime/operational/execution-mini-activity-timeline";
import { cn } from "@/lib/utils";

const BADGE_CLASS: Record<
  ReturnType<typeof badgeToneForVisualState>,
  string
> = {
  neutral: "execution-mini-timeline__badge--neutral",
  primary: "execution-mini-timeline__badge--primary",
  success: "execution-mini-timeline__badge--success",
  warning: "execution-mini-timeline__badge--warning",
  danger: "execution-mini-timeline__badge--danger",
  review: "execution-mini-timeline__badge--review",
};

function StepBadge({ ma }: { ma: MaterializedMiniActivityDto }) {
  const visual = resolveMiniActivityVisualState(ma);
  const tone = badgeToneForVisualState(visual);
  return (
    <span
      className={cn("execution-mini-timeline__badge", BADGE_CLASS[tone])}
    >
      {labelMiniActivityVisualState(visual)}
    </span>
  );
}

function StepDetails({
  ma,
  all,
  tier,
  isActivePin,
}: {
  ma: MaterializedMiniActivityDto;
  all: MaterializedMiniActivityDto[];
  tier: MiniActivityTimelineTier;
  isActivePin: boolean;
}) {
  const history = useMemo(
    () => buildMiniActivityOperationalHistory(ma),
    [ma],
  );
  const dependencyTitles = useMemo(
    () => resolveDependencyTitles(ma, all),
    [ma, all],
  );
  const visual = resolveMiniActivityVisualState(ma);

  return (
    <div className="execution-mini-timeline__body">
      {ma.objective ? (
        <p>
          <span className="execution-mini-timeline__label">Objetivo: </span>
          {ma.objective}
        </p>
      ) : null}

      {ma.completionCriteria.length > 0 && tier === "active" ? (
        <div>
          <p className="execution-mini-timeline__label mt-1.5">
            Critérios de conclusão
          </p>
          <ul className="execution-mini-timeline__criteria">
            {ma.completionCriteria.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {ma.reviewSummary &&
      (tier === "active" || visual === "correction_required") ? (
        <p className="mt-1.5">
          <span className="execution-mini-timeline__label">Review: </span>
          {ma.reviewSummary}
        </p>
      ) : null}

      {visual === "correction_required" ? (
        <p className="mt-1 text-amber-800 dark:text-amber-100">
          Ajuste necessário antes de avançar.
        </p>
      ) : null}

      {visual === "blocked" && dependencyTitles.length > 0 ? (
        <p className="mt-1">
          <span className="execution-mini-timeline__label">Depende de: </span>
          {dependencyTitles.join(", ")}
        </p>
      ) : null}

      {history.length > 0 && tier === "active" ? (
        <div className="execution-mini-timeline__history">
          <p className="execution-mini-timeline__history-title">Histórico</p>
          <ol className="execution-mini-timeline__history-list">
            {history.map((entry) => (
              <li key={entry.id} className="execution-mini-timeline__history-item">
                <span className="execution-mini-timeline__history-time">
                  {formatHistoryTimestamp(entry.at)}
                </span>
                <span>{entry.labelPt}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {isActivePin ? (
        <p className="execution-mini-timeline__now-hint">Em curso nesta etapa</p>
      ) : null}
    </div>
  );
}

export function ExecutionMiniActivityTimelineStep({
  ma,
  all,
  activeMiniActivityId,
}: {
  ma: MaterializedMiniActivityDto;
  all: MaterializedMiniActivityDto[];
  activeMiniActivityId: string | null;
}) {
  const tier = deriveMiniActivityTimelineTier(ma, activeMiniActivityId);
  const visual = resolveMiniActivityVisualState(ma);
  const isActivePin = activeMiniActivityId === ma.miniActivityId;

  const itemClass = cn(
    "execution-mini-timeline__item",
    tier === "active" && "execution-mini-timeline__item--active",
    tier === "compact" && "execution-mini-timeline__item--compact",
    tier === "upcoming" && "execution-mini-timeline__item--upcoming",
    visual === "completed" && "execution-mini-timeline__item--completed",
    visual === "failed" && "execution-mini-timeline__item--failed",
    visual === "blocked" && "execution-mini-timeline__item--blocked",
  );

  const head = (
    <div className="execution-mini-timeline__step-head">
      <p className="execution-mini-timeline__step-title">
        <span className="execution-mini-timeline__order">#{ma.order}</span>{" "}
        {ma.title}
      </p>
      <StepBadge ma={ma} />
    </div>
  );

  if (tier === "compact") {
    return (
      <li className={itemClass}>
        <details className="execution-mini-timeline__step">
          <summary className="execution-mini-timeline__compact-summary">
            {head}
            <span className="execution-mini-timeline__compact-hint">
              Toque para ver detalhes
            </span>
          </summary>
          <StepDetails
            ma={ma}
            all={all}
            tier="active"
            isActivePin={false}
          />
        </details>
      </li>
    );
  }

  return (
    <li className={itemClass}>
      <div className="execution-mini-timeline__step">
        {head}
        {tier === "active" ? (
          <StepDetails
            ma={ma}
            all={all}
            tier={tier}
            isActivePin={isActivePin}
          />
        ) : null}
        {tier === "upcoming" && ma.objective ? (
          <p className="execution-mini-timeline__body mt-1 line-clamp-1">
            {ma.objective}
          </p>
        ) : null}
      </div>
    </li>
  );
}
