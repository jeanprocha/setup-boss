"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runtimePostJson } from "@/lib/api/client";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { RuntimeApiError } from "@/lib/api/runtime-errors";

export type GitRegisterResponseData = {
  projectId: string;
  projectRoot: string;
  local_path: string;
  action: "cloned" | "updated";
  provider: string;
  repo_url: string;
  branch: string | null;
};

/**
 * Clona ou actualiza um repositório Git sob SETUP_BOSS_PROJECTS_DIR e regista no runtime.
 */
export function useRegisterGitProject() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { repoUrl: string; branch?: string }) => {
      const repo_url = input.repoUrl.trim();
      if (!repo_url) {
        throw new RuntimeApiError("Indique o URL do repositório.", "network");
      }
      return runtimePostJson<{ ok?: boolean; data?: GitRegisterResponseData }>(
        "/projects/git/register",
        {
          repo_url,
          ...(input.branch?.trim() ? { branch: input.branch.trim() } : {}),
        },
        { timeoutMs: 180_000 },
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: runtimeQueryKeys.root });
    },
  });
}
