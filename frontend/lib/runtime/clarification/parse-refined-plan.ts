import type { RefinementPreviewDto } from "@/lib/runtime/clarification/clarification-types";
import {
  sanitizeOperationalParagraph,
  sanitizeOperationalText,
} from "../operational/operational-plan-text-sanitize.ts";

const EMPTY_REFINEMENT: RefinementPreviewDto = {
  available: false,
  refinedTask: null,
  scopeChanges: [],
  acceptanceCriteria: [],
  risks: [],
  executionReadiness: "not_ready",
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => (x != null ? String(x).trim() : "")).filter(Boolean);
}

/** Garante arrays seguros para planos fallback / DTO parcial da API. */
export function normalizeRefinementPreview(
  refinement: Partial<RefinementPreviewDto> | null | undefined,
): RefinementPreviewDto {
  const r = refinement ?? {};
  const execReady = r.executionReadiness;
  const executionReadiness =
    execReady === "ready" ||
    execReady === "pending_approval" ||
    execReady === "not_ready"
      ? execReady
      : "not_ready";
  return {
    available: Boolean(r.available),
    refinedTask: r.refinedTask != null ? String(r.refinedTask) : null,
    scopeChanges: asStringArray(r.scopeChanges),
    acceptanceCriteria: asStringArray(r.acceptanceCriteria),
    risks: asStringArray(r.risks),
    executionReadiness,
  };
}

export type RefinedPlanSection = {
  title: string;
  items: string[];
  paragraphs: string[];
};

export type RefinedPlanPresentation = {
  objective: string | null;
  scopeIncluded: string[];
  scopeExcluded: string[];
  scopeChanges: string[];
  executionOrder: string[];
  acceptanceCriteria: string[];
  risks: string[];
  hasContent: boolean;
};

const TECHNICAL_LINE =
  /^(---|\{|```|task-plan|plan-refine-meta|skip_llm|local_fallback|extracto|"\w+":\s*)/i;
const TECHNICAL_INLINE =
  /\b(skip[-_\s]?llm|skip_llm|local_fallback_q\d+|task-plan-initial-meta|plan-refine-meta|task-plan-refined)\b/i;

function stripMarkerBlock(md: string): string {
  return md.replace(/^---TASK_PLAN_REFINED---\s*/m, "").trim();
}

function parseH2Sections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  const body = stripMarkerBlock(markdown);
  const chunks = body.split(/(?=^##\s+)/m).map((c) => c.trim()).filter(Boolean);
  for (const chunk of chunks) {
    const nl = chunk.indexOf("\n");
    const head = nl === -1 ? chunk : chunk.slice(0, nl).trim();
    const rest = nl === -1 ? "" : chunk.slice(nl + 1).trim();
    const hm = head.match(/^##\s+(.+?)\s*$/);
    if (hm) sections.set(hm[1]!.trim(), rest);
  }
  return sections;
}

function cleanLine(line: string): string | null {
  const sanitized = sanitizeOperationalText(line);
  if (!sanitized) return null;
  if (TECHNICAL_LINE.test(sanitized)) return null;
  if (TECHNICAL_INLINE.test(sanitized)) return null;
  if (/^\.?[\\/]/.test(sanitized) && sanitized.includes("/")) return null;
  if (sanitized.length > 400) return trunc(sanitized, 280);
  return sanitized;
}

function linesFromBody(body: string): string[] {
  const out: string[] = [];
  for (const raw of body.split("\n")) {
    const line = cleanLine(raw);
    if (line) out.push(line);
  }
  return out;
}

function numberedOrBullets(body: string): string[] {
  const lines = linesFromBody(body);
  if (lines.length > 0) return lines;
  const compact = body.replace(/\s+/g, " ").trim();
  return compact ? [trunc(compact, 320)] : [];
}

function trunc(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function splitScopeBody(body: string): {
  included: string[];
  excluded: string[];
} {
  const included: string[] = [];
  const excluded: string[] = [];
  let mode: "included" | "excluded" | null = null;

  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    if (/^inclu[ií]do|^dentro do escopo|^escopo inclu[ií]do/.test(lower)) {
      mode = "included";
      continue;
    }
    if (/^fora do escopo|^exclu[ií]do|^n[aã]o inclu[ií]do|^fora\s*:/.test(lower)) {
      mode = "excluded";
      continue;
    }
    if (/^#{1,6}\s|contexto|crit[eé]rio de sucesso/i.test(lower)) {
      continue;
    }
    const cleaned = cleanLine(line);
    if (!cleaned) continue;
    if (mode === "excluded") excluded.push(cleaned);
    else included.push(cleaned);
  }

  if (included.length === 0 && excluded.length === 0) {
    return { included: numberedOrBullets(body), excluded: [] };
  }
  return { included, excluded };
}

function cleanParagraph(text: string): string | null {
  const t = sanitizeOperationalParagraph(text);
  if (!t || TECHNICAL_LINE.test(t) || TECHNICAL_INLINE.test(t)) return null;
  return trunc(t, 480);
}

function rebuildMarkdownFromDto(refinement: RefinementPreviewDto): string {
  const r = normalizeRefinementPreview(refinement);
  const parts: string[] = [];
  if (r.refinedTask) {
    parts.push(`## Objetivo\n${r.refinedTask}`);
  }
  if (r.scopeChanges.length > 0) {
    parts.push(`## Escopo Refinado\n${r.scopeChanges.join("\n")}`);
  }
  if (r.acceptanceCriteria.length > 0) {
    parts.push(
      `## Critérios de Aceite\n${r.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}`,
    );
  }
  if (r.risks.length > 0) {
    parts.push(
      `## Riscos Restantes\n${r.risks.map((rsk) => `- ${rsk}`).join("\n")}`,
    );
  }
  return parts.join("\n\n");
}

