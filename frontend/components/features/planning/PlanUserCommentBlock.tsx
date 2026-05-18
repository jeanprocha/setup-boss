"use client";

export function PlanUserCommentBlock({
  text,
  blockId,
}: {
  text: string;
  blockId: string;
}) {
  return (
    <article
      id={`plan-timeline-block-${blockId}`}
      className="plan-approval-timeline-block plan-approval-timeline-block--comment"
      data-timeline-kind="user_comment"
    >
      <header className="plan-approval-timeline-block__header">
        <h4 className="plan-approval-timeline-block__title">Comentário</h4>
      </header>
      <blockquote className="plan-approval-timeline-block__quote">
        <p className="whitespace-pre-wrap">{text}</p>
      </blockquote>
    </article>
  );
}
