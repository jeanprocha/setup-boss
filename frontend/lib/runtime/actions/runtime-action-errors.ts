import { RuntimeApiError } from "@/lib/api/runtime-errors";
import type { RuntimeActionOutcome } from "@/lib/runtime/actions/runtime-action-types";

export class RuntimeActionError extends Error {
  readonly outcome: RuntimeActionOutcome;

  readonly status: number;

  constructor(
    message: string,
    outcome: RuntimeActionOutcome = "failed",
    status = 0,
  ) {
    super(message);
    this.name = "RuntimeActionError";
    this.outcome = outcome;
    this.status = status;
  }
}

export function mapActionError(e: unknown): RuntimeActionError {
  if (e instanceof RuntimeActionError) return e;
  if (e instanceof RuntimeApiError) {
    const outcome: RuntimeActionOutcome =
      e.code === "timeout"
        ? "timeout"
        : e.code === "network"
          ? "degraded"
          : "failed";
    return new RuntimeActionError(e.message, outcome, e.status);
  }
  return new RuntimeActionError(
    e instanceof Error ? e.message : "Acção falhou",
    "failed",
  );
}
