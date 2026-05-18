"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/primitives/EmptyState";
import { ArtifactListItem } from "@/components/features/evidence/ArtifactListItem";
import type { ArtifactCategory, ArtifactVm } from "@/lib/runtime/evidence-types";
import {
  artifactCategoryIcon,
  artifactCategoryLabel,
  compareArtifactCategories,
} from "@/lib/runtime/adapters/artifact-adapters";
import { cn } from "@/lib/utils";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { ChevronDown, ChevronRight, FolderOpen } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/use-i18n";

function groupByCategory(artifacts: ArtifactVm[]): Map<ArtifactCategory, ArtifactVm[]> {
  const m = new Map<ArtifactCategory, ArtifactVm[]>();
  for (const a of artifacts) {
    const list = m.get(a.category) ?? [];
    list.push(a);
    m.set(a.category, list);
  }
  return m;
}

function ArtifactGroupSection({
  cat,
  list,
  groupIndex,
  selectedId,
  onSelect,
  open,
  onToggle,
}: {
  cat: ArtifactCategory;
  list: ArtifactVm[];
  groupIndex: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const CatIcon = artifactCategoryIcon(cat);
  const label = artifactCategoryLabel(cat);

  return (
    <section
      className={cn(
        groupIndex > 0 &&
          "mt-1 border-t border-neutral-200/80 pt-1 dark:border-sidebar-border",
      )}
    >
      <button
        type="button"
        className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left transition-colors hover:bg-neutral-50/90 dark:hover:bg-sidebar-accent/25"
        aria-expanded={open}
        onClick={onToggle}
        aria-label={
          open
            ? t("artifacts.categoryCollapse", { name: label })
            : t("artifacts.categoryExpand", { name: label })
        }
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          {open ? (
            <ChevronDown className="size-3.5" aria-hidden />
          ) : (
            <ChevronRight className="size-3.5" aria-hidden />
          )}
        </span>
        <CatIcon className="size-3 shrink-0 opacity-70" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[10px] font-medium uppercase tracking-[0.06em] text-neutral-600 dark:text-sidebar-foreground/80">
          {label}
        </span>
        <span className="shrink-0 tabular-nums text-[10px] text-neutral-400 dark:text-sidebar-foreground/55">
          ({list.length})
        </span>
      </button>
      {open ? (
        <ol className="m-0 list-none divide-y divide-neutral-200/80 p-0 dark:divide-sidebar-border">
          {list.map((a) => (
            <ArtifactListItem
              key={a.id}
              artifact={a}
              active={a.id === selectedId}
              onActivate={() => onSelect(selectedId === a.id ? null : a.id)}
            />
          ))}
        </ol>
      ) : null}
    </section>
  );
}

export function ArtifactsExplorer({
  artifacts,
  degraded,
  evidenceEmpty,
  selection,
  stacked,
}: {
  artifacts: ArtifactVm[];
  degraded: boolean;
  evidenceEmpty: boolean;
  /** Se definido, não usa `selectedEvidenceArtifactId` do mission shell */
  selection?: {
    selectedId: string | null;
    onSelect: (id: string | null) => void;
  };
  /** Painel estreito: lista em coluna única sem barra lateral */
  stacked?: boolean;
}) {
  const { t } = useI18n();
  const storeSelectedId = useMissionShellStore(
    (s) => s.selectedEvidenceArtifactId,
  );
  const setStoreSelected = useMissionShellStore(
    (s) => s.setSelectedEvidenceArtifactId,
  );

  const selectedId = selection?.selectedId ?? storeSelectedId;
  const setSelected = selection?.onSelect ?? setStoreSelected;

  const [collapsedCats, setCollapsedCats] = useState(
    () => new Set<ArtifactCategory>(),
  );

  const artifactSetKey = useMemo(
    () => artifacts.map((a) => a.id).join("\0"),
    [artifacts],
  );

  useEffect(() => {
    setCollapsedCats(new Set());
  }, [artifactSetKey]);

  const handleSelect = useCallback(
    (id: string | null) => {
      if (id) {
        const art = artifacts.find((a) => a.id === id);
        if (art) {
          setCollapsedCats((prev) => {
            if (!prev.has(art.category)) return prev;
            const next = new Set(prev);
            next.delete(art.category);
            return next;
          });
        }
      }
      setSelected(id);
    },
    [artifacts, setSelected],
  );

  const toggleCategory = useCallback((cat: ArtifactCategory) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const groups = useMemo(() => {
    const m = groupByCategory(artifacts);
    return [...m.entries()].sort(([ca], [cb]) =>
      compareArtifactCategories(ca, cb),
    );
  }, [artifacts]);

  const shellClass = cn(
    "flex w-full min-w-0 flex-col",
    stacked && "min-h-0 flex-1 overflow-hidden",
    !stacked && "border-r border-sidebar-border/60 md:w-[min(100%,260px)]",
  );

  const listScrollClass = "min-h-0 flex-1 overflow-y-auto overscroll-y-auto";

  if (!artifacts.length) {
    return (
      <div className={shellClass}>
        {degraded ? (
          <p className="border-b border-amber-500/25 bg-amber-500/5 px-2 py-1 text-[10px] text-amber-900/90 dark:text-amber-100/90">
            {t("artifacts.explorerRuntimeDegraded")}
          </p>
        ) : null}
        <EmptyState
          icon={FolderOpen}
          title={
            evidenceEmpty
              ? t("artifacts.explorerEmptyTitleUnavailable")
              : t("artifacts.explorerEmptyTitleNoArtifacts")
          }
          hint={
            evidenceEmpty
              ? t("artifacts.explorerEmptyHintJob")
              : t("artifacts.explorerEmptyHintNoFiles")
          }
          className="border-none bg-transparent py-6 text-left"
        />
      </div>
    );
  }

  return (
    <div className={shellClass}>
      {degraded ? (
        <p className="shrink-0 border-b border-amber-500/25 bg-amber-500/5 px-2 py-1 text-[10px] text-amber-900/90 dark:text-amber-100/90">
          {t("artifacts.explorerDegradedModeShort")}
        </p>
      ) : null}
      {stacked ? (
        <div className={listScrollClass}>
          <nav
            aria-label={t("artifacts.explorerNavAria")}
            className="px-1.5 py-1 text-left"
          >
            {groups.map(([cat, list], groupIndex) => (
              <ArtifactGroupSection
                key={cat}
                cat={cat}
                list={list}
                groupIndex={groupIndex}
                selectedId={selectedId}
                onSelect={handleSelect}
                open={!collapsedCats.has(cat)}
                onToggle={() => toggleCategory(cat)}
              />
            ))}
          </nav>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <nav
            aria-label={t("artifacts.explorerNavAria")}
            className="px-1.5 py-1 text-left"
          >
            {groups.map(([cat, list], groupIndex) => (
              <ArtifactGroupSection
                key={cat}
                cat={cat}
                list={list}
                groupIndex={groupIndex}
                selectedId={selectedId}
                onSelect={handleSelect}
                open={!collapsedCats.has(cat)}
                onToggle={() => toggleCategory(cat)}
              />
            ))}
          </nav>
        </ScrollArea>
      )}
    </div>
  );
}
