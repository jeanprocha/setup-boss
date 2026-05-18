"use client";

import type { PlanAdditionalQuestionDto } from "@/lib/runtime/operational/plan-comment-follow-up-types";
import { OperationalQuestionsForm } from "@/components/features/planning/OperationalQuestionsForm";

export function PlanAdditionalQuestionsForm({
  blockId,
  questions,
  disabled,
  submitting,
  onSubmit,
}: {
  blockId: string;
  questions: PlanAdditionalQuestionDto[];
  disabled?: boolean;
  submitting?: boolean;
  onSubmit: (
    answers: Array<{ questionId: string; question: string; answer: string }>,
  ) => void;
}) {
  return (
    <article
      id={`plan-timeline-block-${blockId}`}
      className="plan-approval-timeline-block"
      data-timeline-kind="additional_questions"
    >
      <OperationalQuestionsForm
        title="Perguntas adicionais"
        hint="Respostas curtas ajudam a atualizar o plano com precisão."
        questions={questions.map((q) => ({ id: q.id, prompt: q.text }))}
        disabled={disabled}
        submitting={submitting}
        onSubmit={onSubmit}
      />
    </article>
  );
}
