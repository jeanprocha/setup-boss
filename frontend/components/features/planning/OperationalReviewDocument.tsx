"use client";

import type { OperationalReviewPresentation } from "@/lib/runtime/operational/operational-review-types";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";

function CriterionIcon({
  state,
}: {
  state: OperationalReviewPresentation["acceptanceCriteria"][0]["state"];
}) {
  if (state === "met") {
    return <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />;
  }
  if (state === "attention") {
    return <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />;
  }
  return <Circle className="size-3.5 text-muted-foreground/50" />;
}

export function OperationalReviewDocument({
  document: doc,
}: {
  document: OperationalReviewPresentation;
}) {
  if (!doc.hasContent) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Ainda não há dados consolidados de review para esta corrida. Conclua a
        execução e aguarde a indexação de evidências.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {doc.summary ? (
        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold text-foreground">Resumo</h3>
          <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-foreground/90">
            {doc.summary}
          </p>
        </section>
      ) : null}

      {doc.automaticValidationLabel ? (
        <p className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground">
          {doc.automaticValidationLabel}
        </p>
      ) : null}

      {doc.adjustmentsLabel ? (
        <p className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground">
          {doc.adjustmentsLabel}
        </p>
      ) : null}

      {doc.changedFiles.length > 0 ? (
        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold text-foreground">
            Ficheiros alterados
          </h3>
          <ul className="max-h-36 space-y-0.5 overflow-y-auto rounded-md border border-border/40 bg-muted/10 px-2 py-1.5 font-mono text-[10px] text-foreground/85">
            {doc.changedFiles.map((f) => (
              <li key={f} className="truncate">
                {f}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {doc.acceptanceCriteria.length > 0 ? (
        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold text-foreground">
            Critérios de aceite
          </h3>
          <ul className="space-y-1">
            {doc.acceptanceCriteria.map((c) => (
              <li
                key={c.id}
                className="flex items-start gap-2 rounded-md border border-border/40 bg-muted/15 px-2.5 py-2 text-[11px]"
              >
                <CriterionIcon state={c.state} />
                <div className="min-w-0 flex-1">
                  <p className="text-foreground/90">{c.label}</p>
                  <span
                    className={cn(
                      "text-[10px]",
                      c.state === "met"
                        ? "text-emerald-700 dark:text-emerald-300"
                        : c.state === "attention"
                          ? "text-amber-700 dark:text-amber-300"
                          : "text-muted-foreground",
                    )}
                  >
                    {c.stateLabelPt}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {doc.validations.length > 0 ? (
        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold text-foreground">
            Validações e testes
          </h3>
          <ul className="space-y-1">
            {doc.validations.map((v) => (
              <li
                key={v.id}
                className={cn(
                  "rounded-md border px-2.5 py-2 text-[11px]",
                  v.severity === "fail"
                    ? "border-destructive/30 bg-destructive/5 text-destructive"
                    : v.severity === "warn"
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100"
                      : "border-border/40 bg-muted/15 text-foreground/85",
                )}
              >
                {v.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {doc.risksAndPending.length > 0 ? (
        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold text-foreground">
            Pontos de atenção
          </h3>
          <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
            {doc.risksAndPending.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
