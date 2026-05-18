"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ClarificationQuestionCard } from "@/components/features/clarification/ClarificationQuestionCard";
import { OperationalStepOneSectionHeading } from "@/components/features/operational/OperationalStepOneSectionHeading";
import { Button } from "@/components/ui/button";
import { toClarificationFreeTextQuestion } from "@/lib/runtime/clarification/free-text-question-adapter";
import { cn } from "@/lib/utils";

export type OperationalQuestionItem = {
  id: string;
  prompt: string;
};

export function OperationalQuestionDivider({ compact }: { compact?: boolean }) {
  return (
    <div
      className={cn("h-px bg-border/35", compact ? "my-2" : "my-3")}
      role="separator"
    />
  );
}

export function OperationalQuestionsForm({
  title,
  hint,
  questions,
  submitLabel = "Enviar respostas",
  disabled,
  submitting,
  onSubmit,
  className,
  allRequired = true,
  focusFirstQuestion = true,
}: {
  title: string;
  hint?: string;
  questions: OperationalQuestionItem[];
  submitLabel?: string;
  disabled?: boolean;
  submitting?: boolean;
  onSubmit: (
    answers: Array<{ questionId: string; question: string; answer: string }>,
  ) => void;
  className?: string;
  allRequired?: boolean;
  focusFirstQuestion?: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const canSubmit =
    questions.length > 0 &&
    questions.every(
      (q) => !allRequired || (drafts[q.id] ?? "").trim().length > 0,
    );

  return (
    <div className={cn("space-y-3", className)}>
      <div className="space-y-1">
        <OperationalStepOneSectionHeading>{title}</OperationalStepOneSectionHeading>
        {hint ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit || disabled || submitting) return;
          onSubmit(
            questions.map((q) => ({
              questionId: q.id,
              question: q.prompt,
              answer: (drafts[q.id] ?? "").trim(),
            })),
          );
        }}
      >
        <div>
          {questions.map((q, idx) => (
            <div key={q.id}>
              {idx > 0 ? <OperationalQuestionDivider /> : null}
              <ClarificationQuestionCard
                appearance="minimal"
                question={toClarificationFreeTextQuestion(q)}
                draftValue={drafts[q.id] ?? ""}
                onDraftChange={(v) =>
                  setDrafts((prev) => ({ ...prev, [q.id]: v }))
                }
                readOnly={disabled || submitting}
                focusAnchor={focusFirstQuestion && idx === 0}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            className="h-9 text-[12px] font-medium"
            disabled={!canSubmit || disabled || submitting}
          >
            {submitting ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : null}
            {submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
