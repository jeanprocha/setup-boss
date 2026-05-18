"use client";

import type { ReactNode } from "react";
import type { OperationalPlanPresentation } from "@/lib/runtime/operational/operational-plan-types";
import type {
  OperationalPlanExecutableMiniTaskView,
  OperationalPlanExpectedImpactView,
} from "@/lib/runtime/operational/operational-plan-executable-view";
import { shouldShowExpectedImpactSection } from "@/lib/runtime/operational/operational-plan-executable-view";
import type { ExecutionLevelId } from "@/lib/runtime/operational/operational-plan-execution-level";
import { PlanComplexitySentence } from "@/components/features/planning/PlanExecutionProfileBlock";
import { cn } from "@/lib/utils";

const SHEET_BASE =
  "rounded-sm border border-border/10 bg-muted/[1] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_14px_-2px_rgba(0,0,0,0.07)] dark:bg-white/[0.04] dark:shadow-[0_1px_2px_rgba(0,0,0,0.28),0_6px_20px_-4px_rgba(0,0,0,0.38)]";

const SHEET_PADDING = {
  default: "px-5 py-6 sm:px-7 sm:py-7",
  detailed: "px-6 py-7 sm:px-8 sm:py-8",
  minimal: "px-5 py-6 sm:px-6 sm:py-6",
  compact: "px-4 py-4 sm:px-5 sm:py-5",
} as const;

