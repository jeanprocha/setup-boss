import { runtimePostJson } from "@/lib/api/client";
import { RuntimeApiError } from "@/lib/api/runtime-errors";
import {
  createRunErrorMessage,
  mapApiCreateRunResult,
} from "@/lib/runtime/intake/intake-adapters";
import type {
  CreateRunPayload,
  CreateRunResultDto,
} from "@/lib/runtime/intake/intake-types";

type CreateRunJson = {
  ok?: boolean;
  data?: Record<string, unknown>;
  error?: { code?: string; message?: string };
};

export async function createRunFromTask(
  payload: CreateRunPayload,
): Promise<CreateRunResultDto> {
  try {
    const j = await runtimePostJson<CreateRunJson>(
      "/runs",
      {
        projectId: payload.projectId,
        task: payload.task,
        metadata: payload.metadata ?? {},
      },
      { timeoutMs: 120_000 },
    );
    const mapped = mapApiCreateRunResult(j);
    if (mapped) return mapped;
    throw new RuntimeApiError(
      createRunErrorMessage(j, "Resposta inválida ao criar corrida."),
      "contract",
    );
  } catch (e) {
    if (e instanceof RuntimeApiError) throw e;
    throw new RuntimeApiError(
      e instanceof Error ? e.message : "Falha ao criar corrida.",
      "network",
    );
  }
}
