"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Clipboard } from "lucide-react";
import {
  formatIntakeTimeoutDiagnosticCopy,
  INTAKE_TIMEOUT_CODE,
  intakeTimeoutBody,
  intakeTimeoutTitle,
  safeClipboardWrite,
} from "@/lib/runtime/intake/intake-timeout-error";
import type { StructuredPreRunError } from "@/lib/runtime/intake/pre-run-error";
import { useMissionLayoutStore } from "@/stores/mission-layout-store";

export function isIntakeTimeoutPreRunError(
  err: StructuredPreRunError | null | undefined,
): boolean {
  return err?.code === INTAKE_TIMEOUT_CODE;
}

export function IntakeTimeoutErrorPanel({
  error,
  onRetry,
}: {
  error: StructuredPreRunError;
  onRetry?: () => void;
}) {
  const [techOpen, setTechOpen] = useState(false);
  const details =
    error.details && typeof error.details === "object"
      ? (error.details as Record<string, unknown>)
      : {};

  const openObserve = () => {
    useMissionLayoutStore.getState().setRightTimelineOpen(true);
    useMissionLayoutStore.getState().setRightPanelTab("observe");
  };

  return (
    <div className="space-y-2">
      <p className="text-[12px] font-semibold text-destructive/95">
        {intakeTimeoutTitle()}
      </p>
      <p className="text-[11px] leading-relaxed text-foreground/90">
        {intakeTimeoutBody()}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {onRetry ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            onClick={onRetry}
          >
            Tentar novamente
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[11px]"
          onClick={openObserve}
        >
          Ver observabilidade
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[11px]"
          onClick={() => safeClipboardWrite(formatIntakeTimeoutDiagnosticCopy(error))}
        >
          <Clipboard className="mr-1 size-3" />
          Copiar diagnóstico completo
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-[10px]"
          onClick={() => setTechOpen((v) => !v)}
        >
          {techOpen ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
          Detalhes técnicos
        </Button>
      </div>
      {techOpen ? (
        <ul className="space-y-0.5 rounded border border-border/50 bg-muted/20 px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
          <li>
            <span className="text-foreground/70">endpoint: </span>
            {String(details.endpoint ?? "POST /runs")}
          </li>
          <li>
            <span className="text-foreground/70">method: </span>
            {String(details.method ?? "POST")}
          </li>
          {details.timeoutMs != null ? (
            <li>
              <span className="text-foreground/70">timeoutMs: </span>
              {String(details.timeoutMs)}
            </li>
          ) : null}
          {error.projectId ? (
            <li>
              <span className="text-foreground/70">projectId: </span>
              {error.projectId}
            </li>
          ) : null}
          {details.selectedProjectId ? (
            <li>
              <span className="text-foreground/70">selectedProjectId: </span>
              {String(details.selectedProjectId)}
            </li>
          ) : null}
          {error.traceId ? (
            <li>
              <span className="text-foreground/70">traceId: </span>
              {error.traceId}
            </li>
          ) : null}
          {details.rawMessage ? (
            <li className="[overflow-wrap:anywhere]">
              <span className="text-foreground/70">raw: </span>
              {String(details.rawMessage)}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
