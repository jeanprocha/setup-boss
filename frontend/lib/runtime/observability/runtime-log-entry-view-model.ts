import type {
  ObservabilityDaemonLogEntryDto,
  RuntimeEventDto,
} from "@/lib/api/runtime-types";
import {
  formatPreRunDiagnosticCopy,
  intakeInlineTitle,
  type StructuredPreRunError,
} from "@/lib/runtime/intake/pre-run-error";
import { runtimeEventLogCategory } from "@/lib/runtime/observability/runtime-log-category";
import {
  daemonEntryToNormalizedInput,
  normalizeRuntimeLogForUi,
  runtimeEventToNormalizedInput,
  strategyActivityLabel,
  type NormalizedRuntimeLogInput,
  type RuntimeLogUiTier,
} from "@/lib/runtime/observability/normalize-runtime-log-for-ui";
import {
  sanitizeHumanMessage,
  sanitizeHumanTitle,
} from "@/lib/runtime/ux/humanize-runtime-copy.ts";
import { normalizeRuntimeEvent } from "@/lib/runtime/ux/normalize-runtime-event.ts";

export type RuntimeLogVisualLevel =
  | "success"
  | "info"
  | "warn"
  | "error"
  | "debug"
  | "waiting";

export type RuntimeLogIconKind =
  | "success"
  | "warn"
  | "error"
  | "progress"
  | "waiting"
  | "git"
  | "debug"
  | "neutral";

export type RuntimeLogDetailsViewModel = {
  json: string;
  payloadOmittedLabel: string | null;
  truncatedInPanel: boolean;
};

export type RuntimeLogEntryViewModel = {
  id: string;
  level: RuntimeLogVisualLevel;
  displayLevel: string;
  category: string;
  stepTitle: string;
  shortMessage: string;
  timestamp: string;
  clockLabel: string;
  details: RuntimeLogDetailsViewModel | null;
  rawEvent: unknown;
  expandable: boolean;
  uiTier: RuntimeLogUiTier;
  icon: RuntimeLogIconKind;
  groupKey: string;
  groupedCount: number;
  runHint: string | null;
  phase: string | null;
  origin: string;
  source: "event" | "daemon" | "ui";
  payloadOmittedBytes: number | null;
};

export function formatPayloadOmittedLabel(bytes: number): string {
  const label =
    bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
  return `Payload técnico grande (${label})`;
}

