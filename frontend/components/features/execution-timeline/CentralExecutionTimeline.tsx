"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ExecutionStepBlock } from "@/components/features/execution-timeline/ExecutionStepBlock";
import { ExecutionTimelineSectionView } from "@/components/features/execution-timeline/ExecutionTimelineSectionView";
import {
  ConversationMetadataLine,
  serializeTimelineSections,
} from "@/components/features/conversation-stream";
import { StrategyKickoffTimelineAction } from "@/components/features/execution-timeline/StrategyKickoffTimelineAction";
import { useRuntimeActionNavigation } from "@/hooks/use-runtime-action-navigation";
import type { ExecutionStepId } from "@/lib/runtime/execution/execution-step-catalog";
import type { ExecutionTimelineCard } from "@/lib/runtime/execution/execution-timeline-card-types";
import {
  getExecutionTimelineVisualTier,
  getSemanticTimelineVisualTier,
} from "@/lib/runtime/execution/execution-timeline-visual-tier";
import { useI18n } from "@/lib/i18n/use-i18n";
import { translateTimelinePhaseTitle } from "@/lib/i18n/timeline-phase-label";

/** Key React estável — `anchorId` pode repetir entre cards semânticos agregados. */
function timelineCardReactKey(
  card: ExecutionTimelineCard,
  index: number,
): string {
  const phase = card.semanticPhaseId ?? card.stepId;
  return `${card.anchorId}-${card.stepId}-${phase}-${index}`;
}

export function CentralExecutionTimeline({
  cards,
  scrollHighlightedIndex,
  embeddedSlots,
  runKey = null,
  strategyKickoffEnabled = false,
}: {
  cards: readonly ExecutionTimelineCard[];
  scrollHighlightedIndex: number;
  embeddedSlots: Partial<Record<ExecutionStepId, ReactNode>>;
  runKey?: string | null;
  strategyKickoffEnabled?: boolean;
}) {
  const { t } = useI18n();
  const { navigate } = useRuntimeActionNavigation();

  return (
    <div className="cs-stream relative">
      {cards.map((card, i) => {
        const slotKey = card.embeddedSlotStepId ?? card.stepId;
        const slot = embeddedSlots[slotKey];
        const reading = i === scrollHighlightedIndex;

        const metadata =
          card.highlights.length > 0 ? (
            <>
              {card.highlights.map((h, idx) => (
                <ConversationMetadataLine
                  key={`${h.label}-${idx}`}
                  label={h.label}
                  value={h.value}
                  tone={
                    h.tone === "error"
                      ? "error"
                      : h.tone === "warn"
                        ? "warn"
                        : h.tone === "success"
                          ? "success"
                          : "default"
                  }
                />
              ))}
            </>
          ) : null;

        const tier = card.semanticPhaseId
          ? getSemanticTimelineVisualTier(card.semanticPhaseId)
          : getExecutionTimelineVisualTier(card.stepId);

        const actions =
          card.actions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {card.actions.map((a) => {
                if (a.intent === "strategy_kickoff" && !a.disabled) {
                  return (
                    <StrategyKickoffTimelineAction
                      key={a.id}
                      runKey={runKey}
                      enabled={strategyKickoffEnabled}
                      label={a.label}
                    />
                  );
                }
                if (a.navigation && !a.disabled) {
                  return (
                    <Button
                      key={a.id}
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="cs-text-caption cs-interactive h-7 cursor-pointer px-2.5 font-medium"
                      onClick={() =>
                        navigate(
                          a.navigation!.target,
                          a.navigation!.actionKind,
                        )
                      }
                    >
                      {a.label}
                    </Button>
                  );
                }
                return null;
              })}
            </div>
          ) : null;

        const isIntakeComposer =
          card.semanticPhaseId === "intake" && card.hasEmbeddedSlot;

        const displayTitle = translateTimelinePhaseTitle(
          t,
          card.semanticPhaseId,
          card.title,
        );

        const copyText = isIntakeComposer
          ? ""
          : [
              displayTitle,
              card.summaryLine,
              card.timestamp ?? "",
              serializeTimelineSections(card.expandedSections),
            ]
              .filter(Boolean)
              .join("\n\n");

        return (
          <ExecutionStepBlock
            key={timelineCardReactKey(card, i)}
            id={card.anchorId}
            stepId={card.stepId}
            stepTitle={displayTitle}
            status={card.surfaceStatus}
            operationalStatus={card.status}
            semanticPhaseId={card.semanticPhaseId}
            visualTier={tier}
            expandable={card.expandable}
            defaultExpanded={card.defaultExpanded}
            summaryLine={card.summaryLine}
            timestamp={card.timestamp}
            checkpointSeverity={card.checkpointSeverity}
            persistentFooter={metadata}
            copyText={copyText}
            hideStatus={isIntakeComposer}
            highlighted={reading}
            expandedSlot={
              <>
                <ExecutionTimelineSectionView sections={card.expandedSections} />
                {actions}
                {slot}
              </>
            }
          >
            {null}
          </ExecutionStepBlock>
        );
      })}
    </div>
  );
}
