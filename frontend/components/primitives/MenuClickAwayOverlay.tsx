"use client";

import { cn } from "@/lib/utils";

/**
 * Overlay invisível para fechar menus/dropdowns ao clicar fora.
 * Usa `div` sem foco por teclado — `aria-hidden` em `button` focável
 * dispara aviso no Chrome quando o backdrop recebe foco.
 */
export function MenuClickAwayOverlay({
  onDismiss,
  className,
}: {
  onDismiss: () => void;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "fixed inset-0 z-30 cursor-default bg-transparent",
        className,
      )}
      onClick={onDismiss}
    />
  );
}
