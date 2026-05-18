"use client";

import type { PlanAdditionalAnswerRowDto } from "@/lib/runtime/operational/plan-comment-follow-up-types";

export function PlanAdditionalAnswersBlock({
  blockId,
  answers,
}: {
  blockId: string;
  answers: PlanAdditionalAnswerRowDto[];
}) {
  return (
    <article
      id={`plan-timeline-block-${blockId}`}
      className="plan-approval-timeline-block plan-approval-timeline-block--answers"
      data-timeline-kind="additional_answers"
    >
      <header className="plan-approval-timeline-block__header">
        <h4 className="plan-approval-timeline-block__title">
          Respostas adicionais
        </h4>
      </header>
      <ul className="plan-approval-timeline-block__answers-list">
        {answers.map((row) => (
          <li key={row.questionId}>
            <span className="plan-approval-timeline-block__answers-label">
              {shortAnswerLabel(row.question)}
            </span>
            <span className="plan-approval-timeline-block__answers-value">
              {row.answer}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function shortAnswerLabel(question: string): string {
  const q = question.trim();
  if (!q) return "Resposta";
  if (q.length <= 48) return q;
  return `${q.slice(0, 45).trim()}…`;
}
