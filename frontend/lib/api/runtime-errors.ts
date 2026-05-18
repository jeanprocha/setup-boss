export type RuntimeErrorCode =
  | "network"
  | "timeout"
  | "http"
  | "parse"
  | "contract"
  | "upstream";

import type { StructuredPreRunError } from "@/lib/runtime/intake/pre-run-error";

export class RuntimeApiError extends Error {
  readonly code: RuntimeErrorCode;

  readonly status: number;

  readonly structured?: StructuredPreRunError;

  constructor(
    message: string,
    code: RuntimeErrorCode,
    status = 0,
    structured?: StructuredPreRunError,
  ) {
    super(message);
    this.name = "RuntimeApiError";
    this.code = code;
    this.status = status;
    this.structured = structured;
  }
}

export function isRuntimeApiError(e: unknown): e is RuntimeApiError {
  return e instanceof RuntimeApiError;
}

export function isUnreachableLike(e: unknown): boolean {
  if (!isRuntimeApiError(e)) return false;
  return (
    e.code === "network" ||
    e.code === "timeout" ||
    (e.code === "http" && (e.status === 502 || e.status === 0))
  );
}
