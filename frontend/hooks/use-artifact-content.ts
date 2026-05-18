"use client";

import { useQuery } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { fetchArtifactContent } from "@/lib/api/runtime-api";
import { mapArtifactContentToVm } from "@/lib/runtime/adapters/map-evidence";
import type { ArtifactVm } from "@/lib/runtime/evidence-types";
import type { EvidenceSource } from "@/hooks/use-run-evidence";

export function useArtifactContent(opts: {
  evidenceKey: string | null;
  artifact: ArtifactVm | null;
  evidenceSource: EvidenceSource;
}): {
  content: string;
  loading: boolean;
  unsupported: boolean;
  truncated: boolean;
} {
  const { evidenceKey, artifact, evidenceSource } = opts;
  const needsFetch =
    evidenceSource === "api" &&
    Boolean(evidenceKey && artifact?.id) &&
    !artifact?.content;

  const q = useQuery({
    queryKey: runtimeQueryKeys.artifactContent(evidenceKey, artifact?.id ?? null),
    queryFn: async () => {
      if (!evidenceKey || !artifact?.id) return null;
      return fetchArtifactContent(evidenceKey, artifact.id);
    },
    enabled: needsFetch,
    staleTime: 60_000,
  });

  if (!artifact) {
    return { content: "", loading: false, unsupported: false, truncated: false };
  }

  if (artifact.content) {
    return {
      content: artifact.content,
      loading: false,
      unsupported: false,
      truncated: false,
    };
  }

  if (!needsFetch) {
    return {
      content: artifact.content,
      loading: false,
      unsupported: false,
      truncated: false,
    };
  }

  if (q.isLoading) {
    return { content: "", loading: true, unsupported: false, truncated: false };
  }

  if (q.data) {
    const vm = mapArtifactContentToVm(q.data);
    return {
      content: vm.content,
      loading: false,
      unsupported: q.data.unsupported,
      truncated: q.data.truncated,
    };
  }

  return { content: "", loading: false, unsupported: false, truncated: false };
}