export function formatLogClockShort(tsIso: string): string {
  const t = Date.parse(tsIso);
  if (Number.isNaN(t)) return tsIso.slice(11, 19) || tsIso;
  const d = new Date(t);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function eventDisplayLevel(ev: RuntimeEventDto): string {
  if (ev.severity === "error") return "ERROR";
  if (ev.severity === "warn") return "WARN";
  const ty = (ev.type || "").toLowerCase();
  if (
    /(_completed|completed|_approved|approved|job_completed|success|succeeded|intake_completed|review_completed|correction_completed)$/.test(
      ty,
    ) &&
    ev.severity === "info"
  ) {
    return "SUCCESS";
  }
  return "INFO";
}

function toVisualLevel(displayLevel: string): RuntimeLogVisualLevel {
  const x = displayLevel.toUpperCase();
  if (x === "ERROR") return "error";
  if (x === "WARN") return "warn";
  if (x === "SUCCESS") return "success";
  if (x === "DEBUG") return "debug";
  if (x === "WAITING" || x === "WAITING_USER") return "waiting";
  return "info";
}

function deriveIcon(
  level: RuntimeLogVisualLevel,
  category: string,
  type: string,
): RuntimeLogIconKind {
  if (category === "git" || /branch|git/i.test(type)) return "git";
  if (level === "error") return "error";
  if (level === "warn") return "warn";
  if (level === "success") return "success";
  if (level === "waiting") return "waiting";
  if (level === "debug") return "debug";
  if (/started|generat|decompos|progress|execut/i.test(type)) return "progress";
  return "neutral";
}

function deriveStepTitle(
  input: NormalizedRuntimeLogInput,
  category: string,
  normMessage: string,
): string {
  const type = String(input.type || "").toLowerCase();
  const msg = String(input.message || "").toLowerCase();

  const fromStrategy = strategyActivityLabel(type || input.message);
  if (fromStrategy !== "Evento do runtime") return fromStrategy;

  if (category === "git" || /branch|git/i.test(type + msg)) {
    if (/pendente|pending|required|not_ready/i.test(normMessage + msg))
      return "Git branch pendente";
    if (/prepar|checkout|created/i.test(normMessage + msg))
      return "Git branch preparada";
    return "Git";
  }
  if (category === "clarification" || /clarif|approve|answer/i.test(type)) {
    if (/conclu|completed|approved/i.test(type + msg))
      return "Clarificação concluída";
    if (/aguard|waiting/i.test(type + msg)) return "Clarificação em espera";
    return "Clarificação";
  }
  if (category === "strategy" || /^strategy_/i.test(type)) {
    if (/fail/i.test(type)) return "Falha na estratégia";
    if (/complet/i.test(type)) return "Estratégia concluída";
    if (/start|generat|decompos/i.test(type + msg))
      return "Gerando estratégia";
    return "Estratégia";
  }
  if (category === "execution" || /execut|subtask|phase2/i.test(type)) {
    if (/ready|pronto/i.test(type + msg)) return "Pronto para execução";
    if (/fail|block/i.test(type + msg)) return "Falha na execução";
    return "Execução";
  }
  if (category === "review" || /review/i.test(type)) {
    if (/reject|fail|block/i.test(type + msg)) return "Falha no review";
    if (/complet|pass/i.test(type + msg)) return "Review concluído";
    return "Review";
  }
  if (/waiting_user|user_action/i.test(type + msg))
    return "Aguardando ação do operador";

  const human = (input.message || type)
    .replace(/^runtime\./i, "")
    .replace(/[._]/g, " ")
    .trim();
  if (!human) return "Runtime";
  return human.charAt(0).toUpperCase() + human.slice(1);
}

function deriveShortMessage(
  norm: ReturnType<typeof normalizeRuntimeLogForUi>,
  input: NormalizedRuntimeLogInput,
  stepTitle: string,
): string {
  const detail = norm.compactDetail?.trim();
  const msg = norm.displayMessage?.trim() || input.message?.trim() || "";

  if (norm.omitRawPayload && norm.payloadOmittedBytes != null) {
    return formatPayloadOmittedLabel(norm.payloadOmittedBytes);
  }

  if (detail && detail !== msg && !detail.startsWith("Payload técnico grande")) {
    return detail.length > 120 ? `${detail.slice(0, 117)}…` : detail;
  }

  if (msg && msg !== stepTitle) {
    return msg.length > 140 ? `${msg.slice(0, 137)}…` : msg;
  }

  if (/conclu|completed|approved/i.test(String(input.type))) {
    return "concluído com sucesso";
  }
  if (/start|iniciad/i.test(String(input.type))) return "em progresso";
  if (/fail|erro/i.test(String(input.type))) return "falhou — ver detalhes";

  return msg || "evento registado";
}

function buildDetailsObject(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of [
    "runId",
    "jobId",
    "phase",
    "type",
    "channel",
    "level",
    "severity",
    "timestamp",
    "tsIso",
  ]) {
    if (raw[k] != null && raw[k] !== "") out[k] = raw[k];
  }
  if (raw.payload != null) out.payload = raw.payload;
  if (raw.job != null) out.job = raw.job;
  if (raw.metadata != null) out.metadata = raw.metadata;
  if (raw.stack != null) out.stack = raw.stack;
  if (raw.error != null) out.error = raw.error;
  if (raw.detail != null) out.detail = raw.detail;
  return out;
}

function buildDetailsJson(
  raw: Record<string, unknown>,
  maxChars: number,
): RuntimeLogDetailsViewModel {
  const obj = buildDetailsObject(raw);
  let json = JSON.stringify(obj, null, 2);
  let truncatedInPanel = false;
  if (json.length > maxChars) {
    json = `${json.slice(0, maxChars)}\n…`;
    truncatedInPanel = true;
  }
  const omitted =
    typeof raw.payloadOmittedBytes === "number"
      ? formatPayloadOmittedLabel(raw.payloadOmittedBytes)
      : null;
  return { json, payloadOmittedLabel: omitted, truncatedInPanel };
}

function makeGroupKey(vm: Pick<
  RuntimeLogEntryViewModel,
  "category" | "stepTitle" | "displayLevel" | "uiTier"
>): string {
  return `${vm.uiTier}|${vm.category}|${vm.stepTitle}|${vm.displayLevel}`;
}

/** Agrupa entradas consecutivas de ruído/técnico com a mesma chave. */
export function groupRepeatedRuntimeLogEntries(
  entries: readonly RuntimeLogEntryViewModel[],
): RuntimeLogEntryViewModel[] {
  const out: RuntimeLogEntryViewModel[] = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    const groupable = e.uiTier === "noise" || e.uiTier === "technical";
    if (
      last &&
      groupable &&
      last.groupKey === e.groupKey &&
      (last.uiTier === "noise" || last.uiTier === "technical")
    ) {
      last.groupedCount += 1;
      continue;
    }
    out.push({ ...e, groupedCount: 1 });
  }
  return out;
}

