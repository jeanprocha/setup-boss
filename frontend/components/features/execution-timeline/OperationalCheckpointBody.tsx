"use client";

import type { ReactNode } from "react";
import type { RuntimeCheckpointPresentation } from "@/lib/runtime/adapters/runtime-checkpoint-copy";

function actorLabel(actor: RuntimeCheckpointPresentation["actor"]): string {
  switch (actor) {
    case "user":
      return "Você";
    case "runtime":
      return "Execução automática";
    default:
      return "Sistema";
  }
}

export function OperationalCheckpointBody({
  checkpoint,
  technicalFooter,
}: {
  checkpoint: RuntimeCheckpointPresentation;
  technicalFooter?: ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <p className="text-[12px] leading-relaxed text-foreground/90">
        {checkpoint.description}
      </p>
      <dl className="space-y-1 border-t border-border/55 pt-2 dark:border-border/40">
        {checkpoint.details.map(
          (row: RuntimeCheckpointPresentation["details"][number]) => (
            <div
              key={`${row.label}-${row.value}`}
              className="grid grid-cols-[minmax(0,38%)_1fr] gap-x-2 gap-y-0.5 text-[11px]"
            >
              <dt className="font-medium text-foreground/58 dark:text-muted-foreground">
                {row.label}
              </dt>
              <dd className="min-w-0 font-medium text-foreground">
                {row.value}
              </dd>
            </div>
          ),
        )}
      </dl>
      {checkpoint.nextAction ? (
        <p className="text-[11px] text-foreground/92">
          <span className="font-semibold text-muted-foreground">
            Próximo passo
          </span>
          {" · "}
          {checkpoint.nextAction}
        </p>
      ) : null}
      <p className="text-[10px] text-muted-foreground">
        <span className="font-semibold text-foreground/72 dark:text-muted-foreground">
          Responsável
        </span>
        {" · "}
        {actorLabel(checkpoint.actor)}
      </p>
      {technicalFooter ? (
        <div className="border-t border-border/55 pt-1.5 dark:border-border/40">
          {technicalFooter}
        </div>
      ) : null}
    </div>
  );
}
