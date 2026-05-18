"use client";

import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/primitives/Surface";
import type { IntegrityReportVm } from "@/lib/runtime/evidence-types";
import type { IntegrityUiState } from "@/lib/runtime/adapters/runtime-labels";
import {
  integrityBadgeClass,
  integrityStateLabel,
} from "@/lib/runtime/adapters/runtime-labels";
import { cn } from "@/lib/utils";
import { ShieldCheck } from "lucide-react";

type TriState = "pass" | "warn" | "fail";

function pill(
  label: string,
  v: TriState,
): { text: string; className: string } {
  const ok = v === "pass";
  const mid = v === "warn";
  return {
    text: `${label} · ${v}`,
    className: cn(
      "rounded px-1.5 py-0.5 text-[10px] font-medium",
      ok && "bg-emerald-500/15 text-emerald-100",
      mid && "bg-amber-500/15 text-amber-100",
      !ok && !mid && "bg-sb-failed/15 text-sb-failed",
    ),
  };
}

export function IntegrityRuntimeView({
  report,
  unavailable,
}: {
  report: IntegrityReportVm | null;
  unavailable?: boolean;
}) {
  if (unavailable || !report) {
    return (
      <Surface variant="inset" className="space-y-1 p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <ShieldCheck className="size-4" aria-hidden />
          Integridade runtime
        </div>
        <p className="text-[12px] text-muted-foreground">
          Relatório de integridade indisponível para esta corrida ou ainda não
          emitido.
        </p>
      </Surface>
    );
  }

  const stateLabel = integrityStateLabel(report.state as IntegrityUiState);
  const contPill = pill("Continuidade", report.continuity);
  const crossPill = pill("Cross-validation", report.crossValidation);

  return (
    <Surface className="space-y-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-emerald-300/90" aria-hidden />
          Integridade runtime
        </div>
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 text-[10px] font-medium",
            integrityBadgeClass(report.state as IntegrityUiState),
          )}
        >
          {stateLabel}
        </span>
      </div>
      <p className="text-[12px] leading-snug text-muted-foreground">
        {report.summary}
      </p>
      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="text-muted-foreground">Validado</span>
        <Badge variant="outline" className="font-mono text-[10px]">
          {report.validatedAtLabel}
        </Badge>
        <span className="text-muted-foreground">Fonte</span>
        <Badge variant="secondary" className="text-[10px]">
          {report.validationSource}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className={contPill.className}>{contPill.text}</span>
        <span className={crossPill.className}>{crossPill.text}</span>
        <Badge variant="outline" className="text-[10px]">
          avisos {report.warningsCount}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          inconsistências {report.inconsistenciesCount}
        </Badge>
      </div>
    </Surface>
  );
}
