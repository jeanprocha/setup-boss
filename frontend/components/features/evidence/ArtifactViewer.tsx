"use client";

import { useCallback, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/primitives/EmptyState";
import type { ArtifactVm } from "@/lib/runtime/evidence-types";
import {
  artifactDownloadFilename,
  artifactTypeIcon,
  selectArtifactViewer,
} from "@/lib/runtime/adapters/artifact-adapters";
import { cn } from "@/lib/utils";
import { Braces, Copy, Download, FileWarning, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/use-i18n";

const MAX_CHARS = 56_000;

function truncateContent(raw: string): { text: string; truncated: boolean } {
  if (raw.length <= MAX_CHARS) return { text: raw, truncated: false };
  return {
    text: `${raw.slice(0, MAX_CHARS)}\n\n… truncado (${raw.length} caracteres)`,
    truncated: true,
  };
}

function prettyJson(raw: string): { ok: boolean; text: string } {
  try {
    const o = JSON.parse(raw);
    return { ok: true, text: JSON.stringify(o, null, 2) };
  } catch {
    return { ok: false, text: raw };
  }
}

export function ArtifactViewer({
  artifact,
  className,
  contentLoading = false,
  contentUnsupported = false,
  contentTruncated = false,
  onClose,
}: {
  artifact: ArtifactVm | null;
  className?: string;
  contentLoading?: boolean;
  contentUnsupported?: boolean;
  contentTruncated?: boolean;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const viewer = useMemo(() => {
    if (!artifact) return "unsupported" as const;
    return selectArtifactViewer(artifact.mime, artifact.displayName);
  }, [artifact]);

  const { displayText, truncated, jsonPretty } = useMemo(() => {
    if (!artifact)
      return { displayText: "", truncated: false, jsonPretty: false };
    const t = truncateContent(artifact.content);
    if (viewer === "json") {
      const p = prettyJson(t.text);
      return {
        displayText: p.text,
        truncated: t.truncated,
        jsonPretty: p.ok,
      };
    }
    return { displayText: t.text, truncated: t.truncated, jsonPretty: false };
  }, [artifact, viewer]);

  const onCopy = useCallback(async () => {
    if (!artifact) return;
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* */
    }
  }, [artifact]);

  const onDownload = useCallback(() => {
    if (!artifact) return;
    const blob = new Blob([artifact.content], {
      type: artifact.mime || "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = artifactDownloadFilename(artifact.displayName, viewer);
    a.click();
    URL.revokeObjectURL(url);
  }, [artifact, viewer]);

  if (!artifact) {
    return (
      <EmptyState
        icon={FileWarning}
        title={t("artifactViewer.noneSelectedTitle")}
        hint={t("artifactViewer.noneSelectedHint")}
        className={cn("py-12", className)}
      />
    );
  }

  if (contentLoading) {
    return (
      <EmptyState
        icon={Braces}
        title={t("artifactViewer.loadingContentTitle")}
        hint={t("artifactViewer.loadingContentHint")}
        className={cn("py-12", className)}
      />
    );
  }

  if (contentUnsupported) {
    return (
      <EmptyState
        icon={Braces}
        title={t("artifactViewer.unsupportedTitle")}
        hint={t("artifactViewer.unsupportedHint")}
        className={cn("py-12", className)}
      />
    );
  }

  const TypeIcon = artifactTypeIcon(viewer);

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col border-l border-border/60 bg-background/30",
        className,
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
        <TypeIcon className="size-4 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-medium">
          {artifact.virtualPath}
          <span className="text-foreground">{artifact.displayName}</span>
        </span>
        <Badge variant="outline" className="text-[10px]">
          {viewer === "unsupported" ? "não suportado" : viewer}
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={onCopy}
        >
          <Copy className="size-3.5" aria-hidden />
          {copied ? t("common.copied") : t("common.copy")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={onDownload}
        >
          <Download className="size-3.5" aria-hidden />
          {t("common.download")}
        </Button>
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={onClose}
            aria-label={t("artifactViewer.closePreview")}
          >
            <X className="size-3.5" aria-hidden />
            {t("artifactViewer.closePreview")}
          </Button>
        ) : null}
      </div>
      {truncated || contentTruncated ? (
        <p className="shrink-0 border-b border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-100">
          {t("artifactViewer.viewTruncatedBanner")}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {viewer === "unsupported" ? (
          <EmptyState
            icon={Braces}
            title={t("artifactViewer.inlineUnsupportedTitle")}
            hint={t("artifactViewer.inlineUnsupportedHint")}
            className="py-8"
          />
        ) : viewer === "json" ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/95">
            {jsonPretty ? (
              displayText
            ) : (
              <span className="text-sb-warning">
                JSON inválido — raw:{"\n"}
                {displayText}
              </span>
            )}
          </pre>
        ) : viewer === "markdown" ? (
          <div className="prose-markdown text-[13px] leading-relaxed text-foreground/95">
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h1 className="mb-2 mt-3 text-base font-semibold first:mt-0">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="mb-1.5 mt-3 text-sm font-semibold">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="mb-1 mt-2 text-sm font-medium">{children}</h3>
                ),
                p: ({ children }) => (
                  <p className="mb-2 text-muted-foreground">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="mb-2 list-disc pl-5 text-muted-foreground">
                    {children}
                  </ul>
                ),
                li: ({ children }) => (
                  <li className="mb-0.5">{children}</li>
                ),
                code: (props) => {
                  const { children, className } = props;
                  const inline = !className;
                  return inline ? (
                    <code className="rounded bg-muted/50 px-1 font-mono text-[12px] text-cyan-100">
                      {children}
                    </code>
                  ) : (
                    <code className="block rounded-md bg-muted/40 p-2 font-mono text-[11px]">
                      {children}
                    </code>
                  );
                },
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-cyan-500/40 pl-3 text-muted-foreground italic">
                    {children}
                  </blockquote>
                ),
              }}
            >
              {displayText}
            </ReactMarkdown>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
            {displayText}
          </pre>
        )}
      </div>
    </div>
  );
}
