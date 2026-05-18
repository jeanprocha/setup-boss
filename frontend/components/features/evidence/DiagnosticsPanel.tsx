"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/primitives/EmptyState";
import type { ArtifactVm, DiagnosticVm } from "@/lib/runtime/evidence-types";
import {
  runtimeSeverityLabel,
  severityDotClass,
  severityTextClass,
} from "@/lib/runtime/adapters/runtime-labels";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { cn } from "@/lib/utils";
import { Stethoscope } from "lucide-react";

function sevTone(d: DiagnosticVm): string {
  if (d.severity === "error") return "border-sb-failed/35 bg-sb-failed/8";
  if (d.severity === "warn" || d.severity === "integrity")
    return "border-amber-500/35 bg-amber-500/8";
  return "border-border/50 bg-background/25";
}

export function DiagnosticsPanel({
  diagnostics,
  artifactsById,
  degraded,
  diagnosticsUnavailable,
}: {
  diagnostics: DiagnosticVm[];
  artifactsById: Map<string, ArtifactVm>;
  degraded: boolean;
  diagnosticsUnavailable: boolean;
}) {
  const setArtifact = useMissionShellStore(
    (s) => s.setSelectedEvidenceArtifactId,
  );

  if (diagnosticsUnavailable || !diagnostics.length) {
    return (
      <div className="space-y-2">
        {degraded ? (
          <p className="rounded-md border border-amber-500/35 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-50">
            Runtime degradado — diagnostics podem estar incompletos.
          </p>
        ) : null}
        <EmptyState
          icon={Stethoscope}
          title={
            diagnosticsUnavailable
              ? "Diagnostics indisponíveis"
              : "Sem diagnostics"
          }
          hint={
            diagnosticsUnavailable
              ? "Job real sem feed de diagnostics nesta build."
              : "Nenhum aviso ou erro registado para esta corrida."
          }
          className="py-10"
        />
      </div>
    );
  }

  return (
    <ScrollArea className="h-full min-h-0">
      <ul className="space-y-2 p-2 pr-3">
        {diagnostics.map((d) => {
          const rel = d.relatedArtifactId
            ? artifactsById.get(d.relatedArtifactId)
            : null;
          return (
            <li key={d.id}>
              <button
                type="button"
                disabled={!d.relatedArtifactId}
                onClick={() =>
                  d.relatedArtifactId && setArtifact(d.relatedArtifactId)
                }
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                  sevTone(d),
                  d.relatedArtifactId &&
                    "cursor-pointer hover:border-cyan-500/40",
                  !d.relatedArtifactId && "cursor-default opacity-95",
                )}
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
                  <span
                    className={cn(
                      "inline-block size-2 shrink-0 rounded-full ring-2",
                      severityDotClass(
                        d.severity === "integrity" ? "warn" : d.severity,
                      ),
                    )}
                    aria-hidden
                  />
                  <span>{d.tsLabel}</span>
                  <span className="text-foreground/90">{d.code}</span>
                  <span
                    className={severityTextClass(
                      d.severity === "integrity" ? "warn" : d.severity,
                    )}
                  >
                    {d.severity === "integrity"
                      ? "Integridade"
                      : runtimeSeverityLabel(d.severity)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-3 text-[12px] leading-snug text-foreground/95">
                  {d.message}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                  {d.relatedPhase ? (
                    <Badge variant="outline" className="h-5 px-1.5">
                      fase {d.relatedPhase}
                    </Badge>
                  ) : null}
                  {d.relatedRunId ? (
                    <Badge variant="secondary" className="h-5 px-1.5 font-mono">
                      run {d.relatedRunId}
                    </Badge>
                  ) : null}
                  {rel ? (
                    <Badge
                      variant="outline"
                      className="h-5 max-w-[12rem] truncate px-1.5 font-mono text-cyan-100"
                    >
                      artifact {rel.displayName}
                    </Badge>
                  ) : null}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}
