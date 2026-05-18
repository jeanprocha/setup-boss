"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Clipboard, Filter, Trash2 } from "lucide-react";
import {
  RUNTIME_LOG_CATEGORY_OPTS,
  isAllRuntimeLogCategoriesSelected,
} from "@/lib/runtime/observability/runtime-logs-category-filter-storage";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";

export type RuntimeLogsToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  categories: Set<string>;
  onCategoriesChange: (categories: Set<string>) => void;
  onCopy: () => void;
  onClear: () => void;
};

export function RuntimeLogsToolbar({
  search,
  onSearchChange,
  categories,
  onCategoriesChange,
  onCopy,
  onClear,
}: RuntimeLogsToolbarProps) {
  const { t } = useI18n();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const allSelected = isAllRuntimeLogCategoriesSelected(categories);
  const activeFilterCount = allSelected
    ? 0
    : RUNTIME_LOG_CATEGORY_OPTS.length - categories.size;

  const toggleCategory = useCallback(
    (cat: string) => {
      onCategoriesChange(
        (() => {
          const next = new Set(categories);
          if (next.has(cat)) next.delete(cat);
          else next.add(cat);
          return next;
        })(),
      );
    },
    [categories, onCategoriesChange],
  );

  useEffect(() => {
    if (!filtersOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setFiltersOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filtersOpen]);

  const actionBtnClass =
    "h-7 shrink-0 gap-1 px-2 text-[8px] leading-none [&_svg]:size-3";

  return (
    <div
      className="my-1 flex h-8 shrink-0 items-center gap-1 border-none"
      role="toolbar"
      aria-label={t("observability.logsToolbarLabel")}
    >
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={actionBtnClass}
        onClick={onCopy}
      >
        <Clipboard className="size-3 shrink-0" />
        <span className="leading-none">{t("observability.logsCopy")}</span>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={actionBtnClass}
        onClick={onClear}
      >
        <Trash2 className="size-3 shrink-0" />
        <span className="leading-none">{t("observability.logsClearView")}</span>
      </Button>
      <input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={t("observability.logsSearchPlaceholder")}
        className="h-7 min-w-0 flex-1 self-center rounded border border-sidebar-border/50 bg-sidebar-accent/10 px-2 font-mono text-[8px] leading-normal text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-sidebar-primary/50"
      />
      <div className="relative flex shrink-0 items-center self-center">
        <Button
          ref={triggerRef}
          type="button"
          size="sm"
          variant={filtersOpen || activeFilterCount > 0 ? "secondary" : "ghost"}
          className={cn(actionBtnClass, "items-center")}
          aria-expanded={filtersOpen}
          aria-haspopup="dialog"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <Filter className="size-3 shrink-0" />
          <span className="leading-none">{t("observability.logsFilters")}</span>
          {activeFilterCount > 0 ? (
            <span className="inline-flex items-center rounded bg-sidebar-primary/20 px-1 tabular-nums text-[8px] leading-none">
              {activeFilterCount}
            </span>
          ) : null}
        </Button>
        {filtersOpen ? (
          <div
            ref={panelRef}
            role="dialog"
            aria-label={t("observability.logsFiltersTitle")}
            className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border border-sidebar-border bg-sidebar p-2 shadow-lg"
          >
            <p className="mb-1.5 px-1 text-[8px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("observability.logsCategory")}
            </p>
            <ul className="max-h-56 space-y-0.5 overflow-y-auto">
              {RUNTIME_LOG_CATEGORY_OPTS.map((cat) => (
                <li key={cat}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[8px] hover:bg-sidebar-accent/40",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-3 accent-primary"
                      checked={categories.has(cat)}
                      onChange={() => toggleCategory(cat)}
                    />
                    {cat}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
