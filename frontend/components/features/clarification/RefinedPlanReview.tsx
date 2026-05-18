"use client";

import type { ReactNode } from "react";
import { Surface } from "@/components/primitives/Surface";
import type { RefinementPreviewDto } from "@/lib/runtime/clarification/clarification-types";
import { parseRefinedPlanPresentation } from "@/lib/runtime/clarification/parse-refined-plan";
import {
  AlertTriangle,
  CheckSquare,
  ListOrdered,
  Target,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";

function PlanBlock({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: typeof Target;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-md border border-border/40 bg-muted/10 px-3 py-2.5",
        className,
      )}
    >
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {title}
      </h3>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1 text-[12px] leading-snug text-foreground/90">
      {items.map((item, index) => (
        <li key={`${index}-${item.slice(0, 40)}`} className="flex gap-2">
          <span className="mt-[0.45rem] size-1 shrink-0 rounded-full bg-cyan-600/70 dark:bg-cyan-400/70" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function NumberedList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ol className="space-y-1 text-[12px] leading-snug text-foreground/90">
      {items.map((item, i) => (
        <li key={`${i}-${item}`} className="flex gap-2">
          <span className="w-4 shrink-0 font-mono text-[10px] font-semibold text-muted-foreground">
            {i + 1}.
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

export function RefinedPlanReview({
  refinement,
  className,
}: {
  refinement: RefinementPreviewDto;
  className?: string;
}) {
  const model = parseRefinedPlanPresentation(refinement);

  if (!model.hasContent) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Plano refinado em preparação — aguarde a consolidação do runtime.
      </p>
    );
  }

  return (
    <Surface variant="inset" className={cn("space-y-2.5 p-3", className)}>
      {model.objective ? (
        <PlanBlock title="Objetivo" icon={Target}>
          <p className="text-[12px] leading-relaxed text-foreground/92">
            {model.objective}
          </p>
        </PlanBlock>
      ) : null}

      {model.scopeIncluded.length > 0 || model.scopeExcluded.length > 0 ? (
        <PlanBlock title="Escopo" icon={Workflow}>
          <div className="space-y-2">
            {model.scopeIncluded.length > 0 ? (
              <div>
                <p className="mb-1 text-[10px] font-medium text-muted-foreground">
                  Incluído
                </p>
                <BulletList items={model.scopeIncluded} />
              </div>
            ) : null}
            {model.scopeExcluded.length > 0 ? (
              <div>
                <p className="mb-1 text-[10px] font-medium text-muted-foreground">
                  Fora do escopo
                </p>
                <BulletList items={model.scopeExcluded} />
              </div>
            ) : null}
          </div>
        </PlanBlock>
      ) : null}

      {model.scopeChanges.length > 0 ? (
        <PlanBlock title="O que mudou após clarificação" icon={Workflow}>
          <BulletList items={model.scopeChanges} />
        </PlanBlock>
      ) : null}

      {model.executionOrder.length > 0 ? (
        <PlanBlock title="Ordem de execução" icon={ListOrdered}>
          <NumberedList items={model.executionOrder} />
        </PlanBlock>
      ) : null}

      {model.acceptanceCriteria.length > 0 ? (
        <PlanBlock title="Critérios de aceite" icon={CheckSquare}>
          <BulletList items={model.acceptanceCriteria} />
        </PlanBlock>
      ) : null}

      {model.risks.length > 0 ? (
        <PlanBlock title="Atenções" icon={AlertTriangle}>
          <ul className="space-y-1 text-[12px] leading-snug text-amber-950 dark:text-amber-100/90">
            {model.risks.map((r, index) => (
              <li key={`${index}-${r.slice(0, 40)}`} className="flex gap-2">
                <span className="mt-[0.45rem] size-1 shrink-0 rounded-full bg-amber-500/80" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </PlanBlock>
      ) : null}
    </Surface>
  );
}

