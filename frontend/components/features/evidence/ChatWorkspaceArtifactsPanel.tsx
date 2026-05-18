"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArtifactsExplorer } from "@/components/features/evidence/ArtifactsExplorer";
import { ArtifactViewer } from "@/components/features/evidence/ArtifactViewer";
import { EvidenceSourceBanner } from "@/components/features/evidence/EvidenceSourceBanner";
import { EmptyState } from "@/components/primitives/EmptyState";
import { useArtifactContent } from "@/hooks/use-artifact-content";
import { useRunEvidence } from "@/hooks/use-run-evidence";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { FileStack } from "lucide-react";
import { useI18n } from "@/lib/i18n/use-i18n";

export function ChatWorkspaceArtifactsPanel() {
  const { t } = useI18n();
  const projectId = useMissionShellStore((s) => s.selectedProjectId);
  const runId = useMissionShellStore((s) => s.selectedRunId);
  const newActivityFlow = useMissionShellStore((s) => s.newActivityFlow);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { bundle, evidenceSource, evidenceKey, isLoading } = useRunEvidence(
    projectId,
    runId,
  );
  const degraded = useRuntimeConnectionStore((s) => s.connection.degraded);
  const qc = useQueryClient();

  const artifactsById = useMemo(() => {
    return new Map(bundle.artifacts.map((a) => [a.id, a]));
  }, [bundle.artifacts]);

  useEffect(() => {
    setSelectedId(null);
  }, [runId]);

  useEffect(() => {
    if (!evidenceKey) return;
    const id = setInterval(() => {
      void qc.invalidateQueries({
        queryKey: [...runtimeQueryKeys.runEvidence(evidenceKey)],
      });
    }, 28_000);
    return () => clearInterval(id);
  }, [evidenceKey, qc]);

  const selectedArtifact = selectedId
    ? (artifactsById.get(selectedId) ?? null)
    : null;

  const artifactContent = useArtifactContent({
    evidenceKey,
    artifact: selectedArtifact,
    evidenceSource,
  });

  const selectedForViewer = selectedArtifact
    ? {
        ...selectedArtifact,
        content: artifactContent.content || selectedArtifact.content,
      }
    : null;

  const evidenceEmpty =
    evidenceSource === "empty" && bundle.artifacts.length === 0;

  if (newActivityFlow || !runId) {
    return (
      <EmptyState
        icon={FileStack}
        title={t("timeline.noRunTitle")}
        hint={t("timeline.noRunHint")}
        className="min-h-[12rem] py-10"
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <EvidenceSourceBanner
        source={evidenceSource}
        loading={isLoading}
        empty={evidenceEmpty}
        truncatedListing={bundle.truncatedListing}
      />
      <div
        className={
          selectedId
            ? "flex min-h-0 min-w-0 flex-[0_1_42%] flex-col overflow-hidden border-b border-sidebar-border/80"
            : "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        }
      >
        <ArtifactsExplorer
          artifacts={bundle.artifacts}
          degraded={degraded}
          evidenceEmpty={evidenceEmpty}
          stacked
          selection={{
            selectedId,
            onSelect: setSelectedId,
          }}
        />
      </div>
      {selectedId && selectedForViewer ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ArtifactViewer
            artifact={selectedForViewer}
            contentLoading={artifactContent.loading}
            contentUnsupported={artifactContent.unsupported}
            contentTruncated={artifactContent.truncated}
            className="min-h-0 border-l-0"
            onClose={() => setSelectedId(null)}
          />
        </div>
      ) : null}
    </div>
  );
}
