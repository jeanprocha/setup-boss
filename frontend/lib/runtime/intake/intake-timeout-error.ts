import type { StructuredPreRunError } from "./pre-run-error.ts";
import { isRuntimeApiError } from "@/lib/api/runtime-errors";

export const INTAKE_TIMEOUT_CODE = "INTAKE_TIMEOUT";

const TIMEOUT_MESSAGE_PATTERNS = [
  /aborted due to timeout/i,
  /timeout ao contactar runtime/i,
  /signal timed out/i,
  /operation timed out/i,
];

export function isAbortTimeoutMessage(message: string): boolean {
  const m = String(message || "").trim();
  if (!m) return false;
  return TIMEOUT_MESSAGE_PATTERNS.some((re) => re.test(m));
}

export function isIntakeTimeoutError(error: unknown): boolean {
  if (isRuntimeApiError(error) && error.code === "timeout") return true;
  if (error instanceof Error && isAbortTimeoutMessage(error.message)) return true;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    isAbortTimeoutMessage(String((error as { message?: string }).message))
  ) {
    return true;
  }
  return false;
}

export type IntakeTimeoutContext = {
  projectId: string;
  selectedProjectId?: string | null;
  endpoint?: string;
  method?: string;
  timeoutMs?: number;
  elapsedMs?: number;
  traceId?: string | null;
  timestamp?: string;
  rawMessage?: string;
};

export function intakeTimeoutTitle(): string {
  return "Tempo limite ao iniciar execução";
}

export function intakeTimeoutBody(): string {
  return (
    "O Setup-Boss demorou mais que o esperado para responder ao iniciar a execução. " +
    "A tentativa pode ter sido interrompida antes da criação da run."
  );
}

export function buildIntakeTimeoutStructuredError(
  ctx: IntakeTimeoutContext,
): StructuredPreRunError {
  const ts = ctx.timestamp || new Date().toISOString();
  return {
    code: INTAKE_TIMEOUT_CODE,
    phase: "submit",
    title: intakeTimeoutTitle(),
    message: intakeTimeoutBody(),
    description: ctx.rawMessage?.trim() || intakeTimeoutBody(),
    projectId: ctx.projectId,
    projectRoot: null,
    suggestedActions: [
      "Confirme que o daemon está activo (npm run dev:stack)",
      "Tente novamente após alguns segundos",
      "Abra Observabilidade e verifique o evento INTAKE_TIMEOUT",
    ],
    traceId: ctx.traceId ?? undefined,
    timestamp: ts,
    details: {
      endpoint: ctx.endpoint ?? "POST /runs",
      method: ctx.method ?? "POST",
      timeoutMs: ctx.timeoutMs ?? 15_000,
      elapsedMs: ctx.elapsedMs ?? null,
      projectId: ctx.projectId,
      selectedProjectId: ctx.selectedProjectId ?? null,
      rawMessage: ctx.rawMessage ?? null,
    },
  };
}

export function formatIntakeTimeoutDiagnosticCopy(
  err: StructuredPreRunError,
): string {
  const d =
    err.details && typeof err.details === "object"
      ? (err.details as Record<string, unknown>)
      : {};
  const lines = [
    "=== Setup-Boss — Intake timeout ===",
    "",
    `code: ${err.code}`,
    `phase: ${err.phase}`,
    `title: ${err.title}`,
    `message: ${err.message}`,
    "",
    `endpoint: ${d.endpoint ?? "POST /runs"}`,
    `method: ${d.method ?? "POST"}`,
    d.timeoutMs != null ? `timeoutMs: ${d.timeoutMs}` : null,
    d.elapsedMs != null ? `elapsedMs: ${d.elapsedMs}` : null,
    err.projectId ? `projectId: ${err.projectId}` : null,
    d.selectedProjectId ? `selectedProjectId: ${d.selectedProjectId}` : null,
    err.traceId ? `traceId: ${err.traceId}` : null,
    err.timestamp ? `timestamp: ${err.timestamp}` : null,
    d.rawMessage ? `rawMessage: ${d.rawMessage}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

/** Evita window.open acidental em acções de diagnóstico. */
export function safeClipboardWrite(text: string): void {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => {
      /* sem fallback que abre janela */
    });
  }
}
