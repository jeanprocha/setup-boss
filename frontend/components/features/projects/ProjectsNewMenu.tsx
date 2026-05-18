"use client";

import { useState } from "react";
import { MenuClickAwayOverlay } from "@/components/primitives/MenuClickAwayOverlay";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/use-i18n";
import { ChevronDown, Plus } from "lucide-react";

export function ProjectsNewMenu({
  gitRepoEnabled,
  onAddGitRepository,
  onCreateWorkspace,
  variant = "toolbar",
}: {
  gitRepoEnabled: boolean;
  onAddGitRepository: () => void;
  onCreateWorkspace?: () => void;
  /** toolbar: texto "Novo" + chevron; compact: só ícone + */
  variant?: "toolbar" | "compact";
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <Button
        type="button"
        variant="ghost"
        size={variant === "compact" ? "icon-sm" : "sm"}
        className={cn(
          "bg-transparent shadow-none hover:bg-sidebar-accent/30",
          variant === "toolbar" &&
            "h-7 gap-0.5 px-2 text-[11px] font-semibold",
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          variant === "compact" ? t("sidebar.newMenuAriaCompact") : undefined
        }
        title={variant === "compact" ? t("sidebar.newMenuButton") : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {variant === "compact" ? (
          <Plus className="size-3.5" aria-hidden />
        ) : (
          <>
            {t("sidebar.newMenuButton")}
            <ChevronDown className="size-3 opacity-70" aria-hidden />
          </>
        )}
      </Button>
      {open ? (
        <>
          <MenuClickAwayOverlay onDismiss={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-full z-40 mt-0.5 min-w-[11.5rem] rounded-md border border-border bg-popover py-0.5 shadow-md"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              disabled={!gitRepoEnabled || !onCreateWorkspace}
              title={
                !gitRepoEnabled
                  ? t("sidebar.runtimeOfflineProjects")
                  : undefined
              }
              className="flex w-full px-2.5 py-1.5 text-left text-[11px] hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onCreateWorkspace?.();
              }}
            >
              {t("sidebar.createWorkspace")}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!gitRepoEnabled}
              title={
                !gitRepoEnabled
                  ? t("sidebar.runtimeOfflineProjects")
                  : t("sidebar.addGitRepoTitle")
              }
              className="flex w-full px-2.5 py-1.5 text-left text-[11px] hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                if (gitRepoEnabled) onAddGitRepository();
              }}
            >
              {t("sidebar.gitRepository")}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled
              className="flex w-full px-2.5 py-1.5 text-left text-[11px] text-muted-foreground disabled:cursor-not-allowed disabled:opacity-55"
            >
              {t("sidebar.localRepository")}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled
              className="flex w-full px-2.5 py-1.5 text-left text-[11px] text-muted-foreground disabled:cursor-not-allowed disabled:opacity-55"
            >
              {t("sidebar.temporaryProject")}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
