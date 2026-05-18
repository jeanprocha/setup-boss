"use client";

import type { CorrectionLoopDto } from "@/lib/runtime/execution/execution-types";
import { GitCompare } from "lucide-react";

export function CorrectionLoopCard({
  correction,
}: {
  correction: CorrectionLoopDto;
}) {
  const hasCorrection =
    correction.status !== "idle" || correction.generation > 0;

  if (!hasCorrection) return null;

  return (
    <div className="space-y-1.5 rounded-md border border-violet-500/25 bg-violet-500/5 p-2">
      <div className="flex items-center gap-2 text-xs font-medium text-violet-100">
        <GitCompare className="size-3.5" />
        Correcção · geração {correction.generation} · {correction.status}
      </div>
      {correction.summary ? (
        <p className="line-clamp-3 text-[11px] leading-snug text-foreground/85">
          {correction.summary}
        </p>
      ) : null}
      {correction.rejectionReason ? (
        <p className="text-[11px] text-muted-foreground">
          Origem: {correction.rejectionReason}
        </p>
      ) : null}
      {correction.approvedAfterCorrection ? (
        <p className="text-[10px] font-medium text-sb-success">
          Aprovado após correcção
        </p>
      ) : null}
    </div>
  );
}
