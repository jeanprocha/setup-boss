import type { ExecutionTimelineCardAction } from "@/lib/runtime/execution/execution-timeline-card-types";
import type { HumanOperationalCta } from "@/lib/runtime/translation/human-operational-state";

export function humanCtaToTimelineAction(
  cta: HumanOperationalCta,
  id: string,
): ExecutionTimelineCardAction {
  return {
    id,
    label: cta.label,
    intent: "navigate",
    navigation: {
      target: cta.target,
      actionKind: cta.actionKind ?? "scroll_focus",
    },
  };
}
