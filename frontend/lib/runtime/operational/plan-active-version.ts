import type { OperationalPlanPresentation } from "./operational-plan-types";
import type { PlanCommentThreadState } from "./plan-approval-timeline-types";

export type PlanTimelineEntry =
  | {
      kind: "initial";
      planVersion: 1;
      presentation: OperationalPlanPresentation;
    }
  | {
      kind: "updated";
      planVersion: number;
      commentId: string;
      presentation: OperationalPlanPresentation;
    };

export function buildPlanTimelineEntries(
  basePlan: OperationalPlanPresentation,
  threads: PlanCommentThreadState[],
): PlanTimelineEntry[] {
  const entries: PlanTimelineEntry[] = [
    { kind: "initial", planVersion: 1, presentation: basePlan },
  ];
  for (const t of threads) {
    if (t.updatedPlan?.presentation) {
      entries.push({
        kind: "updated",
        planVersion: t.updatedPlan.planVersion,
        commentId: t.comment.id,
        presentation: t.updatedPlan.presentation,
      });
    }
  }
  entries.sort((a, b) => a.planVersion - b.planVersion);
  return entries;
}

export function resolveActivePlanEntry(
  entries: PlanTimelineEntry[],
): PlanTimelineEntry {
  return entries[entries.length - 1] ?? entries[0]!;
}

export function isSupersededPlanVersion(
  planVersion: number,
  activeVersion: number,
): boolean {
  return planVersion < activeVersion;
}
