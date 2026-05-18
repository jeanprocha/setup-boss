"use client";

import { Button } from "@/components/ui/button";
import type { ClarificationQuestionDto } from "@/lib/runtime/clarification/clarification-types";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

/** Altura mínima ≈ 2 linhas (13px × 1.625 × 2 + padding vertical). */
const MINIMAL_TEXTAREA_MIN_HEIGHT_PX = 58;

const minimalFieldShellClass = cn(
  "rounded-md shadow-none transition-[background-color] duration-200 ease-out",
  "bg-muted/15 hover:bg-muted/22",
  "focus-within:bg-muted/26 focus-within:shadow-none",
);

const minimalTextareaClass = cn(
  "max-h-[320px] min-h-[3.625rem] w-full resize-none border-0 bg-transparent px-2.5 py-2",
  "text-[13px] leading-relaxed text-foreground shadow-none [box-shadow:none]",
  "outline-none ring-0 ring-offset-0",
  "placeholder:text-muted-foreground/45",
  "focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
  "appearance-none",
);

const defaultTextareaClass = cn(
  "max-h-[320px] min-h-[3.25rem] w-full resize-none rounded-lg border border-border/40 bg-input/80 px-3 py-2.5 text-[12px] leading-relaxed text-foreground shadow-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/55",
  "hover:border-border/55",
  "focus-visible:border-sidebar-primary/45 focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary/20",
);

function AutoTextArea({
  value,
  onChange,
  disabled,
  validationError,
  focusAnchor,
  appearance = "default",
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  validationError?: string | null;
  focusAnchor?: boolean;
  appearance?: "default" | "minimal";
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const minimal = appearance === "minimal";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(
      Math.max(el.scrollHeight, minimal ? MINIMAL_TEXTAREA_MIN_HEIGHT_PX : 56),
      320,
    );
    el.style.height = `${next}px`;
  }, [value, minimal]);

  if (minimal) {
    return (
      <div className="space-y-1">
        <div className={minimalFieldShellClass} style={{ boxShadow: "none" }}>
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            rows={2}
            data-runtime-focus={focusAnchor ? "clarification-answer" : undefined}
            className={cn(minimalTextareaClass, disabled && "opacity-50")}
            style={{ boxShadow: "none" }}
            placeholder="Escreva a sua resposta…"
          />
        </div>
        {validationError ? (
          <p className="text-[10px] text-sb-failed">{validationError}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={1}
        data-runtime-focus={focusAnchor ? "clarification-answer" : undefined}
        className={cn(defaultTextareaClass, disabled && "opacity-50")}
        placeholder="Escreva a sua resposta…"
      />
      {validationError ? (
        <p className="text-[10px] text-sb-failed">{validationError}</p>
      ) : null}
    </div>
  );
}

export function AnswerInput({
  question,
  value,
  onChange,
  disabled,
  validationError,
  focusAnchor,
  appearance = "default",
}: {
  question: ClarificationQuestionDto;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  validationError?: string | null;
  focusAnchor?: boolean;
  appearance?: "default" | "minimal";
}) {
  const minimal = appearance === "minimal";

  if (question.kind === "confirm") {
    const yes = value === "true";
    const no = value === "false";
    return (
      <div className="space-y-1">
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={yes ? "secondary" : "outline"}
            className={cn(
              "h-8 text-xs",
              minimal && "border-transparent bg-muted/35 shadow-none",
            )}
            disabled={disabled}
            onClick={() => onChange("true")}
          >
            Sim
          </Button>
          <Button
            type="button"
            size="sm"
            variant={no ? "secondary" : "outline"}
            className={cn(
              "h-8 text-xs",
              minimal && "border-transparent bg-muted/35 shadow-none",
            )}
            disabled={disabled}
            onClick={() => onChange("false")}
          >
            Não
          </Button>
        </div>
        {validationError ? (
          <p className="text-[10px] text-sb-failed">{validationError}</p>
        ) : null}
      </div>
    );
  }

  if (question.kind === "single_choice") {
    return (
      <div className="space-y-1">
        <div className="flex flex-col gap-0.5">
          {question.options.map((opt) => (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt)}
              className={cn(
                "rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors",
                minimal
                  ? value === opt
                    ? "bg-muted/55 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/35 hover:text-foreground"
                  : value === opt
                    ? "border-sidebar-primary/40 bg-sidebar-accent/50 text-foreground shadow-[inset_3px_0_0_0_color-mix(in_oklch,var(--sidebar-primary)_72%,transparent)] dark:bg-sidebar-accent/35 border"
                    : "border border-border/35 bg-card/50 text-muted-foreground hover:bg-muted/35 hover:text-foreground",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              {opt}
            </button>
          ))}
        </div>
        {validationError ? (
          <p className="text-[10px] text-sb-failed">{validationError}</p>
        ) : null}
      </div>
    );
  }

  return (
    <AutoTextArea
      value={value}
      onChange={onChange}
      disabled={disabled}
      validationError={validationError}
      focusAnchor={focusAnchor}
      appearance={appearance}
    />
  );
}