export function OperationalPlanDocument({
  plan,
  detailed = false,
  appearance = "default",
  footer,
  executionLevel,
  onExecutionLevelChange,
  executionSelectDisabled = false,
  historical = false,
  active = false,
  compact = false,
  supersededLabel,
  title,
}: {
  plan: OperationalPlanPresentation;
  detailed?: boolean;
  appearance?: "default" | "minimal";
  footer?: ReactNode;
  executionLevel?: ExecutionLevelId;
  onExecutionLevelChange?: (level: ExecutionLevelId) => void;
  executionSelectDisabled?: boolean;
  historical?: boolean;
  active?: boolean;
  compact?: boolean;
  supersededLabel?: string;
  title?: string;
}) {
  const paddingKey = compact
    ? "compact"
    : detailed
      ? "detailed"
      : appearance === "minimal"
        ? "minimal"
        : "default";
  const bodyClass = compact
    ? "text-[12px] leading-[1.6] text-foreground/80"
    : "text-[13px] leading-[1.65] text-foreground/85";

  const oesView = plan.executableStrategyView;
  const useRichOes = oesView?.mode === "full" && !compact;
  const useCompactMiniTasks = oesView?.mode === "full" && compact;
  const showDegradedNotice = oesView?.mode === "degraded";

  const richExecution = oesView?.executionStrategy;
  const legacyExecution =
    plan.executionStrategy.macroOrder.length > 0 ||
    plan.executionStrategy.approach ||
    plan.executionStrategy.dependencies.length > 0;

  const showExecutionSection =
    useRichOes && richExecution
      ? Boolean(
          richExecution.narrative ||
            richExecution.macroOrder.length > 0 ||
            legacyExecution,
        )
      : legacyExecution;

  const hasUnderstanding =
    plan.understanding.summary || plan.understanding.mainObjective;

  return (
    <div
      className={cn(
        SHEET_BASE,
        SHEET_PADDING[paddingKey],
        "plan-document",
        historical && "plan-document--historical opacity-[0.88]",
        active && "plan-document--active",
        compact && "plan-document--compact",
      )}
      data-testid="operational-plan-document"
      data-appearance={appearance}
      data-plan-historical={historical ? "true" : undefined}
      data-plan-active={active ? "true" : undefined}
      data-plan-complexity={plan.complexity?.level ?? ""}
    >
      {active || title || historical ? (
        <div className="mx-auto mb-3 max-w-[42rem] space-y-1">
          {active ? (
            <p className="plan-document__active-badge text-[11px] font-medium text-foreground/70">
              Plano atual para aprovação
            </p>
          ) : null}
          {title ? (
            <p className="text-[11px] font-medium uppercase tracking-wide text-foreground/45">
              {title}
            </p>
          ) : null}
          {historical && supersededLabel ? (
            <p className="text-[11px] text-muted-foreground/90">
              {supersededLabel}
            </p>
          ) : null}
        </div>
      ) : null}

      {showDegradedNotice && oesView?.degradedNotice ? (
        <p className="mx-auto mb-4 max-w-[42rem] text-[11px] text-foreground/45">
          {oesView.degradedNotice}
        </p>
      ) : null}

      <article className="mx-auto max-w-[42rem] space-y-0">
        {hasUnderstanding ? (
          <PlanSection title="Entendimento da atividade" isFirst>
            {plan.understanding.summary ? (
              <p className={cn("whitespace-pre-wrap", bodyClass)}>
                {plan.understanding.summary}
              </p>
            ) : null}
            {plan.understanding.mainObjective ? (
              <p
                className={cn(
                  bodyClass,
                  plan.understanding.summary ? "mt-2.5" : undefined,
                )}
              >
                <span className="text-foreground/55">Objetivo — </span>
                {plan.understanding.mainObjective}
              </p>
            ) : null}
          </PlanSection>
        ) : null}

        {plan.whatWillBeDone.length > 0 ? (
          <PlanSection title="O que será feito">
            <DocList items={plan.whatWillBeDone} />
          </PlanSection>
        ) : null}

        {plan.whatWillChange.length > 0 ? (
          <PlanSection title="O que será alterado">
            <DocList items={plan.whatWillChange} />
          </PlanSection>
        ) : null}

        {plan.outOfScope.length > 0 ? (
          <PlanSection title="Fora do escopo">
            <DocList items={plan.outOfScope} muted />
          </PlanSection>
        ) : null}

        {shouldShowExpectedImpactSection(oesView) ? (
          <PlanSection title="Impacto esperado">
            <ExpectedImpactBlock
              impact={oesView?.expectedImpact ?? null}
              unavailableNotice={oesView?.impactUnavailableNotice}
              bodyClass={bodyClass}
            />
          </PlanSection>
        ) : null}

        {showExecutionSection ? (
          <PlanSection title="Estratégia de execução">
            {useRichOes && richExecution ? (
              <ExecutionStrategyRichBlock
                rich={richExecution}
                legacy={plan.executionStrategy}
                bodyClass={bodyClass}
              />
            ) : (
              <ExecutionStrategyLegacyBlock
                strategy={plan.executionStrategy}
                bodyClass={bodyClass}
              />
            )}
          </PlanSection>
        ) : null}

        <PlanSection title="Complexidade">
          <PlanComplexitySentence
            complexity={plan.complexity}
            recommendation={plan.executionRecommendation}
            selectedLevel={executionLevel}
            onLevelChange={historical ? undefined : onExecutionLevelChange}
            selectDisabled={executionSelectDisabled || historical}
          />
        </PlanSection>

        <PlanSection title="Mini-tarefas">
          {useRichOes && oesView?.miniTasks.length ? (
            <RichMiniTasksList tasks={oesView.miniTasks} bodyClass={bodyClass} />
          ) : useCompactMiniTasks && oesView?.miniTasks.length ? (
            <CompactMiniTasksList tasks={oesView.miniTasks} bodyClass={bodyClass} />
          ) : plan.miniTasks.mode === "divided" ? (
            <LegacyMiniTasksList tasks={plan.miniTasks.tasks} bodyClass={bodyClass} />
          ) : (
            <p className={bodyClass}>{plan.miniTasks.directLabelPt}</p>
          )}
        </PlanSection>

        {plan.risks.length > 0 ? (
          <PlanSection title="Riscos e pontos de atenção">
            <DocList items={plan.risks.map((r) => r.label)} />
          </PlanSection>
        ) : null}

        {plan.completionCriteria.length > 0 ? (
          <PlanSection title="Critério de conclusão">
            <DocList items={plan.completionCriteria} />
          </PlanSection>
        ) : null}
      </article>

      {footer && !historical ? (
        <footer className="mx-auto mt-6 max-w-[42rem] border-t border-border/20 pt-5">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}

function ExpectedImpactBlock({
  impact,
  unavailableNotice,
  bodyClass,
}: {
  impact: OperationalPlanExpectedImpactView | null;
  unavailableNotice: string | null | undefined;
  bodyClass: string;
}) {
  if (unavailableNotice && !impact) {
    return (
      <p className={cn("operational-impact operational-impact--muted", bodyClass)}>
        {unavailableNotice}
      </p>
    );
  }
  if (!impact) return null;

  return (
    <dl className={cn("operational-impact space-y-2.5", bodyClass)}>
      {impact.affectedFiles.length > 0 ? (
        <ImpactRow label="Arquivos afetados" values={impact.affectedFiles} />
      ) : null}
      {impact.affectedComponents.length > 0 ? (
        <ImpactRow label="Componentes afetados" values={impact.affectedComponents} />
      ) : null}
      {impact.affectedModules.length > 0 ? (
        <ImpactRow label="Módulos/domínios afetados" values={impact.affectedModules} />
      ) : null}
      <ImpactRow
        label="Riscos"
        values={[
          `Estrutural: ${impact.structuralRiskLabelPt}`,
          `Visual: ${impact.visualRiskLabelPt}`,
          `Comportamental: ${impact.behaviorRiskLabelPt}`,
        ]}
      />
    </dl>
  );
}

function ImpactRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <dt className="text-[12px] text-foreground/50">{label}</dt>
      <dd className="mt-0.5 text-foreground/85">{values.join(" · ")}</dd>
    </div>
  );
}

function ExecutionStrategyRichBlock({
  rich,
  legacy,
  bodyClass,
}: {
  rich: NonNullable<
    import("@/lib/runtime/operational/operational-plan-executable-view").OperationalPlanExecutionStrategyRichView
  >;
  legacy: OperationalPlanPresentation["executionStrategy"];
  bodyClass: string;
}) {
  return (
    <div className={cn("operational-strategy-summary space-y-3", bodyClass)}>
      {rich.narrative ? <p>{rich.narrative}</p> : null}
      {(rich.orderingModeLabelPt ||
        rich.executionPatternLabelPt ||
        rich.validationApproachLabelPt) && !rich.narrative ? (
        <ul className="space-y-1 text-foreground/80">
          {rich.orderingModeLabelPt ? (
            <li>
              <span className="text-foreground/50">Ordenação — </span>
              {rich.orderingModeLabelPt}
            </li>
          ) : null}
          {rich.executionPatternLabelPt ? (
            <li>
              <span className="text-foreground/50">Padrão — </span>
              {rich.executionPatternLabelPt}
            </li>
          ) : null}
          {rich.validationApproachLabelPt ? (
            <li>
              <span className="text-foreground/50">Validação — </span>
              {rich.validationApproachLabelPt}
            </li>
          ) : null}
        </ul>
      ) : null}
      {rich.macroOrder.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[12px] text-foreground/50">Ordem macro</p>
          <DocOrderedList items={rich.macroOrder} />
        </div>
      ) : null}
      {legacy.approach && !rich.narrative ? (
        <p>
          <span className="text-foreground/50">Abordagem — </span>
          {legacy.approach}
        </p>
      ) : null}
      {legacy.dependencies.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[12px] text-foreground/50">Dependências globais</p>
          <DocList items={legacy.dependencies} />
        </div>
      ) : null}
    </div>
  );
}

