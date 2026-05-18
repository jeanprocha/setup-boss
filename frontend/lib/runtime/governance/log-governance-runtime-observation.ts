import type { ProjectGovernanceUx } from "@/lib/runtime/governance/ia-governance-ux";
import { useUiDiagnosticsStore } from "@/stores/ui-diagnostics-store";

/** Uma linha de aviso por projeto por sessão (evita duplicar em refetch / Strict Mode). */
const loggedGovernanceWarnings = new Set<string>();

export function governanceRuntimeLogDedupeKey(
  projectId: string,
  ux: ProjectGovernanceUx,
): string {
  return `${projectId}:${ux.readiness}:${ux.warningsCount}:${ux.errorsCount}`;
}

export function resetGovernanceRuntimeLogSession(projectId?: string | null): void {
  if (projectId) {
    loggedGovernanceWarnings.delete(projectId);
    return;
  }
  loggedGovernanceWarnings.clear();
}

function hasGovernanceWarningInStore(projectId: string): boolean {
  return useUiDiagnosticsStore.getState().entries.some((e) => {
    if (e.category !== "validation" || e.level !== "WARN") return false;
    if (!e.detail) return false;
    try {
      const parsed = JSON.parse(e.detail) as { projectId?: string };
      return parsed.projectId === projectId;
    } catch {
      return false;
    }
  });
}

/** Avisos de governança que não bloqueiam execução → console de logs (não card no intake). */
export function logGovernanceWarningToRuntime(
  projectId: string,
  ux: ProjectGovernanceUx,
): void {
  if (ux.readiness !== "warning") return;
  if (loggedGovernanceWarnings.has(projectId)) return;
  if (hasGovernanceWarningInStore(projectId)) {
    loggedGovernanceWarnings.add(projectId);
    return;
  }

  const meta = [
    ux.specVersion ? `SPEC v${ux.specVersion}` : null,
    ux.validationDurationMs != null ? `${ux.validationDurationMs}ms` : null,
    `${ux.warningsCount} aviso(s)`,
    `${ux.errorsCount} erro(s)`,
    ux.performance.fileCount != null
      ? `${ux.performance.fileCount} ficheiros`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  useUiDiagnosticsStore.getState().append({
    level: "WARN",
    category: "validation",
    message:
      ux.headline.trim() || "Execução permitida com avisos de governança `.IA`",
    detail: {
      projectId,
      readiness: ux.readiness,
      summary: ux.summary,
      meta,
      validatedAt: ux.validatedAt,
      ...(ux.reportText.trim() ? { report: ux.reportText } : {}),
    },
  });

  loggedGovernanceWarnings.add(projectId);
}
