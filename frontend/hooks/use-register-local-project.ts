"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runtimePostJson } from "@/lib/api/client";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { RuntimeApiError } from "@/lib/api/runtime-errors";

/**
 * Registo de pasta local como projecto no runtime (`POST /projects/register`).
 */
export function useRegisterLocalProject() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (projectRoot: string) => {
      const trimmed = projectRoot.trim();
      if (!trimmed) {
        throw new RuntimeApiError("Indique o caminho da pasta.", "network");
      }
      return runtimePostJson<{ ok?: boolean; data?: unknown }>(
        "/projects/register",
        { projectRoot: trimmed },
        { timeoutMs: 20_000 },
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: runtimeQueryKeys.root });
    },
  });
}
