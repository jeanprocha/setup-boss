"use client";

import { useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArtifactsExplorer } from "@/components/features/evidence/ArtifactsExplorer";
import { ArtifactViewer } from "@/components/features/evidence/ArtifactViewer";
import { EvidenceSourceBanner } from "@/components/features/evidence/EvidenceSourceBanner";
import { DiagnosticsPanel } from "@/components/features/evidence/DiagnosticsPanel";
import { IntegrityRuntimeView } from "@/components/features/evidence/IntegrityRuntimeView";
import { useArtifactContent } from "@/hooks/use-artifact-content";
import {
  useRunEvidence,
  type EvidenceSource,
} from "@/hooks/use-run-evidence";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { FileStack, Link2, Stethoscope, Terminal } from "lucide-react";

export function BottomRuntimePanel({ heightPx }: { heightPx: number }) {
  const projectId = useMissionShellStore((s) => s.selectedProjectId);
  const runId = useMissionShellStore((s) => s.selectedRunId);
  const selectedArtifactId = useMissionShellStore(
    (s) => s.selectedEvidenceArtifactId,
  );
  const setSelectedArtifact = useMissionShellStore(
    (s) => s.setSelectedEvidenceArtifactId,
  );

  const { bundle, evidenceSource, evidenceKey, isLoading: evidenceLoading } =
    useRunEvidence(projectId, runId);
  const degraded = useRuntimeConnectionStore((s) => s.connection.degraded);
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);

  const artifactsById = useMemo(() => {
    const m = new Map(bundle.artifacts.map((a) => [a.id, a]));
    return m;
  }, [bundle.artifacts]);

  const selectedArtifact = selectedArtifactId
    ? artifactsById.get(selectedArtifactId) ?? null
    : null;

  const artifactContent = useArtifactContent({
    evidenceKey,
    artifact: selectedArtifact,
    evidenceSource,
  });

  const selectedArtifactForViewer = selectedArtifact
    ? {
        ...selectedArtifact,
        content: artifactContent.content || selectedArtifact.content,
      }
    : null;

  useEffect(() => {
    const ids = new Set(bundle.artifacts.map((a) => a.id));
    if (selectedArtifactId && ids.has(selectedArtifactId)) return;
    setSelectedArtifact(bundle.artifacts[0]?.id ?? null);
  }, [
    bundle.artifacts,
    runId,
    selectedArtifactId,
    setSelectedArtifact,
  ]);

  const nArt = bundle.artifacts.length;
  const nDiag = bundle.diagnostics.length;
  const evidenceEmpty =
    evidenceSource === "empty" && bundle.artifacts.length === 0;
  const diagUnavailable = evidenceEmpty && nDiag === 0;

  const correlationHint = useMemo(() => {
    const d = bundle.diagnostics.find((x) => x.relatedArtifactId);
    if (!d?.relatedArtifactId) return null;
    const a = artifactsById.get(d.relatedArtifactId);
    if (!a) return null;
    return { code: d.code, artifact: a.displayName };
  }, [bundle.diagnostics, artifactsById]);

  return (
    <div
      className="flex min-h-0 shrink-0 flex-col border-t border-border bg-muted/15"
      style={{ height: heightPx }}
    >
      <Tabs defaultValue="console" className="flex h-full min-h-0 flex-col">
        <TabsList className="h-9 w-full shrink-0 justify-start gap-0 rounded-none border-b border-border bg-muted/40 px-1">
          <TabsTrigger value="console" className="gap-1.5 rounded-none text-xs">
            <Terminal className="size-3.5" />
            Consola
          </TabsTrigger>
          <TabsTrigger
            value="artifacts"
            className="gap-1.5 rounded-none text-xs"
          >
            <FileStack className="size-3.5" />
            Artifacts
            <Badge variant="secondary" className="h-4 px-1 font-mono text-[9px]">
              {nArt}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="diagnostics"
            className="gap-1.5 rounded-none text-xs"
          >
            <Stethoscope className="size-3.5" />
            Diagnostics
            <Badge variant="secondary" className="h-4 px-1 font-mono text-[9px]">
              {nDiag}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="console"
          className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
        >
          {!reachable ? (
            <p className="shrink-0 border-b border-amber-500/30 bg-amber-500/5 px-3 py-1 text-[10px] text-amber-100">
              Runtime offline — consola com última mensagem reservada.
            </p>
          ) : null}
          <ScrollArea className="min-h-0 flex-1">
            <pre className="whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {bundle.consoleLines.join("\n")}
            </pre>
          </ScrollArea>
        </TabsContent>

        <TabsContent
          value="artifacts"
          className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
        >
          <EvidenceSourceBanner
            source={evidenceSource}
            loading={evidenceLoading}
            empty={evidenceEmpty}
            truncatedListing={bundle.truncatedListing}
          />
          {correlationHint ? (
            <div className="flex shrink-0 items-center gap-2 border-b border-border/50 bg-cyan-500/5 px-2 py-1 text-[10px] text-cyan-100/95">
              <Link2 className="size-3.5 shrink-0" aria-hidden />
              <span className="font-mono">
                {correlationHint.code} ↔ {correlationHint.artifact}
              </span>
              <span className="text-muted-foreground">
                — no separador Diagnostics, clique na entrada para abrir o
                artifact
              </span>
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <ArtifactsExplorer
              artifacts={bundle.artifacts}
              degraded={degraded}
              evidenceEmpty={evidenceEmpty}
            />
            <ArtifactViewer
              artifact={selectedArtifactForViewer}
              contentLoading={artifactContent.loading}
              contentUnsupported={artifactContent.unsupported}
              contentTruncated={artifactContent.truncated}
              className="min-w-0"
            />
          </div>
        </TabsContent>

        <TabsContent
          value="diagnostics"
          className="m-0 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 data-[state=inactive]:hidden"
        >
          <IntegrityRuntimeView
            report={bundle.integrity}
            unavailable={!bundle.integrity}
          />
          <DiagnosticsPanel
            diagnostics={bundle.diagnostics}
            artifactsById={artifactsById}
            degraded={degraded}
            diagnosticsUnavailable={diagUnavailable}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
