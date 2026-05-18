/** Padrões que não devem aparecer em copy humano (feed / banner / timeline). */
const TECHNICAL_COPY_PATTERNS = [
  /skipped\s*=/i,
  /payload\s*t[eé]cnico/i,
  /^governance\./i,
  /^runtime\./i,
  /output_dir/i,
  /scheduler_tick/i,
  /workspace_run_sync/i,
  /^job_claimed$/i,
  /^job_started$/i,
  /^heartbeat$/i,
  /^\{.*\}$/,
];

const TECHNICAL_TITLE_PATTERNS = [
  /^evento:/i,
  /^governance/i,
  /^runtime\./i,
  /skipped\s*=/i,
];

/**
 * Remove ou trunca mensagens com jargão técnico para UI operacional.
 */
export function sanitizeHumanMessage(message: string | null | undefined): string {
  const trimmed = String(message ?? "").trim();
  if (!trimmed) return "";
  if (TECHNICAL_COPY_PATTERNS.some((p) => p.test(trimmed))) return "";
  if (trimmed.length > 140) return `${trimmed.slice(0, 137)}…`;
  return trimmed;
}

export function sanitizeHumanTitle(title: string): string {
  const trimmed = String(title ?? "").trim();
  if (!trimmed) return "Atividade do runtime";
  if (TECHNICAL_TITLE_PATTERNS.some((p) => p.test(trimmed))) {
    return humanizeRawTypeLabel(trimmed);
  }
  if (/^_/.test(trimmed) && trimmed.includes("_")) {
    return humanizeRawTypeLabel(trimmed);
  }
  return trimmed;
}

/** Converte snake_case / runtime.type em rótulo legível PT. */
export function humanizeRawTypeLabel(raw: string): string {
  const t = raw.toLowerCase().trim();
  const known: Record<string, string> = {
    "governance.ia_warning": "Base .IA com avisos",
    "governance.ia_ok": "Base .IA validada",
    "governance.ia_failed": "Validação .IA falhou",
    governance_ia_warning: "Base .IA com avisos",
    governance_ia_ok: "Base .IA validada",
    runtime_output_dir_resolved: "Diretório de saída definido",
    strategy_completed: "Estratégia concluída",
    clarification_initialized: "Clarificação preparada",
  };
  if (known[t]) return known[t];
  if (t.includes("governance") && t.includes("warn")) return "Base .IA com avisos";
  if (t.includes("governance") && t.includes("fail")) return "Validação .IA falhou";
  if (t.includes("governance")) return "Validação de governança";
  return t
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 60);
}

export function isTechnicalLookingCopy(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return (
    TECHNICAL_COPY_PATTERNS.some((p) => p.test(t)) ||
    TECHNICAL_TITLE_PATTERNS.some((p) => p.test(t))
  );
}
