import type { ApiRuntimeEventRow, RuntimeEventDto } from "@/lib/api/runtime-types";
import { runtimeEventTypeLabelPt } from "@/lib/runtime/adapters/runtime-labels";

function mapTypeToChannel(type: string): RuntimeEventDto["channel"] {
  const t = type.toLowerCase();
  if (
    t.startsWith("execution_") ||
    t.includes("review_") ||
    t.includes("correction_") ||
    t.includes("retry_") ||
    t.includes("subtask_")
  )
    return "runtime";
  if (t.includes("phase") || t.includes("pipeline") || t.includes("job_"))
    return "orchestrator";
  if (
    t === "run_created" ||
    t.includes("intake_") ||
    t.includes("clarification_initialized") ||
    t.includes("clarification_questions_generated")
  )
    return "orchestrator";
  if (t.includes("daemon") || t.includes("recovery") || t.includes("worker"))
    return "runtime";
  if (t.includes("maintenance") || t.includes("prune")) return "integrity";
  return "policy";
}

function mapTypeToSeverity(type: string): RuntimeEventDto["severity"] {
  const t = type.toLowerCase();
  if (
    t.includes("fail") ||
    t.includes("crash") ||
    t.includes("stuck") ||
    t.includes("rejected")
  )
    return "error";
  if (t.includes("warn") || t.includes("cancel")) return "warn";
  return "info";
}

function formatTs(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function readString(d: Record<string, unknown>, key: string): string | null {
  const v = d[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function extractPhaseHint(
  type: string,
  data: Record<string, unknown>,
): string | null {
  const t = type.toLowerCase();
  if (!t.includes("phase")) return null;
  return (
    readString(data, "phase") ??
    readString(data, "phaseId") ??
    readString(data, "name") ??
    null
  );
}

function buildMessage(
  row: ApiRuntimeEventRow,
  typeLabel: string,
): string {
  const d = row.data && typeof row.data === "object" ? row.data : {};
  const t = String(row.type || "").toLowerCase();
  if (t === "clarification_initialized") {
    const qc = (d as Record<string, unknown>)["questionsCount"];
    if (typeof qc === "number" && qc === 0) {
      return `${typeLabel} — aviso operacional: inicializado sem perguntas (estado diagnóstico).`;
    }
    if (typeof qc === "number" && qc > 0) {
      return `${typeLabel} · ${qc} pergunta(s).`;
    }
  }
  if (t === "clarification_questions_generated") {
    const qc = (d as Record<string, unknown>)["questionsCount"];
    const src = readString(d, "source");
    const n = typeof qc === "number" ? qc : "?";
    return src
      ? `${typeLabel} · ${n} pergunta(s) · origem ${src}`
      : `${typeLabel} · ${n} pergunta(s)`;
  }
  const msg =
    readString(d, "message") ??
    readString(d, "reason") ??
    readString(d, "detail") ??
    readString(d, "error");
  if (msg) {
    return msg.length > 220 ? `${msg.slice(0, 217)}…` : msg;
  }
  const phase = readString(d, "phase");
  if (phase) return `${typeLabel} · ${phase}`;
  const job = readString(d, "jobId");
  if (job) return `${typeLabel} · job ${job}`;
  return typeLabel;
}

export function mapApiEventToDto(row: ApiRuntimeEventRow): RuntimeEventDto {
  const iso = row.timestamp || new Date(0).toISOString();
  const typeLabel = runtimeEventTypeLabelPt(row.type);
  const d = row.data && typeof row.data === "object" ? row.data : {};
  const t = String(row.type || "").toLowerCase();

  let severity = mapTypeToSeverity(row.type);
  if (t === "clarification_initialized") {
    const qc = (d as Record<string, unknown>)["questionsCount"];
    if (typeof qc === "number" && qc === 0) severity = "warn";
  }

  return {
    id: String(row.id),
    tsIso: iso,
    ts: formatTs(iso),
    channel: mapTypeToChannel(row.type),
    message: buildMessage(row, typeLabel),
    severity,
    type: row.type,
    jobId: row.jobId != null ? String(row.jobId) : null,
    runId: row.runId != null ? String(row.runId) : null,
    phaseHint: extractPhaseHint(row.type, d),
    payload: Object.keys(d).length > 0 ? { ...d } : null,
  };
}
