"use client";

import { AnswerInput } from "@/components/features/clarification/AnswerInput";
import type { ClarificationQuestionDto } from "@/lib/runtime/clarification/clarification-types";
import { cn } from "@/lib/utils";
import { CircleHelp } from "lucide-react";

export function ClarificationQuestionCard({
  question,
  draftValue,
  onDraftChange,
  readOnly,
  validationError,
  focusAnchor,
  appearance = "default",
}: {
  question: ClarificationQuestionDto;
  draftValue: string;
  onDraftChange: (v: string) => void;
  readOnly?: boolean;
  validationError?: string | null;
  focusAnchor?: boolean;
  appearance?: "default" | "minimal";
}) {
  const answered = question.status === "answered";
  const showInput = !readOnly && !answered;
  const minimal = appearance === "minimal";

  if (minimal) {
    return (
      <fieldset
        className={cn("border-0 p-0", answered && "opacity-90")}
        aria-label={question.prompt}
      >
        <div className="flex gap-2.5">
          <CircleHelp
            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/80"
            aria-hidden
          />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="block w-full text-[13px] font-normal leading-snug text-foreground">
              {question.prompt}
              {question.blocking && !answered ? (
                <span className="ml-1 text-[11px] text-muted-foreground/80">
                  (obrigatória)
                </span>
              ) : null}
            </p>

            {answered && question.answer ? (
              <p className="whitespace-pre-wrap rounded-lg bg-muted/30 px-3 py-2 text-[13px] leading-relaxed text-foreground/90">
                {question.answer}
              </p>
            ) : showInput ? (
              <AnswerInput
                question={question}
                value={draftValue}
                onChange={onDraftChange}
                validationError={validationError}
                focusAnchor={focusAnchor}
                appearance="minimal"
              />
            ) : null}
          </div>
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset
      className={cn(
        "space-y-2.5 border-0 p-0",
        answered && "opacity-90",
      )}
    >
      <legend className="block w-full text-[13px] font-semibold leading-snug tracking-tight text-foreground">
        {question.prompt}
        {question.blocking && !answered ? (
          <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
            (obrigatória)
          </span>
        ) : null}
      </legend>

      {answered && question.answer ? (
        <p className="whitespace-pre-wrap rounded-lg border border-border/30 bg-muted/20 px-3 py-2.5 text-[12px] leading-relaxed text-foreground/90 dark:bg-muted/15">
          {question.answer}
        </p>
      ) : showInput ? (
        <AnswerInput
          question={question}
          value={draftValue}
          onChange={onDraftChange}
          validationError={validationError}
          focusAnchor={focusAnchor}
        />
      ) : null}
    </fieldset>
  );
}
