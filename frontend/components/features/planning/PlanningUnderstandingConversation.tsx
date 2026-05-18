"use client";

import type { ClarificationBundleDto } from "@/lib/runtime/clarification/clarification-types";
import { ClarificationQuestionCard } from "@/components/features/clarification/ClarificationQuestionCard";
import { OperationalQuestionDivider } from "@/components/features/planning/OperationalQuestionsForm";
import { cn } from "@/lib/utils";

/** Rótulo curto para leitura rápida no resumo (apenas apresentação). */
function compactQuestionLabel(prompt: string): string {
  const p = prompt.trim().replace(/\?+$/, "");
  const rules: [RegExp, string][] = [
    [/objetivo\s+final/i, "Objetivo final"],
    [/feita\s+primeiro|primeiro/i, "Primeira parte"],
    [/arquivos|módulos|telas/i, "Arquivos/módulos envolvidos"],
    [/fora\s+do\s+escopo/i, "Fora do escopo"],
    [/critério\s+mínimo|concluída\s+com\s+sucesso/i, "Critério mínimo"],
  ];
  for (const [pattern, label] of rules) {
    if (pattern.test(p)) return label;
  }
  const stripped = p
    .replace(/^qual\s+(é|são)\s+(o|a|os|as)\s+/i, "")
    .replace(/^quais\s+/i, "")
    .replace(/^o\s+que\s+/i, "");
  const text = stripped.length > 0 ? stripped : p;
  if (text.length <= 42) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  return `${text.slice(0, 40).trim()}…`;
}

function CompactAnsweredSummary({
  items,
}: {
  items: { id: string; prompt: string; answer: string }[];
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/90">
        Perguntas respondidas
      </p>
      <ul className="space-y-0.5 border-l border-border/40 pl-2.5">
        {items.map((item) => (
          <li key={item.id} className="text-[11px] leading-snug">
            <span className="text-muted-foreground">
              {compactQuestionLabel(item.prompt)}:{" "}
            </span>
            <span className="font-medium text-foreground/90">{item.answer}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PlanningUnderstandingConversation({
  bundle,
  drafts,
  onDraftChange,
  readOnlyInputs,
  validation,
  focusFirstPending,
}: {
  bundle: ClarificationBundleDto;
  drafts: Record<string, string>;
  onDraftChange: (questionId: string, value: string) => void;
  readOnlyInputs: boolean;
  validation: string | null;
  focusFirstPending: boolean;
}) {
  const pending = bundle.questions.filter((q) => q.status === "pending");
  const answered = bundle.questions.filter((q) => q.status === "answered");
  const firstPendingId = pending[0]?.id;
  const showDividerBefore = answered.length > 0;

  const answeredForSummary = answered
    .filter((q) => (q.answer ?? "").trim())
    .map((q) => ({
      id: q.id,
      prompt: q.prompt,
      answer: (q.answer ?? "").trim(),
    }));

  return (
    <div className={cn(answeredForSummary.length > 0 && pending.length === 0 && "py-0")}>
      {answeredForSummary.length > 0 ? (
        <CompactAnsweredSummary items={answeredForSummary} />
      ) : null}

      {pending.map((q, idx) => (
        <div key={q.id}>
          {(showDividerBefore || idx > 0) ? (
            <OperationalQuestionDivider compact={answeredForSummary.length > 0} />
          ) : null}
          <ClarificationQuestionCard
            appearance="minimal"
            question={q}
            draftValue={drafts[q.id] ?? ""}
            onDraftChange={(v) => onDraftChange(q.id, v)}
            readOnly={readOnlyInputs}
            focusAnchor={focusFirstPending && idx === 0 && q.id === firstPendingId}
            validationError={
              validation && q.blocking && !(drafts[q.id] ?? "").trim()
                ? "Obrigatória"
                : null
            }
          />
        </div>
      ))}
    </div>
  );
}
