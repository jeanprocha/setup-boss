/**
 * Filtro partilhado com `core/filter-operational-projects.js` (Mission Control sidebar).
 * Mantém as mesmas regras no frontend como defesa em profundidade.
 */

export type OperationalProjectLike = {
  id?: string;
  projectId?: string;
  displayName?: string | null;
  projectRoot?: string | null;
  metadata?: Record<string, unknown> | null;
};

const FIXTURE_BASENAMES = new Set([
  "demo",
  "demo-project",
  "demo-block",
  "demo-no-plan",
]);

const DEMO_NAME_RE = /^demo(?:-|$)/i;

const FIXTURE_LABEL_PREFIX_RE =
  /^(?:DEMO-|demo-|SB-EXEC-|SB-CLAR-|SB-INTAKE-|sb-exec-|sb-clar-|sb-intake-)/i;

const TEMP_HARNESS_SEGMENT_RE =
  /^(?:dbg-[\w-]+|sb-(?:exec-trigger|intake-api-ok|smoke|clar(?:-[\w-]+)?)[\w-]*)$/i;

function normalizePath(raw: string): string {
  const t = raw.trim().replace(/\\/g, "/");
  if (!t) return "";
  const parts = t.split("/").filter(Boolean);
  if (t.startsWith("/") || /^[a-zA-Z]:/.test(t)) {
    return (t.startsWith("/") ? "/" : "") + parts.join("/");
  }
  return parts.join("/");
}

function basename(p: string): string {
  const n = normalizePath(p);
  const parts = n.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function parentBasename(p: string): string {
  const n = normalizePath(p);
  const parts = n.split("/").filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] : "";
}

function looksLikeOsTempPath(root: string): boolean {
  const n = normalizePath(root).toLowerCase();
  return (
    n.includes("/appdata/local/temp/") ||
    n.includes("\\appdata\\local\\temp\\") ||
    n.startsWith("/tmp/")
  );
}

function pathLooksLikeTempHarness(root: string): boolean {
  const n = normalizePath(root);
  if (!n || !looksLikeOsTempPath(n)) return false;
  const base = basename(n);
  const parent = parentBasename(n);
  if (TEMP_HARNESS_SEGMENT_RE.test(base)) return true;
  if (TEMP_HARNESS_SEGMENT_RE.test(parent)) return true;
  return false;
}

function looksLikeFixtureLabel(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  const lower = n.toLowerCase();
  if (FIXTURE_BASENAMES.has(lower)) return true;
  if (DEMO_NAME_RE.test(n)) return true;
  if (FIXTURE_LABEL_PREFIX_RE.test(n)) return true;
  return false;
}

function metadataIndicatesFixture(m: Record<string, unknown> | null | undefined): boolean {
  if (!m || typeof m !== "object") return false;
  if (m.isDemo === true || m.demo === true) return true;
  const kind = String(m.kind ?? "").trim().toLowerCase();
  if (kind === "demo" || kind === "fixture" || kind === "test") return true;
  const src = m.source;
  if (src && typeof src === "object" && !Array.isArray(src)) {
    const mode = (src as { mode?: string }).mode;
    if (mode === "test-fixture") return true;
  }
  return false;
}

/** Projecto válido para listagem operacional (sidebar / GET /projects). */
export function isValidManagedProject(row: OperationalProjectLike): boolean {
  if (metadataIndicatesFixture(row.metadata ?? undefined)) return false;

  const root = row.projectRoot != null ? normalizePath(String(row.projectRoot)) : "";
  if (!root) return false;
  if (pathLooksLikeTempHarness(root)) return false;

  const base = basename(root);
  const disp = row.displayName != null ? String(row.displayName).trim() : "";
  const pid =
    row.projectId != null
      ? String(row.projectId).trim()
      : row.id != null
        ? String(row.id).trim()
        : "";

  if (looksLikeFixtureLabel(base)) return false;
  if (looksLikeFixtureLabel(disp)) return false;
  if (pid && looksLikeFixtureLabel(pid)) return false;

  return true;
}

export function filterOperationalProjects<T extends OperationalProjectLike>(
  rows: T[],
): T[] {
  return rows.filter((r) => isValidManagedProject(r));
}
