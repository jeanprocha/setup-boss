"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type {
  OperationalPlanComplexity,
  OperationalPlanExecutionRecommendation,
} from "@/lib/runtime/operational/operational-plan-types";
import {
  EXECUTION_LEVELS,
  EXECUTION_LEVELS_HELP_INTRO_PT,
  type ExecutionLevelId,
} from "@/lib/runtime/operational/operational-plan-execution-level";
import { formatOperationalPlanComplexitySentence } from "@/lib/runtime/operational/operational-plan-complexity";
import { MenuClickAwayOverlay } from "@/components/primitives/MenuClickAwayOverlay";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";

const BODY = "text-[13px] leading-[1.65] text-foreground/85";

const EXECUTION_LEVELS_HELP = EXECUTION_LEVELS.map((level) => ({
  label: level.labelPt,
  hint: level.descriptionPt,
}));

const EXECUTION_SELECT_OPTIONS = EXECUTION_LEVELS.map((level) => ({
  id: level.id,
  label: level.labelPt,
}));

const SELECT_TRIGGER =
  "inline-flex h-7 min-w-[5.75rem] cursor-pointer items-center justify-between gap-2 rounded-md border border-border/25 bg-muted/30 px-2.5 text-[12px] font-medium text-foreground/90 shadow-none transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50";

type SelectOption = {
  id: string;
  label: string;
};

function DocumentHelpTooltip({
  title,
  intro,
  levels,
}: {
  title: string;
  intro?: string;
  levels: readonly { label: string; hint: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLButtonElement>(null);

  const updatePos = useCallback(() => {
    const el = anchorRef.current;
    if (!el || typeof window === "undefined") return;
    const r = el.getBoundingClientRect();
    const maxW = Math.min(280, window.innerWidth - 20);
    const gap = 6;

    // Acima do (?), canto direito alinhado ao botão — evita sobrepor o dropdown do select
    let left = r.right;
    let top = r.top - gap;

    if (left - maxW < 10) {
      left = Math.min(r.left + r.width / 2 + maxW / 2, window.innerWidth - 10);
    }
    if (left > window.innerWidth - 10) {
      left = window.innerWidth - 10;
    }

    setPos({ top, left });
  }, []);

  const show = () => {
    updatePos();
    setOpen(true);
  };
  const hide = () => setOpen(false);

  const tooltip =
    open && typeof document !== "undefined" ? (
      <div
        role="tooltip"
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          maxWidth: Math.min(280, window.innerWidth - 20),
          zIndex: 90,
          transform: "translate(-100%, -100%)",
        }}
        className="pointer-events-none rounded-md border border-border/50 bg-popover px-2.5 py-2 shadow-[0_6px_24px_-10px_rgba(0,0,0,0.28)] dark:shadow-[0_8px_28px_-12px_rgba(0,0,0,0.55)]"
      >
        <p className="mb-1.5 text-[10px] font-medium tracking-wide text-foreground/70">
          {title}
        </p>
        {intro ? (
          <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
            {intro}
          </p>
        ) : null}
        <ul className="space-y-1 text-[11px] leading-snug text-muted-foreground">
          {levels.map((row) => (
            <li key={row.label}>
              <span className="font-medium text-foreground/85">{row.label}</span>
              <span className="text-foreground/40"> — </span>
              {row.hint}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="cursor-help rounded-sm px-1 py-0.5 text-[11px] font-normal leading-none text-amber-800 outline-none transition-colors hover:text-amber-900 focus-visible:text-amber-900 focus-visible:ring-1 focus-visible:ring-amber-500/35 dark:text-amber-200 dark:hover:text-amber-100 dark:focus-visible:text-amber-100"
        aria-label={`Ajuda: ${title}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        (?)
      </button>
      {tooltip ? createPortal(tooltip, document.body) : null}
    </>
  );
}

function PlanDocRow({
  text,
  control,
}: {
  text: ReactNode;
  control: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <p className={cn(BODY, "min-w-0 flex-1")}>{text}</p>
      <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
        {control}
      </div>
    </div>
  );
}

function DiscreteSelect({
  value,
  options,
  listLabel,
  disabled,
  readOnly,
  recommendedId,
  onChange,
}: {
  value: string;
  options: readonly SelectOption[];
  listLabel: string;
  disabled?: boolean;
  readOnly?: boolean;
  recommendedId?: string;
  onChange?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = options.find((o) => o.id === value) ?? options[0]!;

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={SELECT_TRIGGER}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="truncate">{active.label}</span>
        <ChevronDown
          className={cn("size-3 shrink-0 opacity-50", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <>
          <MenuClickAwayOverlay onDismiss={() => setOpen(false)} />
          <ul
            role="listbox"
            aria-label={listLabel}
            className="absolute right-0 top-full z-40 mt-1 min-w-[9.5rem] rounded-md border border-border/50 bg-popover py-0.5 shadow-md"
            onClick={(e) => e.stopPropagation()}
          >
            {options.map((opt) => {
              const selected = opt.id === value;
              const isRecommended = recommendedId === opt.id;
              return (
                <li key={opt.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={readOnly && !selected}
                    className={cn(
                      "flex w-full px-2.5 py-1.5 text-left",
                      !readOnly && "hover:bg-accent/70",
                      selected && "bg-accent/40",
                      readOnly && !selected && "cursor-default opacity-45",
                    )}
                    onClick={() => {
                      if (readOnly || !onChange) return;
                      onChange(opt.id);
                      setOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2 text-[12px] text-foreground/90">
                      <span className="font-medium">{opt.label}</span>
                      {isRecommended ? (
                        <span className="text-[10px] text-foreground/40">
                          recomendado
                        </span>
                      ) : null}
                      {selected ? (
                        <Check className="ml-auto size-3 text-foreground/45" />
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export function PlanComplexitySentence({
  complexity,
  recommendation,
  selectedLevel,
  onLevelChange,
  selectDisabled,
}: {
  complexity: OperationalPlanComplexity;
  recommendation: OperationalPlanExecutionRecommendation;
  selectedLevel?: ExecutionLevelId;
  onLevelChange?: (level: ExecutionLevelId) => void;
  selectDisabled?: boolean;
}) {
  const sentence = formatOperationalPlanComplexitySentence(complexity);
  const activeLevel = selectedLevel ?? recommendation.recommendedLevel;
  const editable = Boolean(onLevelChange);
  return (
    <PlanDocRow
      text={<>{sentence}</>}
      control={
        <>
          <DiscreteSelect
            value={activeLevel}
            options={EXECUTION_SELECT_OPTIONS}
            listLabel="Nível de execução"
            disabled={selectDisabled}
            readOnly={!editable}
            recommendedId={recommendation.recommendedLevel}
            onChange={
              editable && onLevelChange
                ? (id) => onLevelChange(id as ExecutionLevelId)
                : undefined
            }
          />
          <DocumentHelpTooltip
            title="Nível de execução"
            intro={EXECUTION_LEVELS_HELP_INTRO_PT}
            levels={EXECUTION_LEVELS_HELP}
          />
        </>
      }
    />
  );
}