export function buildRuntimeLogEntryFromEvent(
  ev: RuntimeEventDto,
  opts?: { detailCap?: number },
): RuntimeLogEntryViewModel {
  const cap = opts?.detailCap ?? 48_000;
  const input = runtimeEventToNormalizedInput(ev);
  const norm = normalizeRuntimeLogForUi(input);
  const category = runtimeEventLogCategory(ev);
  const displayLevel = eventDisplayLevel(ev);
  const level = toVisualLevel(displayLevel);
  const ux = normalizeRuntimeEvent(ev);
  const uxTitle = sanitizeHumanTitle(ux.title);
  const uxMessage = sanitizeHumanMessage(ux.message);
  const stepTitle =
    uxTitle && uxTitle !== "Atividade do runtime"
      ? uxTitle
      : deriveStepTitle(input, category, norm.displayMessage);
  const shortMessage =
    uxMessage ||
    deriveShortMessage(norm, input, stepTitle);
  const type = ev.type || "";

  const raw: Record<string, unknown> = {
    runId: ev.runId ?? norm.shortRunId,
    jobId: ev.jobId,
    phase: ev.phaseHint ?? norm.phase,
    type: ev.type,
    channel: ev.channel,
    severity: ev.severity,
    timestamp: ev.tsIso,
    tsIso: ev.tsIso,
    message: ev.message,
    metadata: ev.metadata ?? undefined,
    payload: norm.omitRawPayload ? undefined : (ev.payload ?? undefined),
    payloadOmittedBytes: norm.payloadOmittedBytes ?? undefined,
  };

  if (norm.omitRawPayload && ev.payload) {
    raw.payloadPreview = "[omitido na vista rápida — expandir]";
  }

  const details = buildDetailsJson(raw, cap);
  const expandable =
    Boolean(details.json && details.json !== "{}") ||
    norm.omitRawPayload ||
    Boolean(ev.metadata);

  const vm: RuntimeLogEntryViewModel = {
    id: `evt_${ev.id}`,
    level,
    displayLevel,
    category,
    stepTitle,
    shortMessage,
    timestamp: ev.tsIso,
    clockLabel: formatLogClockShort(ev.tsIso),
    details: expandable ? details : null,
    rawEvent: ev,
    expandable,
    uiTier: norm.tier,
    icon: deriveIcon(level, category, type),
    groupKey: "",
    groupedCount: 1,
    runHint: norm.shortRunId ?? ev.runId ?? ev.jobId,
    phase: norm.phase,
    origin: ev.channel,
    source: "event",
    payloadOmittedBytes: norm.payloadOmittedBytes,
  };
  vm.groupKey = makeGroupKey(vm);
  return vm;
}

/** Epoch ISO — só quando a entrada daemon ainda não tem ts (não deve ocorrer após ingest no store). */
const DAEMON_TS_FALLBACK_ISO = "1970-01-01T00:00:00.000Z";

export function buildRuntimeLogEntryFromDaemon(
  d: ObservabilityDaemonLogEntryDto,
  opts?: { detailCap?: number; fallbackTs?: string },
): RuntimeLogEntryViewModel {
  const cap = opts?.detailCap ?? 48_000;
  const input = daemonEntryToNormalizedInput(d, opts?.fallbackTs);
  const norm = normalizeRuntimeLogForUi(input);
  const category = d.category || "daemon";
  const displayLevel = String(d.level || "INFO").toUpperCase();
  const level = toVisualLevel(displayLevel);
  const tsIso = d.tsIso ?? opts?.fallbackTs ?? DAEMON_TS_FALLBACK_ISO;
  const stepTitle = deriveStepTitle(input, category, norm.displayMessage);
  const shortMessage = deriveShortMessage(norm, input, stepTitle);

  let parsedDetail: unknown = d.detail;
  if (d.detail && !norm.omitRawPayload) {
    try {
      parsedDetail = JSON.parse(d.detail);
    } catch {
      parsedDetail = d.detail;
    }
  }

  const raw: Record<string, unknown> = {
    runId: norm.shortRunId,
    phase: norm.phase,
    level: displayLevel,
    category,
    message: d.message,
    timestamp: tsIso,
    detail: norm.omitRawPayload ? undefined : parsedDetail,
    payloadOmittedBytes: norm.payloadOmittedBytes ?? undefined,
    detailTruncated: d.detailTruncated,
    detailBytes: d.detailBytes,
  };

  const details = buildDetailsJson(raw, cap);
  const expandable =
    Boolean(details.json && details.json !== "{}") || norm.omitRawPayload;

  const vm: RuntimeLogEntryViewModel = {
    id: d.id,
    level,
    displayLevel,
    category,
    stepTitle,
    shortMessage,
    timestamp: tsIso,
    clockLabel: formatLogClockShort(tsIso),
    details: expandable ? details : null,
    rawEvent: d,
    expandable,
    uiTier: norm.tier,
    icon: deriveIcon(level, category, d.message),
    groupKey: "",
    groupedCount: 1,
    runHint: norm.shortRunId,
    phase: norm.phase,
    origin: "daemon",
    source: "daemon",
    payloadOmittedBytes: norm.payloadOmittedBytes,
  };
  vm.groupKey = makeGroupKey(vm);
  return vm;
}

