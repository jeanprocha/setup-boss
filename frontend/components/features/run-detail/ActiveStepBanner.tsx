"use client";

import { memo, useMemo } from "react";
import { useI18n } from "@/lib/i18n/use-i18n";
import {
  resolveActiveStepBannerView,
  type ActiveStepBannerVariant,
} from "@/lib/runtime/ux/resolve-active-step-banner-view";
import type { RunUxState } from "@/lib/runtime/ux/runtime-ux-types";
import type { VersioningCheckpointContext } from "@/lib/runtime/ux/operational-visual-model";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react";

const VARIANT_STYLES: Record<
  ActiveStepBannerVariant,
  { container: string; icon: string; dot: string }
> = {
  running: {
    container: "border-sb-running/35 bg-sb-running/10",
    icon: "text-sb-running",
    dot: "bg-sb-running",
  },
  waiting_user_action: {
    container: "border-amber-500/40 bg-amber-500/12",
    icon: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  stalled: {
    container: "border-amber-500/40 bg-amber-500/12",
    icon: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  completed: {
    container:
      "border-emerald-600/40 bg-emerald-500/12 dark:border-emerald-500/40 dark:bg-emerald-500/10",
    icon: "text-emerald-800 dark:text-emerald-300",
    dot: "bg-emerald-600 dark:bg-emerald-400",
  },
  failed: {
    container: "border-sb-failed/45 bg-sb-failed/10",
    icon: "text-sb-failed",
    dot: "bg-sb-failed",
  },
};

export type ActiveStepBannerProps = {
  ux: RunUxState;
  attentionHint?: string | null;
  onPrepareBranch?: () => void;
  prepareBranchPending?: boolean;
  versioning?: VersioningCheckpointContext;
  className?: string;
};

function ActiveStepBannerInner({
  ux,
  attentionHint,
  onPrepareBranch,
  prepareBranchPending = false,
  versioning,
  className,
}: ActiveStepBannerProps) {
  const { t } = useI18n();
  const view = useMemo(
    () => resolveActiveStepBannerView(ux, { attentionHint, versioning }),
    [ux, attentionHint, versioning],
  );

  const styles = VARIANT_STYLES[view.variant];
  const Icon =
    view.variant === "completed"
      ? CheckCircle2
      : view.variant === "failed"
        ? XCircle
        : view.variant === "running"
          ? Loader2
          : AlertTriangle;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "mb-3 rounded-lg border px-3.5 py-2.5 shadow-sm",
        styles.container,
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={cn(
            "mt-0.5 size-5 shrink-0",
            styles.icon,
            view.variant === "running" && "animate-spin",
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-semibold leading-snug text-foreground">
              {view.headline}
            </p>
            <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <span
                className={cn("size-1.5 rounded-full", styles.dot)}
                aria-hidden
              />
              {view.stepLabel}
            </span>
          </div>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {view.detail}
          </p>
          {view.showPrepareBranchCta && onPrepareBranch ? (
            <Button
              type="button"
              size="sm"
              className="mt-1 h-8 shadow-sm"
              disabled={prepareBranchPending}
              onClick={onPrepareBranch}
            >
              {prepareBranchPending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : null}
              Preparar branch
            </Button>
          ) : null}
          {view.showObservabilityFooter ? (
            <p className="text-[11px] text-muted-foreground/90">
              {t("observability.activityFeedObservabilityFooter")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const ActiveStepBanner = memo(ActiveStepBannerInner);