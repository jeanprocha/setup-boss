"use client";

import { Badge } from "@/components/ui/badge";
import { useRuntimeHeartbeatSnapshot } from "@/hooks/use-runtime-heartbeat";
import { deriveRuntimeOperationalContext } from "@/lib/runtime/observability/derive-runtime-operational-context";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { cn } from "@/lib/utils";

export function RuntimeOperationalHeartbeatBadge({
  className,
}: {
  className?: string;
}) {
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);
  const { heartbeat, isError, isLoading } = useRuntimeHeartbeatSnapshot();
  const ctx = deriveRuntimeOperationalContext({
    heartbeat,
    runKey: null,
    uiActivelyProcessing: false,
  });

  const daemonOffline =
    !reachable ||
    (isError && !heartbeat) ||
    (heartbeat != null && ctx.runtimeHealth === "offline");

  if (daemonOffline) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "border-rose-500/40 bg-rose-500/10 text-[8px] font-medium text-rose-800 dark:text-rose-100/90",
          className,
        )}
      >
        Daemon offline
      </Badge>
    );
  }

  if (isLoading && !heartbeat) {
    return (
      <HeartbeatBadgeRow
        runtimeHealth="unknown"
        workerState="unknown"
        className={className}
      />
    );
  }

  return (
    <HeartbeatBadgeRow
      runtimeHealth={ctx.runtimeHealth}
      workerState={ctx.workerState}
      className={className}
    />
  );
}

function HeartbeatBadgeRow({
  runtimeHealth,
  workerState,
  className,
}: {
  runtimeHealth: "online" | "offline" | "unknown";
  workerState: "idle" | "busy" | "unknown";
  className?: string;
}) {
  const daemonLabel =
    runtimeHealth === "online"
      ? "Daemon online"
      : runtimeHealth === "offline"
        ? "Daemon offline"
        : "Daemon —";

  const workerLabel =
    workerState === "busy"
      ? "Worker busy"
      : workerState === "idle"
        ? "Worker idle"
        : "Worker —";

  const daemonTone =
    runtimeHealth === "online"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100/90"
      : runtimeHealth === "offline"
        ? "border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-100/90"
        : "border-border/50 text-muted-foreground";

  const workerTone =
    workerState === "busy"
      ? "border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-100/90"
      : "border-border/50 bg-muted/20 text-muted-foreground";

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      <Badge variant="outline" className={cn("text-[8px] font-medium", daemonTone)}>
        {daemonLabel}
      </Badge>
      <Badge variant="outline" className={cn("text-[8px] font-medium", workerTone)}>
        {workerLabel}
      </Badge>
    </div>
  );
}
