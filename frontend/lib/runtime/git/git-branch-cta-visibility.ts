import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { ExecuteAvailability } from "@/lib/runtime/orchestration/orchestration-types";

/**
 * CTA Git só quando o bloqueio dominante de execução é preparação de branch.
 * Clarificação/strategy/outros guards têm prioridade em deriveExecuteAvailability.
 */
export function shouldShowGitBranchPrepareCta(
  availability: ExecuteAvailability,
  summary: RunSummaryDto | null | undefined,
): boolean {
  if (availability.reason !== "git_branch_required") return false;
  if (summary?.git?.status === "git_branch_ready") return false;
  return true;
}

export function formatGitStatusLabel(status: string | null | undefined): string | null {
  const s = status != null ? String(status).trim() : "";
  if (!s) return null;
  switch (s) {
    case "git_branch_ready":
      return "Branch preparada";
    case "git_branch_pending":
      return "Branch pendente";
    case "git_branch_failed":
      return "Falha ao preparar branch";
    default:
      return s.replace(/_/g, " ");
  }
}
