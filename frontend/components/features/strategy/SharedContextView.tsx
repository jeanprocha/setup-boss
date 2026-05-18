"use client";

import type { SharedContextDto } from "@/lib/runtime/strategy/strategy-types";
import { Layers } from "lucide-react";

export function SharedContextView({ context }: { context: SharedContextDto }) {
  const hasContent =
    context.artifacts.length > 0 ||
    context.constraints.length > 0 ||
    context.rules.length > 0 ||
    context.crossSubtaskDeps.length > 0;

  if (!hasContent) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Sem contexto partilhado materializado.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Layers className="size-3.5" aria-hidden />
        Contexto partilhado
      </div>
      <TagList title="Artefactos" items={context.artifacts} mono />
      <TagList title="Constraints" items={context.constraints} />
      <TagList title="Regras" items={context.rules} />
      {context.crossSubtaskDeps.length > 0 ? (
        <CrossSubtaskDeps deps={context.crossSubtaskDeps} />
      ) : null}
    </div>
  );
}

function CrossSubtaskDeps({
  deps,
}: {
  deps: SharedContextDto["crossSubtaskDeps"];
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Cross-subtask
      </p>
      <ul className="space-y-1">
        {deps.map((row) => (
          <li
            key={row.subtaskId}
            className="rounded-sm border border-border/50 bg-background/20 px-2 py-1 font-mono text-[10px]"
          >
            <span className="text-foreground/90">{row.subtaskId}</span>
            <span className="text-muted-foreground">
              {" "}
              → {row.refs.join(", ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TagList({
  title,
  items,
  mono,
}: {
  title: string;
  items: string[];
  mono?: boolean;
}) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="mt-1 flex flex-wrap gap-1">
        {items.map((item) => (
          <li
            key={item}
            className={`rounded-sm border border-border/50 bg-muted/25 px-1.5 py-0.5 text-[10px] text-foreground/85 ${mono ? "font-mono" : ""}`}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
