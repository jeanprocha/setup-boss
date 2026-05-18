import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";
import type { RefinedPlanPresentation } from "../clarification/parse-refined-plan.ts";
import type { StrategyBundleDto } from "../strategy/strategy-types.ts";
import type {
  OperationalPlanExecutionStrategy,
  OperationalPlanMiniTasksSection,
  OperationalPlanUnderstanding,
} from "./operational-plan-types.ts";
import {
  sanitizeOperationalParagraph,
  sanitizeOperationalText,
  splitHumanListItems,
} from "./operational-plan-text-sanitize.ts";

const INTERNAL_LINE =
  /^(---|\{|```|"\w+":\s*|critério:\s*o ficheiro)/i;

const INTERNAL_INLINE =
  /\b(skip[-_\s]?llm|skip_llm|local_fallback|task-plan[-\w]*|plan-refine-meta|task-plan-initial-meta|clarification-session|approval-state\.json|run-context\.json|deterministic[-\s]?generation|blocking answers?|fallback local|read-model|runtime phase|phase2status|meta\.json|extracto determin[ií]stico|nuance sem[aâ]ntica|n[aã]o interpreta)\b/i;

const INTERNAL_ACCEPTANCE =
  /\b(ficheiro|file|artefacto|artifact).{0,48}(existe|exists|presente|gerado|dispon[ií]vel)|\.md\b|task-plan|skip[-_\s]?llm|valida[cç][aã]o interna|blocking|deterministic|fallback|pipeline|motor\b/i;

const INTERNAL_SUBTASK_TITLE =
  /^(deterministic[-\s]?review|validate[-\s]?|smoke[-\s]?|e2e[-\s]?test|artifact audit)/i;

const PLAN_V2_META_PHRASE =
  /plano\s+(v?\d+\s+)?atualizado\s+após\s+comentário|plano\s+v2\s+reflete|ajustar\s+interface\s+conforme\s+comentário|complexidade\s+recalculada\s+após|incorporar\s+pedido\s+do\s+comentário|executar\s+ajustes\s+do\s+plano\s+v?\d/i;

const MINI_TASK_DIVIDE_THRESHOLD = 2;

/** Texto orientado ao utilizador — exclui diagnóstico do motor/runtime. */
export function isInternalOperationalText(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 3) return true;
  if (INTERNAL_LINE.test(t)) return true;
  if (INTERNAL_INLINE.test(t)) return true;
  if (INTERNAL_ACCEPTANCE.test(t)) return true;
  if (PLAN_V2_META_PHRASE.test(t)) return true;
  return false;
}

export function filterHumanOperationalLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const sanitized = sanitizeOperationalText(line);
    if (!sanitized || isInternalOperationalText(sanitized)) continue;
    const key = sanitized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sanitized);
  }
  return out;
}

function sanitizeSlotAnswer(answer: string): string | null {
  const p = sanitizeOperationalParagraph(answer);
  if (!p || isInternalOperationalText(p)) return null;
  return p;
}

export function dedupeUnderstanding(
  understanding: OperationalPlanUnderstanding,
): OperationalPlanUnderstanding {
  let { summary, mainObjective } = understanding;

  if (summary) {
    summary = sanitizeOperationalParagraph(summary);
  }
  if (mainObjective) {
    mainObjective = sanitizeOperationalText(mainObjective);
  }

  if (summary && mainObjective) {
    const s = summary.toLowerCase();
    const o = mainObjective.toLowerCase();
    if (s === o || s.includes(o) || o.includes(s.slice(0, Math.min(s.length, 48)))) {
      mainObjective = null;
    } else if (mainObjective.length < 12 && s.includes(o)) {
      mainObjective = null;
    }
  }

  return { summary, mainObjective };
}

type ClarificationSlot =
  | "objective"
  | "firstPart"
  | "modules"
  | "outOfScope"
  | "success";

function classifyClarificationPrompt(prompt: string): ClarificationSlot | null {
  const p = prompt.toLowerCase();
  if (/objetivo\s+final/.test(p)) return "objective";
  if (/feita\s+primeiro|primeiro/.test(p)) return "firstPart";
  if (/arquivos|módulos|telas|envolvid/.test(p)) return "modules";
  if (/fora\s+do\s+escopo/.test(p)) return "outOfScope";
  if (/critério\s+mínimo|concluída\s+com\s+sucesso/.test(p)) return "success";
  return null;
}

function extractClarificationSlots(
  bundle: ClarificationBundleDto,
): Partial<Record<ClarificationSlot, string>> {
  const slots: Partial<Record<ClarificationSlot, string>> = {};
  for (const q of bundle.questions) {
    if (q.status !== "answered" || !(q.answer ?? "").trim()) continue;
    const slot = classifyClarificationPrompt(q.prompt);
    const answer = sanitizeSlotAnswer(q.answer ?? "");
    if (slot && answer) slots[slot] = answer;
  }
  return slots;
}

function uniqueOrdered(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Resumo natural a partir das respostas HITL quando o refinement é técnico. */
export function buildHumanSummaryFromClarification(
  bundle: ClarificationBundleDto,
): string | null {
  const slots = extractClarificationSlots(bundle);
  const objective = slots.objective;
  const modules = slots.modules;
  const outOfScope = slots.outOfScope;
  const success = slots.success;

  if (!objective && !modules && !success) return null;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildSummaryFromClarificationSlots } =
    require("../../../../core/normalize-operational-plan-language.js") as {
      buildSummaryFromClarificationSlots: (
        objective: string,
        modules?: string | null,
        outOfScope?: string | null,
        success?: string | null,
      ) => string | null;
    };

  const fromSlots = objective
    ? buildSummaryFromClarificationSlots(
        objective,
        modules ?? null,
        outOfScope ?? null,
        success ?? null,
      )
    : null;

  if (fromSlots) {
    return sanitizeOperationalParagraph(fromSlots);
  }

  if (modules && success) {
    const line = `Entrega focada na ${modules.replace(/^tela de\s+/i, "tela de ")}, com ${success.charAt(0).toLowerCase()}${success.slice(1)}.`;
    return sanitizeOperationalParagraph(line);
  }

  return null;
}

export function buildHumanMainObjective(
  refined: RefinedPlanPresentation,
  clarification: ClarificationBundleDto,
): string | null {
  const slots = extractClarificationSlots(clarification);
  if (slots.objective) {
    return sanitizeOperationalText(slots.objective);
  }

  const fromRefined = refined.objective
    ? sanitizeOperationalParagraph(refined.objective)
    : null;
  if (fromRefined && !isInternalOperationalText(fromRefined)) {
    return fromRefined;
  }

  return null;
}

export function buildHumanUnderstandingSummary(
  refined: RefinedPlanPresentation,
  clarification: ClarificationBundleDto,
): string | null {
  const fromAnswers = buildHumanSummaryFromClarification(clarification);
  if (fromAnswers) return fromAnswers;

  const objective = refined.objective
    ? sanitizeOperationalParagraph(refined.objective)
    : null;
  if (objective && !isInternalOperationalText(objective)) {
    return objective;
  }

  const scopeBits = filterHumanOperationalLines([
    ...refined.scopeIncluded,
    ...refined.scopeChanges,
  ]);
  if (scopeBits.length > 0) {
    return sanitizeOperationalParagraph(scopeBits.slice(0, 3).join(". "));
  }

  return null;
}

export function buildHumanScopeExcluded(
  refined: RefinedPlanPresentation,
  clarification: ClarificationBundleDto,
): string[] {
  const slots = extractClarificationSlots(clarification);
  const fromAnswers = slots.outOfScope ? splitHumanListItems(slots.outOfScope) : [];

  return filterHumanOperationalLines([
    ...refined.scopeExcluded.flatMap((line) => splitHumanListItems(line)),
    ...fromAnswers,
  ]);
}

export function buildHumanCompletionCriteria(
  refined: RefinedPlanPresentation,
  clarification: ClarificationBundleDto,
): string[] {
  const slots = extractClarificationSlots(clarification);
  const fromSuccess: string[] = [];
  if (slots.success) {
    const p = sanitizeOperationalParagraph(slots.success);
    if (p) fromSuccess.push(p);
  }

  return filterHumanOperationalLines([
    ...fromSuccess,
    ...refined.acceptanceCriteria,
  ]);
}

function splitChangeCandidates(raw: string): string[] {
  return splitHumanListItems(raw);
}

export function buildHumanWhatWillChange(
  refined: RefinedPlanPresentation,
  clarification: ClarificationBundleDto,
): string[] {
  const slots = extractClarificationSlots(clarification);
  const candidates = filterHumanOperationalLines([
    ...(slots.modules ? splitChangeCandidates(slots.modules) : []),
    ...refined.scopeIncluded,
    ...refined.scopeChanges.filter((line) =>
      /tela|componente|módulo|modulo|integra|layout|api|fluxo|arquivo|ficheiro/i.test(
        line,
      ),
    ),
  ]);

  return uniqueOrdered(candidates);
}

export function buildHumanWhatWillBeDone(
  refined: RefinedPlanPresentation,
  strategy: StrategyBundleDto | null | undefined,
  clarification: ClarificationBundleDto,
): string[] {
  const steps = buildHumanExecutionSteps(refined, strategy);
  if (steps.length > 0) return steps.slice(0, 10);

  const slots = extractClarificationSlots(clarification);
  const inferred: string[] = [];

  if (slots.objective) {
    inferred.push(`Implementar ${slots.objective}`);
  }
  if (slots.firstPart) {
    inferred.push(`Entregar primeiro: ${slots.firstPart}`);
  }
  if (slots.modules) {
    inferred.push(`Integrar em ${slots.modules}`);
  }

  return filterHumanOperationalLines(inferred);
}

export function buildHumanExecutionSteps(
  refined: RefinedPlanPresentation,
  strategy: StrategyBundleDto | null | undefined,
): string[] {
  const fromRefined = filterHumanOperationalLines(refined.executionOrder);

  const fromOrdering =
    strategy?.ordering.sequence
      .map((s) => s.title.trim())
      .filter(
        (t) =>
          t && !INTERNAL_SUBTASK_TITLE.test(t) && !isInternalOperationalText(t),
      ) ?? [];

  const fromSubtasks =
    strategy?.subtasks
      .sort((a, b) => a.order - b.order)
      .map((s) => s.title.trim())
      .filter(
        (t) =>
          t && !INTERNAL_SUBTASK_TITLE.test(t) && !isInternalOperationalText(t),
      ) ?? [];

  const fromScope = filterHumanOperationalLines(refined.scopeChanges).map(
    (line) => {
      if (/^implementar|^criar|^adicionar|^integrar|^ajustar/i.test(line)) {
        return line.charAt(0).toUpperCase() + line.slice(1);
      }
      return line;
    },
  );

  return uniqueOrdered([
    ...fromRefined,
    ...fromOrdering,
    ...fromSubtasks,
    ...fromScope,
  ]).slice(0, 12);
}

export function buildHumanExecutionStrategy(
  refined: RefinedPlanPresentation,
  strategy: StrategyBundleDto | null | undefined,
): OperationalPlanExecutionStrategy {
  const oes = strategy?.executableStrategy;
  if (oes?.available && oes.miniTasks.length > 0) {
    const byId = new Map(oes.miniTasks.map((m) => [m.id, m]));
    const macroOrder = oes.macroOrder
      .map((id) => byId.get(id)?.title?.trim())
      .filter((t): t is string => Boolean(t && !isInternalOperationalText(t)));
    const dependencies = oes.dependencies
      .map((d) => d.label?.trim())
      .filter((l): l is string => Boolean(l && !isInternalOperationalText(l)));
    let approach: string | null = null;
    if (oes.executionPattern) {
      const patternLabels: Record<string, string> = {
        single_pass: "Execução consolidada num único passo.",
        sequential_by_step: "Execução sequencial por etapas do plano.",
        by_component: "Execução isolada por componente ou domínio.",
        refactor_then_feature: "Preparação estrutural antes da funcionalidade.",
        incremental_validate: "Validação incremental após cada bloco.",
      };
      approach =
        patternLabels[oes.executionPattern] ??
        sanitizeOperationalParagraph(oes.executionPattern);
    }
    if (!approach && oes.validationApproach) {
      approach = `Validação: ${oes.validationApproach.replace(/_/g, " ")}.`;
    }
    return {
      macroOrder: macroOrder.length
        ? macroOrder
        : filterHumanOperationalLines(refined.executionOrder),
      approach,
      dependencies: dependencies.slice(0, 8),
    };
  }

  const macroOrder = filterHumanOperationalLines(refined.executionOrder);

  const fromOrdering =
    strategy?.ordering.sequence
      .map((s) => s.title.trim())
      .filter(
        (t) =>
          t && !INTERNAL_SUBTASK_TITLE.test(t) && !isInternalOperationalText(t),
      ) ?? [];

  const order =
    macroOrder.length > 0
      ? macroOrder
      : uniqueOrdered(fromOrdering).slice(0, 8);

  let approach: string | null = null;
  if (strategy?.recommendation.executionApproach?.trim()) {
    const a = sanitizeOperationalParagraph(
      strategy.recommendation.executionApproach,
    );
    if (a && !isInternalOperationalText(a)) approach = a;
  }
  if (!approach && strategy?.decompositionSummary?.trim()) {
    const d = sanitizeOperationalParagraph(strategy.decompositionSummary);
    if (d && !isInternalOperationalText(d)) approach = d;
  }

  const dependencies: string[] = [];
  for (const dep of strategy?.ordering.blockingDependencies ?? []) {
    const label = dep.label?.trim();
    if (label && !isInternalOperationalText(label)) {
      dependencies.push(label);
    }
  }
  for (const c of strategy?.sharedContext.constraints ?? []) {
    const t = c.trim();
    if (t && !isInternalOperationalText(t) && !/^sem alterar api$/i.test(t)) {
      dependencies.push(t);
    }
  }

  return {
    macroOrder: order,
    approach,
    dependencies: filterHumanOperationalLines(dependencies).slice(0, 5),
  };
}

export function buildHumanRisks(
  refined: RefinedPlanPresentation,
  strategy: StrategyBundleDto | null | undefined,
): string[] {
  const fromRefined = filterHumanOperationalLines(refined.risks);
  const fromStrategy =
    strategy?.risks
      .map((r) => r.label.trim())
      .filter((l) => l && !isInternalOperationalText(l)) ?? [];

  return uniqueOrdered([...fromRefined, ...fromStrategy]).slice(0, 8);
}

export function filterHumanMiniTaskTitle(title: string): boolean {
  const t = title.trim();
  if (!t || isInternalOperationalText(t)) return false;
  if (INTERNAL_SUBTASK_TITLE.test(t)) return false;
  return true;
}

export function buildHumanMiniTasksSection(
  strategy: StrategyBundleDto | null | undefined,
): OperationalPlanMiniTasksSection {
  const oes = strategy?.executableStrategy;
  if (oes?.available && oes.miniTasks.length > 0) {
    const tasks = oes.miniTasks
      .filter((m) => filterHumanMiniTaskTitle(m.title))
      .sort((a, b) => a.order - b.order)
      .map((m) => {
        const title = sanitizeOperationalText(m.title) ?? m.title.trim();
        return { id: m.id, title, order: m.order };
      })
      .filter((t) => t.title.length >= 3);

    if (tasks.length >= MINI_TASK_DIVIDE_THRESHOLD) {
      return {
        mode: "divided",
        directLabelPt: "Será executada diretamente, sem divisão em mini-tarefas.",
        tasks,
      };
    }
  }

  const tasks =
    strategy?.subtasks
      .filter((s) => filterHumanMiniTaskTitle(s.title))
      .sort((a, b) => a.order - b.order)
      .map((s, i) => {
        const title = sanitizeOperationalText(s.title) ?? s.title.trim();
        return { id: s.miniTaskId ?? s.id, title, order: i + 1 };
      })
      .filter((t) => t.title.length >= 3) ?? [];

  if (tasks.length >= MINI_TASK_DIVIDE_THRESHOLD) {
    return {
      mode: "divided",
      directLabelPt: "Será executada diretamente, sem divisão em mini-tarefas.",
      tasks,
    };
  }

  return {
    mode: "direct",
    directLabelPt: "Será executada diretamente, sem divisão em mini-tarefas.",
    tasks: [],
  };
}
