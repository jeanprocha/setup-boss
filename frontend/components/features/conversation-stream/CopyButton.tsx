"use client";

import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function CopyButton({
  text,
  className,
  label = "Copiar",
  copiedLabel = "Copiado",
  alwaysVisible = false,
}: {
  text: string;
  className?: string;
  label?: string;
  copiedLabel?: string;
  /** Sem hover para revelar — uso quando o bloco está expandido ou não é recolhível */
  alwaysVisible?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      disabled={!text.trim()}
      className={cn(
        "cs-text-caption cs-interactive inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-[opacity,color,background-color] duration-150",
        alwaysVisible
          ? "opacity-100"
          : "opacity-0 group-hover/entry:opacity-100 group-focus-within/entry:opacity-100",
        "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cs-border)]",
        "disabled:cursor-not-allowed disabled:hover:bg-transparent",
        copied && "opacity-100 text-emerald-600 dark:text-emerald-400",
        className,
      )}
      aria-label={copied ? copiedLabel : label}
    >
      {copied ? (
        <Check className="size-3 shrink-0" aria-hidden />
      ) : (
        <Copy className="size-3 shrink-0" aria-hidden />
      )}
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
}
