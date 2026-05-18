"use client";

import { useState } from "react";
import { MenuClickAwayOverlay } from "@/components/primitives/MenuClickAwayOverlay";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/use-i18n";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

export function WorkspaceOverflowMenu({
  disabled,
  onEdit,
  onDelete,
}: {
  disabled?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-6 shrink-0 text-muted-foreground hover:bg-sidebar-accent/45"
        disabled={disabled}
        aria-label={t("workspace.actionsAria")}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <MoreHorizontal className="size-3" />
      </Button>
      {open ? (
        <>
          <MenuClickAwayOverlay onDismiss={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full z-40 mt-0.5 min-w-[10rem] rounded-md border border-border bg-popover py-0.5 shadow-md"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] hover:bg-accent"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onEdit();
              }}
            >
              <Pencil className="size-3.5 shrink-0 opacity-80" aria-hidden />
              {t("workspace.editAction")}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] text-destructive hover:bg-destructive/10"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onDelete();
              }}
            >
              <Trash2 className="size-3.5 shrink-0 opacity-80" aria-hidden />
              {t("workspace.deleteAction")}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
