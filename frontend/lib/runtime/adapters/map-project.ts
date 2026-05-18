import type { ApiProjectRow, ProjectSummaryDto } from "@/lib/api/runtime-types";
import {
  formatProjectDisplayName,
  projectFullTechnicalTooltip,
} from "@/lib/runtime/format-display";

function jobCountsSubtitle(row: ApiProjectRow): string | null {
  const c = row.jobCounts;
  if (!c || typeof c !== "object") return null;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(c)) {
    if (typeof v === "number" && v > 0) parts.push(`${k}:${v}`);
  }
  return parts.length ? parts.slice(0, 4).join(" · ") : null;
}

export function mapApiProjectToSummary(row: ApiProjectRow): ProjectSummaryDto {
  return {
    id: String(row.projectId),
    displayName: formatProjectDisplayName(row),
    technicalSummary: projectFullTechnicalTooltip(row),
    subtitle: jobCountsSubtitle(row),
    lastSeenAt: row.lastSeenAt != null ? String(row.lastSeenAt) : null,
  };
}