/**
 * Converte DTO de refinement (e/ou markdown) num modelo de apresentação para review operacional.
 */
export function parseRefinedPlanPresentation(
  refinement: Partial<RefinementPreviewDto> | null | undefined,
  planMarkdown?: string | null,
): RefinedPlanPresentation {
  const r = normalizeRefinementPreview(refinement ?? EMPTY_REFINEMENT);
  const md =
    (planMarkdown && planMarkdown.trim()) ||
    rebuildMarkdownFromDto(r);
  const sections = md ? parseH2Sections(md) : new Map<string, string>();

  const objectiveRaw = sections.get("Objetivo") ?? r.refinedTask ?? null;
  const objective = objectiveRaw ? cleanParagraph(objectiveRaw) : null;

  const scopeBody = sections.get("Escopo Refinado") ?? "";
  const { included, excluded: scopeExcludedFromBody } =
    splitScopeBody(scopeBody);
  const outOfScope = sections.get("Fora de Escopo") ?? "";
  const scopeExcluded = [
    ...scopeExcludedFromBody,
    ...numberedOrBullets(outOfScope),
  ];

  const decisions = sections.get("Decisões Confirmadas") ?? "";
  const scopeChanges = [
    ...numberedOrBullets(decisions),
    ...r.scopeChanges
      .map((s) => cleanParagraph(s))
      .filter((s): s is string => Boolean(s)),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const stepsBody =
    sections.get("Passos Propostos") ??
    sections.get("Ordem de execução") ??
    "";
  const executionOrder = numberedOrBullets(stepsBody);

  const acBody = sections.get("Critérios de Aceite") ?? "";
  const acceptanceFromMd = numberedOrBullets(acBody);
  const acceptanceCriteria = [
    ...acceptanceFromMd,
    ...r.acceptanceCriteria
      .map((c) => cleanLine(c))
      .filter((c): c is string => Boolean(c)),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const risksBody = sections.get("Riscos Restantes") ?? "";
  const risksFromMd = numberedOrBullets(risksBody);
  const risks = [
    ...risksFromMd,
    ...r.risks
      .map((risk) => cleanLine(risk))
      .filter((risk): risk is string => Boolean(risk)),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const scopeIncluded =
    included.length > 0
      ? included
      : r.scopeChanges
          .map((s) => cleanLine(s))
          .filter((s): s is string => Boolean(s))
          .slice(0, 8);

  const hasContent = Boolean(
    objective ||
      scopeIncluded.length > 0 ||
      scopeExcluded.length > 0 ||
      scopeChanges.length > 0 ||
      executionOrder.length > 0 ||
      acceptanceCriteria.length > 0 ||
      risks.length > 0,
  );

  return {
    objective,
    scopeIncluded,
    scopeExcluded,
    scopeChanges,
    executionOrder,
    acceptanceCriteria,
    risks,
    hasContent,
  };
}

