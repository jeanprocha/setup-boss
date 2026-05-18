"use client";

import { useCallback } from "react";
import {
  navigateRuntimeAction,
  type NavigateRuntimeActionOptions,
} from "@/lib/runtime/navigation/runtime-action-navigation";
import type {
  RuntimeActionKind,
  RuntimeActionTarget,
} from "@/lib/runtime/navigation/runtime-action-target";
import type { HumanOperationalCta } from "@/lib/runtime/translation/human-operational-state";

export function useRuntimeActionNavigation() {
  const navigate = useCallback(
    (
      target: RuntimeActionTarget,
      actionKind: RuntimeActionKind = "scroll_focus",
      opts?: NavigateRuntimeActionOptions,
    ) => {
      navigateRuntimeAction(target, actionKind, opts);
    },
    [],
  );

  const navigateCta = useCallback(
    (cta: HumanOperationalCta, opts?: NavigateRuntimeActionOptions) => {
      navigateRuntimeAction(cta.target, cta.actionKind ?? "scroll_focus", opts);
    },
    [],
  );

  return { navigate, navigateCta };
}
