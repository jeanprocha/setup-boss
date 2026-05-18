"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Clipboard } from "lucide-react";
import { IaValidationDiagnosticSections } from "@/components/features/observability/IaValidationDiagnosticSections";
import {
  formatPreRunDiagnosticCopy,
  intakeInlineTitle,
  type StructuredPreRunError,
} from "@/lib/runtime/intake/pre-run-error";
import { parseIaValidation } from "@/lib/runtime/intake/ia-validation";
import { cn } from "@/lib/utils";

function formatTs(ts?: string): string {
  if (!ts) return "—";
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return ts;
  return new Date(t).toLocaleString();
}

export function PreRunDiagnosticEventCard({
  event,
  projectLabel,
  className,
  surface = "default",
}: {
  event: StructuredPreRunError & {
    id?: string;
    event?: string;
    summary?: string;
  };
  projectLabel?: string | null;
  className?: string;
  surface?: "default" | "sidebar";
}) {
  const [rawOpen, setRawOpen] = useState(false);
  const title = intakeInlineTitle(event);
  const phase = event.phase?.trim() || "submit";
  const code = event.code || "pre_run_failed";
  const actions = event.suggestedActions ?? [];
  const ia = parseIaValidation(event.iaValidation);
  const summary =
    event.summary?.trim() || event.description?.trim() || event.message;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatPreRunDiagnosticCopy(event));
    } catch {
      /* noop */
    }
  };

  return (
    <div
      className={cn(
        surface === "sidebar"
          ? "rounded-md border border-sidebar-border/70 border-l-2 border-l-rose-500/55 bg-sidebar-accent/8 px-2.5 py-2"
          : "rounded-md border border-rose-500/45 bg-rose-500/6 px-3 py-2.5 shadow-sm",
        className,
      )}
    >
      <div className="space-y-1.5">
        <p className="text-[8px] font-semibold leading-snug text-foreground">{title}</p>
        <p className="font-mono text-[8px] text-muted-foreground">
          <span className="text-destructive/90">{code}</span>
          <span className="text-muted-foreground/70"> · </span>
          <span>{phase}</span>
          {ia?.specVersion ? (
            <>
              <span className="text-muted-foreground/70"> · </span>
              <span>SPEC v{ia.specVersion}</span>
            </>
          ) : null}
        </p>
        <p className="text-[8px] text-muted-foreground">
          {formatTs(event.timestamp)}
          {projectLabel ? ` · ${projectLabel}` : null}
          {event.projectId && !projectLabel ? ` · ${event.projectId}` : null}
        </p>
        <p className="text-[8px] leading-relaxed text-foreground/90">{summary}</p>
      </div>

      {ia ? (
        <IaValidationDiagnosticSections
          ia={ia}
          surface={surface === "sidebar" ? "sidebar" : "default"}
        />
      ) : null}

      {actions.length > 0 ? (
        <div className="mt-2 space-y-1">
          <p className="text-[8px] font-medium text-foreground/80">
            Ações sugeridas:
          </p>
          <ol className="list-decimal space-y-0.5 pl-4 text-[8px] text-foreground/85">
            {actions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[8px]"
          onClick={() => void onCopy()}
        >
          <Clipboard className="mr-1 size-3" />
          Copiar diagnóstico completo
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-[8px]"
          onClick={() => setRawOpen((v) => !v)}
        >
          {rawOpen ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
          {rawOpen ? "Recolher payload" : "Raw payload"}
        </Button>
      </div>
      {rawOpen ? (
        <pre
          className={cn(
            "mt-2 max-h-48 overflow-auto rounded border p-2 font-mono text-[8px] leading-relaxed text-foreground/85",
            surface === "sidebar"
              ? "border-sidebar-border/50 bg-sidebar-accent/10"
              : "border-border/40 bg-muted/20",
          )}
        >
          {JSON.stringify(event, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
