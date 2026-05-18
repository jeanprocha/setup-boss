import type { RightPanelTab } from "@/stores/mission-layout-store";
import { useMissionLayoutStore } from "@/stores/mission-layout-store";
import { scrollToExecutionAnchor } from "@/components/features/execution-timeline/execution-scroll-anchor";
import {
  resolveRuntimeActionTargetAnchor,
  type RuntimeActionKind,
  type RuntimeActionTarget,
} from "@/lib/runtime/navigation/runtime-action-target";

export const SB_RUNTIME_NAV_EVENT = "sb:runtime-action-navigate";

export type RuntimeNavigateDetail = {
  scrollAnchorId: string;
  expand?: boolean;
};

const HIGHLIGHT_CLASS = "runtime-action-highlight";
const HIGHLIGHT_MS = 1600;

function applyTemporaryHighlight(el: HTMLElement) {
  el.classList.add(HIGHLIGHT_CLASS);
  window.setTimeout(() => {
    el.classList.remove(HIGHLIGHT_CLASS);
  }, HIGHLIGHT_MS);
}

function focusWithinPanel(panelId: string, focusSelector: string | null) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  applyTemporaryHighlight(panel);
  if (!focusSelector) return;
  const focusable = panel.querySelector<HTMLElement>(focusSelector);
  if (!focusable) return;
  if (focusable.tabIndex < 0) focusable.tabIndex = -1;
  focusable.focus({ preventScroll: true });
  applyTemporaryHighlight(focusable);
}

function dispatchTimelineExpand(scrollAnchorId: string) {
  window.dispatchEvent(
    new CustomEvent<RuntimeNavigateDetail>(SB_RUNTIME_NAV_EVENT, {
      detail: { scrollAnchorId, expand: true },
    }),
  );
}

export type NavigateRuntimeActionOptions = {
  /** Abre o painel direito quando a acção é observabilidade. */
  openRightPanel?: boolean;
};

/**
 * Navegação operacional central — scroll, expand, foco e aba lateral.
 */
export function navigateRuntimeAction(
  target: RuntimeActionTarget,
  actionKind: RuntimeActionKind = "scroll_focus",
  opts?: NavigateRuntimeActionOptions,
) {
  const resolved = resolveRuntimeActionTargetAnchor(target);

  if (actionKind === "open_observability" || target === "observability") {
    const tab: RightPanelTab = "observe";
    useMissionLayoutStore.getState().setRightPanelTab(tab);
    if (opts?.openRightPanel !== false) {
      useMissionLayoutStore.getState().setRightTimelineOpen(true);
    }
    const observeRoot = document.getElementById(resolved.panelId);
    if (observeRoot) applyTemporaryHighlight(observeRoot);
    return;
  }

  if (actionKind === "open_artifacts") {
    useMissionLayoutStore.getState().setRightPanelTab("chat_files");
    if (opts?.openRightPanel !== false) {
      useMissionLayoutStore.getState().setRightTimelineOpen(true);
    }
    return;
  }

  if (resolved.rightPanelTab) {
    useMissionLayoutStore.getState().setRightPanelTab(resolved.rightPanelTab);
    if (opts?.openRightPanel !== false) {
      useMissionLayoutStore.getState().setRightTimelineOpen(true);
    }
  }

  if (resolved.scrollAnchorId) {
    if (resolved.expandTimeline) {
      dispatchTimelineExpand(resolved.scrollAnchorId);
    }
    scrollToExecutionAnchor(resolved.scrollAnchorId);
    const card = document.getElementById(resolved.scrollAnchorId);
    if (card) applyTemporaryHighlight(card);
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      focusWithinPanel(resolved.panelId, resolved.focusSelector);
    });
  });
}
