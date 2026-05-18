import type { ApiProjectRow, RunSummaryDto } from "@/lib/api/runtime-types";

const PROVIDER_PREFIXES: RegExp[] = [
  /^bitbucket-org-[a-z0-9]+-/i,
  /^github-com-[a-z0-9]+-/i,
  /^github-org-[a-z0-9]+-/i,
  /^gitlab-com-[a-z0-9]+-/i,
  /^github-/i,
];

export function basenamePath(p: string): string {
  const s = p.replace(/\\/g, "/").replace(/\/+$/, "");
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

function stripProviderPrefixes(s: string): string {
  let t = s.trim();
  for (const re of PROVIDER_PREFIXES) {
    t = t.replace(re, "");
  }
  return t.trim();
}

/**
 * Nome curto para a sidebar — ver relatório de usabilidade para regras.
 */
export function formatProjectDisplayName(row: ApiProjectRow): string {
  const explicit = row.displayName?.trim();
  const fromRoot = row.projectRoot?.trim()
    ? stripProviderPrefixes(basenamePath(row.projectRoot))
    : "";
  if (explicit) {
    const stripped = stripProviderPrefixes(explicit);
    return stripped || explicit;
  }
  if (fromRoot) return fromRoot;
  const pid = String(row.projectId || "").trim();
  return stripProviderPrefixes(pid) || pid || "Projeto";
}

/**
 * Texto para o cartão de atividade; assume `label` já preenchido pelo adapter.
 */
export function formatRunDisplayTitle(run: RunSummaryDto): string {
  const t = run.label?.trim();
  if (t) return t;
  const at = run.activityTitle?.trim();
  if (at) return at;
  if (run.startedAtLabel) return `Atividade · ${run.startedAtLabel}`;
  return "Atividade";
}

export function projectFullTechnicalTooltip(row: ApiProjectRow): string {
  const parts = [
    row.displayName,
    row.projectRoot,
    `id: ${row.projectId}`,
  ].filter((x) => x != null && String(x).trim() !== "");
  return parts.join("\n");
}

export function runTechnicalTooltip(run: RunSummaryDto): string {
  const idLine = run.runId?.trim() || run.id;
  return [formatRunDisplayTitle(run), `run/job: ${idLine}`]
    .filter(Boolean)
    .join("\n");
}
