"use client";

import { Surface } from "@/components/primitives/Surface";
import type {
  RecoveryStateDto,
  RetryStateDto,
} from "@/lib/runtime/execution/execution-types";
import { HeartPulse, RotateCcw } from "lucide-react";

export function RetryRecoveryCard({
  retry,
  recovery,
}: {
  retry: RetryStateDto;
  recovery: RecoveryStateDto;
}) {
  const hasRetry = retry.active || retry.count > 0;
  const hasRecovery = recovery.status !== "none";

  if (!hasRetry && !hasRecovery) return null;

  return (
    <Surface variant="inset" className="space-y-3 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Retry · Recuperação
      </p>

      {hasRetry ? (
        <div className="space-y-1 rounded-md border border-cyan-500/25 bg-cyan-500/5 p-2">
          <div className="flex items-center gap-2 text-xs font-medium text-cyan-100">
            <RotateCcw className="size-3.5" />
            Retry {retry.count}/{retry.maxAttempts}
            {retry.active ? " · activo" : ""}
          </div>
          {retry.reason ? (
            <p className="text-[11px] text-muted-foreground">{retry.reason}</p>
          ) : null}
          {retry.lastAttemptAt ? (
            <p className="font-mono text-[10px] text-muted-foreground">
              último · {retry.lastAttemptAt}
            </p>
          ) : null}
        </div>
      ) : null}

      {hasRecovery ? (
        <div className="space-y-1 rounded-md border border-emerald-500/25 bg-emerald-500/5 p-2">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-100">
            <HeartPulse className="size-3.5" />
            Recuperação · {recovery.status}
          </div>
          {recovery.summary ? (
            <p className="text-[11px] leading-snug text-foreground/85">
              {recovery.summary}
            </p>
          ) : null}
          <p className="font-mono text-[10px] text-muted-foreground">
            recuperadas {recovery.recoveredSubtasks} · problemáticas{" "}
            {recovery.problematicSubtasks}
          </p>
        </div>
      ) : null}
    </Surface>
  );
}
