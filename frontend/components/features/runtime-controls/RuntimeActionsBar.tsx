"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Ban,
  MoreHorizontal,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import { Button } from "@/components/ui/button";
import { RuntimeActionButton } from "@/components/features/runtime-controls/RuntimeActionButton";
import { RuntimeActionConfirm } from "@/components/features/runtime-controls/RuntimeActionConfirm";
import {
  useCancelRun,
  useRefreshRuntime,
  useRebuildObservability,
  useResumeRun,
  useRetryRun,
  useValidateIntegrity,
} from "@/hooks/use-runtime-action";
import type { ActionAvailability } from "@/lib/runtime/actions/runtime-action-types";
import type { RuntimeActionId } from "@/lib/runtime/actions/runtime-action-types";
import { actionRequiresConfirmation } from "@/lib/runtime/actions/action-availability";
import { cn } from "@/lib/utils";

type PendingConfirm = RuntimeActionId | null;

function visibilityOk(av: ActionAvailability): boolean {
  return av.available || av.unsupported;
}

function visuallyDisabled(av: ActionAvailability, pending: boolean): boolean {
  return pending || (!av.available && !av.unsupported);
}

function feedbackTone(outcome: string | undefined): string {
  switch (outcome) {
    case "success":
      return "font-medium text-emerald-800 dark:text-emerald-200/95";
    case "failed":
    case "timeout":
      return "font-medium text-red-800 dark:text-red-200/95";
    case "unsupported":
      return "text-muted-foreground";
    case "degraded":
      return "font-medium text-amber-900 dark:text-amber-100/95";
    default:
      return "text-muted-foreground";
  }
}

export function RuntimeActionsBar({
  summary,
  projectId,
  className,
}: {
  summary: RunSummaryDto;
  projectId: string | null;
  className?: string;
}) {
  const refresh = useRefreshRuntime(summary, projectId);
  const validate = useValidateIntegrity(summary, projectId);
  const rebuild = useRebuildObservability(summary, projectId);
  const retry = useRetryRun(summary, projectId);
  const resume = useResumeRun(summary, projectId);
  const cancel = useCancelRun(summary, projectId);

  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const secondaryActions = useMemo(
    () => [
      { hook: validate, icon: ShieldCheck },
      { hook: rebuild, icon: Sparkles },
      { hook: retry, icon: RotateCcw },
      { hook: resume, icon: Play },
    ],
    [validate, rebuild, retry, resume],
  );

  const secondaryVisible = secondaryActions.filter(({ hook }) =>
    visibilityOk(hook.availability),
  );

  const showRefresh = visibilityOk(refresh.availability);
  const showCancel = cancel.availability.available;
  const showMore = secondaryVisible.length > 0;

  const allHooks = useMemo(
    () => [refresh, validate, rebuild, retry, resume, cancel],
    [refresh, validate, rebuild, retry, resume, cancel],
  );

  const anyPending = allHooks.some((h) => h.isPending);

  const lastFeedback = useMemo(() => {
    for (const h of [...allHooks].reverse()) {
      if (h.lastResult) return h.lastResult;
    }
    return null;
  }, [allHooks]);

  const onActionClick = useCallback(
    (actionId: RuntimeActionId, run: () => void) => {
      setMoreOpen(false);
      if (actionRequiresConfirmation(actionId)) {
        setPendingConfirm(actionId);
        return;
      }
      run();
    },
    [],
  );

  const confirmHook = pendingConfirm
    ? allHooks.find((h) => h.actionId === pendingConfirm)
    : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 border-b border-border/60 bg-muted/15 px-2.5 py-1.5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {showRefresh ? (
          <RuntimeActionButton
            key={refresh.actionId}
            label={refresh.label}
            icon={RefreshCw}
            availability={refresh.availability}
            isPending={refresh.isPending}
            variant="ghost"
            onClick={() => onActionClick(refresh.actionId, () => refresh.run())}
          />
        ) : null}

        {showCancel ? (
          <RuntimeActionButton
            key={cancel.actionId}
            label={cancel.label}
            icon={Ban}
            availability={cancel.availability}
            isPending={cancel.isPending}
            variant="destructive"
            onClick={() =>
              onActionClick(cancel.actionId, () => cancel.run())
            }
          />
        ) : null}

        {showMore ? (
          <div className="relative">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="size-7 shrink-0"
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              title="Mais acções"
              onClick={() => setMoreOpen((o) => !o)}
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
            {moreOpen ? (
              <>
                <button
                  type="button"
                  aria-hidden
                  className="fixed inset-0 z-20 cursor-default"
                  onClick={() => setMoreOpen(false)}
                />
                <div
                  role="menu"
                  className="absolute right-0 top-full z-30 mt-1 min-w-[12rem] rounded-md border border-border bg-popover py-0.5 shadow-md"
                  onClick={(e) => e.stopPropagation()}
                >
                  {secondaryVisible.map(({ hook, icon }) => {
                    const Icon = icon;
                    const off = visuallyDisabled(
                      hook.availability,
                      hook.isPending,
                    );
                    return (
                      <button
                        key={hook.actionId}
                        role="menuitem"
                        type="button"
                        disabled={off}
                        title={
                          hook.availability.disabledReason ||
                          hook.label
                        }
                        className={cn(
                          "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40",
                        )}
                        onClick={() => {
                          if (off) return;
                          onActionClick(hook.actionId, () => hook.run());
                        }}
                      >
                        {hook.isPending ? (
                          <span className="size-3 animate-pulse rounded-sm bg-muted" />
                        ) : (
                          <Icon className="size-3.5 shrink-0 opacity-80" />
                        )}
                        <span className="font-medium">{hook.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {pendingConfirm && confirmHook ? (
        <RuntimeActionConfirm
          actionId={pendingConfirm}
          summary={summary}
          open
          isPending={confirmHook.isPending}
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => {
            confirmHook.run();
            setPendingConfirm(null);
          }}
        />
      ) : null}

      {anyPending ? (
        <p className="text-[10px] text-muted-foreground" role="status">
          A aguardar resposta do runtime…
        </p>
      ) : null}

      {lastFeedback && !anyPending ? (
        <p
          className={cn(
            "text-[10px] font-mono",
            feedbackTone(lastFeedback.outcome),
          )}
          role="status"
        >
          {lastFeedback.message}
        </p>
      ) : null}
    </div>
  );
}
