import type {
  ProjectSummaryDto,
  RunSummaryDto,
} from "@/lib/api/runtime-types";
import type { MockProject } from "@/lib/mocks/projects";
import type { MockRun } from "@/lib/mocks/runs";

export function mockRunToRunSummaryDto(
  m: MockRun,
  projectId: string,
): RunSummaryDto {
  return {
    id: m.id,
    runId: m.id,
    projectId: m.projectId ?? projectId,
    label: m.label,
    phase: m.phase,
    state: m.state,
    startedAtLabel: m.startedAt,
    branchHint: m.branch,
  };
}

export function mockProjectToSummary(p: MockProject): ProjectSummaryDto {
  return {
    id: p.id,
    displayName: p.name,
    subtitle: p.lastActivity,
    lastSeenAt: null,
  };
}

export function runSummaryToMockRun(
  s: RunSummaryDto,
  projectId: string,
): MockRun {
  return {
    id: s.runId || s.id,
    projectId: s.projectId || projectId,
    label: s.label,
    phase: s.phase,
    branch: s.branchHint ?? "—",
    state: s.state,
    startedAt: s.startedAtLabel ?? "—",
  };
}
