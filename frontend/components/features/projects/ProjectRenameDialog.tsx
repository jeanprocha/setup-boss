"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/use-i18n";

export function ProjectRenameDialog({
  open,
  onOpenChange,
  projectId,
  serverDisplayName,
  initialNickname,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  serverDisplayName: string;
  initialNickname: string;
  onSave: (projectId: string, nickname: string) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initialNickname);

  useEffect(() => {
    if (open) setValue(initialNickname);
  }, [open, initialNickname]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal
      aria-labelledby="rename-project-title"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-border/80 bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="rename-project-title"
          className="text-sm font-semibold text-foreground"
        >
          {t("sidebar.renameNicknameTitle")}
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {t("sidebar.renameNicknameTechnical", {
            name: serverDisplayName,
            id: projectId,
          })}
        </p>
        <label className="mt-3 block space-y-1">
          <span className="text-[10px] font-medium uppercase text-muted-foreground">
            {t("sidebar.renameNicknameLabel")}
          </span>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={serverDisplayName}
            autoComplete="off"
            className="w-full rounded-md border border-border/70 bg-background/60 px-2 py-1.5 text-[13px]"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              onSave(projectId, value);
              onOpenChange(false);
            }}
          >
            {t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
