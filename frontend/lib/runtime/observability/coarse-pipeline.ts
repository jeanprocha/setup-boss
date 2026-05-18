import type { StepNavItem } from "@/stores/mission-shell-store";
import {
  EXECUTION_STEPS,
} from "@/lib/runtime/execution/execution-step-catalog";
import type { OperationalStepStatus } from "@/lib/runtime/execution/operational-step-status";

export type CoarsePipelineId =
  | "intake"
  | "clarification"
  | "strategy"
  | "executor"
  | "review"
  | "wrapup";

export type CoarsePipelineStatus = "pending" | "active" | "done" | "failed";

export type CoarsePipelineStepVm = {
  id: CoarsePipelineId;
  /** Índice em `stepNavItems` usado para scroll / highlight */
  anchorIndex: number;
  scrollTargetId: string | null;
  aggregate: CoarsePipelineStatus;
};

function defForNavKey(navKey: string) {
  return EXECUTION_STEPS.find((s) => s.id === navKey) ?? null;
}

export function coarsePipelineIdFromNavKey(
  navKey: string,
): CoarsePipelineId {
  const d = defForNavKey(navKey);
  if (!d) return "wrapup";
  const c = d.category;
  if (c === "intake" || c === "runtime") return "intake";
  if (c === "clarification") return "clarification";
  if (c === "strategy") return "strategy";
  if (c === "execution") return "executor";
  if (c === "validation") {
    if (d.order <= 20) return "executor";
    return "review";
  }
  if (c === "human") return "review";
  return "wrapup";
}

function stepToSignal(
  st: OperationalStepStatus,
): "failed" | "active" | "done" | "pending" {
  if (st === "failed") return "failed";
  if (
    st === "running" ||
    st === "active" ||
    st === "waiting_input" ||
    st === "waiting_user" ||
    st === "blocked"
  )
    return "active";
  if (st === "completed") return "done";
  return "pending";
}

function foldBucket(signals: ("failed" | "active" | "done" | "pending")[]): CoarsePipelineStatus {
  if (signals.includes("failed")) return "failed";
  if (signals.includes("active")) return "active";
  if (signals.length && signals.every((s) => s === "done")) return "done";
  if (signals.some((s) => s === "done")) return "active";
  return "pending";
}

const COARSE_ORDER: CoarsePipelineId[] = [
  "intake",
  "clarification",
  "strategy",
  "executor",
  "review",
  "wrapup",
];

/**
 * Resume operacional: agrupa os passos finos do Mission Control em fases grossas.
 */
export function buildCoarsePipeline(
  stepNavItems: readonly StepNavItem[],
): CoarsePipelineStepVm[] {
  const buckets = new Map<
    CoarsePipelineId,
    {
      signals: ("failed" | "active" | "done" | "pending")[];
      anchorIndex: number;
      scrollId: string | null;
    }
  >();

  for (let i = 0; i < stepNavItems.length; i++) {
    const row = stepNavItems[i]!;
    const id = coarsePipelineIdFromNavKey(row.navKey);
    const sig = stepToSignal(row.operationalStatus);
    const prev = buckets.get(id);
    const signals = prev?.signals ?? [];
    signals.push(sig);
    const scrollId = row.scrollTargetId ?? prev?.scrollId ?? null;
    const anchorIndex = prev == null ? i : prev.anchorIndex;
    buckets.set(id, {
      signals,
      anchorIndex,
      scrollId,
    });
  }

  return COARSE_ORDER.filter((id) => buckets.has(id)).map((id) => {
    const b = buckets.get(id)!;
    return {
      id,
      anchorIndex: b.anchorIndex,
      scrollTargetId: b.scrollId,
      aggregate: foldBucket(b.signals),
    };
  });
}

export function coarseContainingHighlight(
  stepNavItems: readonly StepNavItem[],
  highlightIndex: number,
): CoarsePipelineId | null {
  if (!stepNavItems.length) return null;
  const i = Math.min(
    Math.max(0, highlightIndex),
    stepNavItems.length - 1,
  );
  return coarsePipelineIdFromNavKey(stepNavItems[i]!.navKey);
}
