import { RuntimeApiError, isRuntimeApiError } from "@/lib/api/runtime-errors";

/** Prefixo em `unsupportedReason` — sinaliza conflito terminal (sem polling agressivo). */
export const RUN_READ_MODEL_CONFLICT_PREFIX = "[read-model-conflito]";

export function isRunReadModelConflictError(e: unknown): e is RuntimeApiError {
  return isRuntimeApiError(e) && e.code === "http" && e.status === 409;
}

export function isRunReadModelNotFoundError(e: unknown): e is RuntimeApiError {
  return isRuntimeApiError(e) && e.code === "http" && e.status === 404;
}

export function isRunReadModelConflictReason(
  reason: string | null | undefined,
): boolean {
  return Boolean(reason?.startsWith(RUN_READ_MODEL_CONFLICT_PREFIX));
}

export function runReadModelConflictMessage(
  e: RuntimeApiError,
  endpointLabel: string,
): string {
  const code = e.structured?.code ?? "";
  if (code === "run_id_missing" || /sem runId/i.test(e.message)) {
    return (
      `Conflito ao carregar ${endpointLabel}: o job ainda não tem runId associado. ` +
      "Aguarde o intake concluir ou seleccione a corrida pelo identificador da run."
    );
  }
  return (
    e.message?.trim() ||
    `Conflito ao carregar ${endpointLabel} (HTTP 409). Verifique a selecção da corrida.`
  );
}

export function formatRunReadModelConflictReason(
  e: RuntimeApiError,
  endpointLabel: string,
): string {
  return `${RUN_READ_MODEL_CONFLICT_PREFIX} ${runReadModelConflictMessage(e, endpointLabel)}`;
}