export function buildRuntimeLogEntryFromUiDiagnostic(d: {
  id: string;
  tsIso: string;
  level: string;
  message: string;
  detail: string | null;
  category?: string;
}): RuntimeLogEntryViewModel {
  const displayLevel = d.level.toUpperCase();
  const level = toVisualLevel(displayLevel);
  const logCategory = d.category?.trim() || "ui";
  const input: NormalizedRuntimeLogInput = {
    tsIso: d.tsIso,
    message: d.message,
    detail: d.detail,
    channel: "ui",
    category: logCategory,
    severity: displayLevel === "ERROR" ? "error" : "info",
  };
  const norm = normalizeRuntimeLogForUi(input);
  const stepTitle =
    logCategory === "validation"
      ? "Governança .IA"
      : logCategory === "execution"
        ? "Execução"
        : "Interface";
  const shortMessage =
    d.detail?.trim() && d.detail !== d.message
      ? d.detail.slice(0, 140)
      : d.message;

  const raw: Record<string, unknown> = {
    message: d.message,
    detail: d.detail,
    timestamp: d.tsIso,
    level: displayLevel,
    category: "ui",
  };
  const details = buildDetailsJson(raw, 12_000);

  const vm: RuntimeLogEntryViewModel = {
    id: d.id,
    level,
    displayLevel,
    category: logCategory,
    stepTitle,
    shortMessage,
    timestamp: d.tsIso,
    clockLabel: formatLogClockShort(d.tsIso),
    details,
    rawEvent: d,
    expandable: true,
    uiTier: "important",
    icon:
      level === "error"
        ? "error"
        : displayLevel === "WARN"
          ? "warn"
          : "neutral",
    groupKey: "",
    groupedCount: 1,
    runHint: null,
    phase: null,
    origin: "mission_control",
    source: "ui",
    payloadOmittedBytes: null,
  };
  vm.groupKey = makeGroupKey(vm);
  return vm;
}

export function finalizeRuntimeLogEntry(
  vm: RuntimeLogEntryViewModel,
): RuntimeLogEntryViewModel {
  return { ...vm, groupKey: makeGroupKey(vm) };
}

export function preRunDiagnosticDedupeKey(
  ev: StructuredPreRunError,
): string {
  return `${ev.traceId || ""}:${ev.code}:${ev.timestamp || ""}`;
}

export function buildRuntimeLogEntryFromPreRun(
  ev: StructuredPreRunError & { id?: string },
): RuntimeLogEntryViewModel {
  const tsIso = ev.timestamp?.trim() || new Date().toISOString();
  const stepTitle = intakeInlineTitle(ev);
  const shortMessage =
    ev.summary?.trim() ||
    ev.description?.trim() ||
    ev.message?.trim() ||
    ev.code;
  const displayLevel =
    ev.code.includes("WARNING") || ev.code.includes("WARN") ? "WARN" : "ERROR";
  const level = toVisualLevel(displayLevel);
  const copy = formatPreRunDiagnosticCopy(ev);
  const raw: Record<string, unknown> = { ...ev };
  const details = buildDetailsJson(raw, 24_000);
  if (details && copy.length > details.json.length) {
    details.json = copy.slice(0, 24_000);
  }

  const vm: RuntimeLogEntryViewModel = {
    id:
      ev.id?.trim() ||
      `pre_${preRunDiagnosticDedupeKey(ev).replace(/[^a-zA-Z0-9_-]+/g, "_")}`,
    level,
    displayLevel,
    category: "validation",
    stepTitle,
    shortMessage,
    timestamp: tsIso,
    clockLabel: formatLogClockShort(tsIso),
    details,
    rawEvent: ev,
    expandable: true,
    uiTier: "important",
    icon: level === "error" ? "error" : "warn",
    groupKey: "",
    groupedCount: 1,
    runHint: ev.projectId?.trim() || null,
    phase: ev.phase?.trim() || null,
    origin: "mission_control",
    source: "ui",
    payloadOmittedBytes: null,
  };
  vm.groupKey = makeGroupKey(vm);
  return vm;
}
