const STORAGE_KEY = "setup-boss-project-display-aliases-v1";

export type ProjectDisplayAliases = Record<string, string>;

export function readProjectDisplayAliases(): ProjectDisplayAliases {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const out: ProjectDisplayAliases = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!k || typeof v !== "string") continue;
      const t = v.trim();
      if (t) out[k] = t;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeProjectDisplayAliases(map: ProjectDisplayAliases) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* */
  }
}

export function resolveProjectListLabel(
  projectId: string,
  serverDisplayName: string,
  aliases: ProjectDisplayAliases,
): string {
  const a = aliases[projectId]?.trim();
  if (a) return a;
  return serverDisplayName?.trim() || projectId;
}
