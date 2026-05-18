"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ConfirmDangerDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  loading,
  confirmVariant = "destructive",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  confirmVariant?: "destructive" | "default";
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4"
      role="alertdialog"
      aria-modal
      aria-labelledby="confirm-danger-title"
      aria-describedby="confirm-danger-desc"
      onClick={() => {
        if (!loading) onOpenChange(false);
      }}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-border/80 bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-danger-title"
          className="text-sm font-semibold leading-snug text-foreground"
        >
          {title}
        </h2>
        <div
          id="confirm-danger-desc"
          className="mt-2 text-[12px] leading-relaxed text-muted-foreground"
        >
          {description}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            size="sm"
            className={cn(confirmVariant === "default" && "font-semibold")}
            disabled={loading}
            onClick={() => {
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