function ExecutionStrategyLegacyBlock({
  strategy,
  bodyClass,
}: {
  strategy: OperationalPlanPresentation["executionStrategy"];
  bodyClass: string;
}) {
  return (
    <div className={cn("space-y-3", bodyClass)}>
      {strategy.macroOrder.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[12px] text-foreground/50">Ordem macro</p>
          <DocOrderedList items={strategy.macroOrder} />
        </div>
      ) : null}
      {strategy.approach ? (
        <p>
          <span className="text-foreground/50">Abordagem — </span>
          {strategy.approach}
        </p>
      ) : null}
      {strategy.dependencies.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[12px] text-foreground/50">Dependências</p>
          <DocList items={strategy.dependencies} />
        </div>
      ) : null}
    </div>
  );
}

function RichMiniTasksList({
  tasks,
  bodyClass,
}: {
  tasks: OperationalPlanExecutableMiniTaskView[];
  bodyClass: string;
}) {
  return (
    <ol className="space-y-0">
      {tasks.map((task, index) => (
        <li
          key={task.id}
          className={cn(
            "operational-mini-task py-3",
            index > 0 && "border-t border-border/15",
          )}
        >
          <p className={cn("font-medium text-foreground/90", bodyClass)}>
            {task.order}. {task.title}
          </p>
          {task.objective ? (
            <p className={cn("mt-1", bodyClass)}>
              <span className="text-foreground/50">Objetivo: </span>
              {task.objective}
            </p>
          ) : null}
          {task.scopeSummary ? (
            <p className={cn("mt-1", bodyClass)}>
              <span className="text-foreground/50">Escopo: </span>
              {task.scopeSummary}
            </p>
          ) : null}
          <p className={cn("operational-mini-task__meta mt-1.5", bodyClass)}>
            <span className="text-foreground/50">Complexidade: </span>
            {task.complexityLabelPt}
            <span className="text-foreground/35"> · </span>
            <span className="text-foreground/50">Risco: </span>
            {task.riskLabelPt}
          </p>
          {task.completionCriteria.length > 0 ? (
            <div className="mt-2">
              <p className="text-[12px] text-foreground/50">Critérios:</p>
              <DocList items={task.completionCriteria} />
            </div>
          ) : null}
          {task.dependencyLine ? (
            <p className={cn("mt-2 text-foreground/70", bodyClass)}>
              {task.dependencyLine}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function CompactMiniTasksList({
  tasks,
  bodyClass,
}: {
  tasks: OperationalPlanExecutableMiniTaskView[];
  bodyClass: string;
}) {
  return (
    <ol className="space-y-1">
      {tasks.map((task) => (
        <li key={task.id} className={bodyClass}>
          <span className="text-foreground/55">Mini-tarefa {task.order}</span>
          <span className="text-foreground/35"> — </span>
          {task.title}
        </li>
      ))}
    </ol>
  );
}

function LegacyMiniTasksList({
  tasks,
  bodyClass,
}: {
  tasks: OperationalPlanPresentation["miniTasks"]["tasks"];
  bodyClass: string;
}) {
  return (
    <ol className="space-y-2">
      {tasks.map((t) => (
        <li key={t.id} className={bodyClass}>
          <span className="text-foreground/55">Mini-tarefa {t.order}</span>
          <span className="text-foreground/35"> — </span>
          {t.title}
        </li>
      ))}
    </ol>
  );
}

function DocList({
  items,
  muted = false,
}: {
  items: string[];
  muted?: boolean;
}) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li
          key={item}
          className={cn(
            "flex gap-2.5 text-[13px] leading-[1.6]",
            muted ? "text-foreground/70" : "text-foreground/85",
          )}
        >
          <span
            className="mt-[0.55rem] size-1 shrink-0 rounded-full bg-foreground/25"
            aria-hidden
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function DocOrderedList({ items }: { items: string[] }) {
  return (
    <ol className="space-y-1.5">
      {items.map((item, i) => (
        <li
          key={item}
          className="flex gap-2.5 text-[13px] leading-[1.6] text-foreground/85"
        >
          <span className="w-4 shrink-0 tabular-nums text-foreground/40">
            {i + 1}.
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function PlanSection({
  title,
  children,
  isFirst = false,
}: {
  title: string;
  children: ReactNode;
  isFirst?: boolean;
}) {
  return (
    <section
      className={cn(
        "border-t border-border/20 pt-6",
        isFirst && "border-t-0 pt-0",
      )}
    >
      <h3 className="mb-2.5 text-[13px] font-medium tracking-tight text-foreground/90">
        {title}
      </h3>
      {children}
    </section>
  );
}
