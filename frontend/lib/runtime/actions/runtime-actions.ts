import { runtimePostJson } from "@/lib/api/client";
import { RuntimeActionError } from "@/lib/runtime/actions/runtime-action-errors";
import type {
  JobCancelResponse,
  JobRetryResponse,
  RuntimeActionContext,
  RuntimeActionId,
  RuntimeActionResult,
} from "@/lib/runtime/actions/runtime-action-types";

function success(
  actionId: RuntimeActionId,
  message: string,
  data?: Record<string, unknown>,
): RuntimeActionResult {
  return { ok: true, actionId, outcome: "success", message, data };
}

function unsupported(actionId: RuntimeActionId, message: string): RuntimeActionResult {
  return {
    ok: false,
    actionId,
    outcome: "unsupported",
    message,
    unsupported: true,
  };
}

function parseApiError(json: unknown, fallback: string): string {
  if (
    json &&
    typeof json === "object" &&
    "error" in json &&
    typeof (json as { error?: { message?: string } }).error?.message === "string"
  ) {
    return String((json as { error: { message: string } }).error.message);
  }
  return fallback;
}

export async function postJobCancel(
  jobId: string,
  reason?: string,
): Promise<RuntimeActionResult> {
  const j = await runtimePostJson<JobCancelResponse>(
    `/jobs/${encodeURIComponent(jobId)}/cancel`,
    reason ? { reason } : {},
    { timeoutMs: 12_000 },
  );
  if (j.ok === false) {
    throw new RuntimeActionError(
      parseApiError(j, "Cancelamento rejeitado."),
      "failed",
    );
  }
  const outcome = j.data?.outcome ?? j.outcome ?? "cancelled";
  return success("cancel-run", `Cancelamento: ${outcome}`, {
    jobId,
    outcome,
    status: j.data?.status,
  });
}

export async function postJobRetry(jobId: string): Promise<RuntimeActionResult> {
  const j = await runtimePostJson<JobRetryResponse>(
    `/jobs/${encodeURIComponent(jobId)}/retry`,
    {},
    { timeoutMs: 12_000 },
  );
  if (j.ok === false) {
    throw new RuntimeActionError(
      parseApiError(j, "Retry rejeitado."),
      "failed",
    );
  }
  return success("retry-run", "Job reenfileirado para nova tentativa.", {
    jobId,
    status: j.data?.status,
    availableAt: j.data?.availableAt ?? null,
  });
}

/**
 * Executa acção contra Runtime API (ou operação local segura para refresh).
 * Não assume sucesso optimista — resultado explícito.
 */
export async function executeRuntimeAction(
  actionId: RuntimeActionId,
  ctx: RuntimeActionContext,
  opts?: { cancelReason?: string },
): Promise<RuntimeActionResult> {
  switch (actionId) {
    case "refresh":
      return success(
        "refresh",
        ctx.connectionDegraded
          ? "Dados actualizados (runtime degradado)."
          : "Runtime actualizado.",
      );

    case "cancel-run":
      if (!ctx.jobId) {
        throw new RuntimeActionError("Job id em falta.", "failed");
      }
      return postJobCancel(ctx.jobId, opts?.cancelReason);

    case "retry-run":
      if (!ctx.jobId) {
        throw new RuntimeActionError("Job id em falta.", "failed");
      }
      return postJobRetry(ctx.jobId);

    case "validate-integrity":
      return unsupported(
        "validate-integrity",
        "Endpoint de validação não exposto no daemon — use evidência read-only.",
      );

    case "rebuild-observability":
      return unsupported(
        "rebuild-observability",
        "Rebuild de observabilidade não disponível na Runtime API MVP.",
      );

    case "resume-run":
      return unsupported(
        "resume-run",
        "Resume não disponível na Runtime API — operação CLI.",
      );

    default:
      return unsupported(actionId, "Acção não implementada.");
  }
}
