"use client";

import { cn } from "@/lib/utils";
import type { ExecutionTimelineCardSection } from "@/lib/runtime/execution/execution-timeline-card-types";
import {
  ExpandableBlock,
  MarkdownRenderer,
  RuntimeCodeBlock,
} from "@/components/features/conversation-stream";

function SectionBody({ section }: { section: ExecutionTimelineCardSection }) {
  switch (section.kind) {
    case "text":
      return section.body ? (
        <p className="cs-text-body whitespace-pre-wrap leading-relaxed">
          {section.body}
        </p>
      ) : null;
    case "markdown":
      return section.body ? (
        <ExpandableBlock contentText={section.body}>
          <MarkdownRenderer content={section.body} />
        </ExpandableBlock>
      ) : null;
    case "keyValue":
      return section.items?.length ? (
        <dl className="cs-text-body grid gap-0">
          {section.items.map((it) => (
            <div
              key={it.key}
              className="grid grid-cols-[minmax(0,34%)_1fr] gap-x-2 py-1"
            >
              <dt className="cs-text-subtitle normal-case">{it.key}</dt>
              <dd className="min-w-0 break-words font-normal">
                {it.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null;
    case "list":
    case "fileList":
      return section.lines?.length ? (
        <ul className="cs-text-body list-inside list-disc space-y-0.5">
          {section.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : null;
    case "checklist":
      return section.checklist?.length ? (
        <ul className="cs-text-body space-y-1">
          {section.checklist.map((c, i) => (
            <li key={i} className="flex gap-2">
              <span>{c.done ? "☑" : "☐"}</span>
              <span className={c.done ? "line-through opacity-70" : ""}>
                {c.label}
              </span>
            </li>
          ))}
        </ul>
      ) : null;
    case "logPreview":
      return section.body ? (
        <ExpandableBlock contentText={section.body} defaultCollapsed>
          <RuntimeCodeBlock>{section.body}</RuntimeCodeBlock>
        </ExpandableBlock>
      ) : null;
    case "warning":
      return section.body ? (
        <p
          className={cn(
            "cs-text-body py-1 leading-snug",
          )}
        >
          {section.body}
        </p>
      ) : null;
    case "error":
      return section.body ? (
        <p className="cs-text-body py-1 leading-snug">
          {section.body}
        </p>
      ) : null;
    case "actionRequired":
      return section.body ? (
        <p className="cs-text-body py-1 leading-snug">
          {section.body}
        </p>
      ) : null;
    case "metrics":
      return section.body ? (
        <p className="cs-text-caption cs-text-comment">{section.body}</p>
      ) : null;
    case "clarificationQa":
      return section.qaPairs?.length ? (
        <div className="cs-entry-nested-deep space-y-1.5">
          {section.qaPairs.map((pair, i) => (
            <details key={i} className="group py-1" open={i < 2}>
              <summary className="cs-interactive cursor-pointer list-none rounded px-0 py-1.5 [&::-webkit-details-marker]:hidden">
                <span className="cs-text-subtitle normal-case">
                  Pergunta {i + 1}
                  {pair.status ? (
                    <span className="cs-text-caption cs-text-comment ml-1.5 font-normal normal-case">
                      · {pair.status}
                    </span>
                  ) : null}
                </span>
                <p className="cs-text-body mt-0.5 leading-snug">
                  {pair.question}
                </p>
              </summary>
              <div className="cs-entry-nested-body px-0 pb-1 pt-1">
                <p className="cs-text-caption cs-text-comment font-medium uppercase tracking-wide">
                  Resposta
                </p>
                <p className="cs-text-body mt-0.5 whitespace-pre-wrap leading-relaxed">
                  {pair.answer}
                </p>
              </div>
            </details>
          ))}
        </div>
      ) : null;
    case "semanticSubsteps":
      return section.substeps?.length ? (
        <ul className="cs-entry-nested-deep space-y-1">
          {section.substeps.map((st, i) => (
            <li key={`${st.label}-${i}`} className="py-2">
              <p className="cs-text-subtitle normal-case">{st.label}</p>
              <p className="cs-text-caption cs-text-comment mt-0.5 leading-snug">
                {st.detail}
              </p>
            </li>
          ))}
        </ul>
      ) : null;
    default:
      return null;
  }
}

export function ExecutionTimelineSectionView({
  sections,
}: {
  sections: readonly ExecutionTimelineCardSection[];
}) {
  if (!sections.length) return null;
  return (
    <div className="space-y-4">
      {sections.map((s, i) => (
        <section key={`${s.title}-${i}`} className="space-y-1.5">
          <h3 className="cs-text-subtitle">{s.title}</h3>
          <div className="cs-entry-nested-body">
            <SectionBody section={s} />
          </div>
        </section>
      ))}
    </div>
  );
}
