export const RUNTIME_LOG_CATEGORY_OPTS = [
  "runtime",
  "strategy",
  "execution",
  "review",
  "correction",
  "clarification",
  "daemon",
  "ui",
  "git",
  "validation",
  "provider",
  "sse",
  "policy",
  "integrity",
] as const;

export type RuntimeLogCategory = (typeof RUNTIME_LOG_CATEGORY_OPTS)[number];

const STORAGE_KEY = "setup-boss.runtime-logs.categories";

const CAT_SET = new Set<string>(RUNTIME_LOG_CATEGORY_OPTS);

export function loadRuntimeLogCategoryFilters(): Set<string> {
  if (typeof window === "undefined") {
    return new Set(RUNTIME_LOG_CATEGORY_OPTS);
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set(RUNTIME_LOG_CATEGORY_OPTS);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set(RUNTIME_LOG_CATEGORY_OPTS);
    const valid = parsed.filter(
      (c): c is string => typeof c === "string" && CAT_SET.has(c),
    );
    if (valid.length === 0) return new Set(RUNTIME_LOG_CATEGORY_OPTS);
    return new Set(valid);
  } catch {
    return new Set(RUNTIME_LOG_CATEGORY_OPTS);
  }
}

export function saveRuntimeLogCategoryFilters(cats: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...cats]));
  } catch {
    /* quota / private mode */
  }
}

export function isAllRuntimeLogCategoriesSelected(cats: Set<string>): boolean {
  return RUNTIME_LOG_CATEGORY_OPTS.every((c) => cats.has(c));
}
