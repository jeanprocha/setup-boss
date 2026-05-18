"use client";

export function PlanAssistantResponseBlock({
  text,
  blockId,
}: {
  text: string;
  blockId: string;
}) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  return (
    <article
      id={`plan-timeline-block-${blockId}`}
      className="plan-approval-timeline-block plan-approval-timeline-block--assistant"
      data-timeline-kind="assistant_response"
    >
      <header className="plan-approval-timeline-block__header">
        <h4 className="plan-approval-timeline-block__title">Setup Boss</h4>
      </header>
      <p className="plan-approval-timeline-block__assistant-text whitespace-pre-wrap">
        {trimmed}
      </p>
    </article>
  );
}
