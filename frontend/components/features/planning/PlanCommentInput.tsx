"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PLACEHOLDER =
  "Peça um ajuste, tire uma dúvida ou adicione uma observação sobre este plano…";

const fieldShellClass = cn(
  "rounded-md shadow-none transition-[background-color] duration-200 ease-out",
  "bg-muted/15 hover:bg-muted/22",
  "focus-within:bg-muted/26 focus-within:shadow-none",
);

const textareaClass = cn(
  "max-h-[320px] min-h-[3.625rem] w-full resize-none border-0 bg-transparent px-2.5 py-2",
  "text-[13px] leading-relaxed text-foreground shadow-none [box-shadow:none]",
  "outline-none ring-0 ring-offset-0",
  "placeholder:text-muted-foreground/45",
  "focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
  "appearance-none",
);

export function PlanCommentInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 58), 320)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const canSubmit = value.trim().length > 0 && !disabled;

  return (
    <div
      className="plan-approval-comment-input space-y-2.5"
      data-plan-comment-input
    >
      <div className={fieldShellClass}>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={2}
          placeholder={PLACEHOLDER}
          className={cn(textareaClass, disabled && "opacity-50")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5 px-3 text-[12px] font-normal shadow-none"
          disabled={!canSubmit}
          onClick={onSubmit}
        >
          {disabled ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Enviar comentário
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-3 text-[12px] font-normal text-muted-foreground"
          disabled={disabled}
          onClick={onCancel}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}
