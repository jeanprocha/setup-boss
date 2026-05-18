import type { RuntimeUiState } from "./runtime-states";

export type MockRun = {
  id: string;
  projectId: string;
  label: string;
  phase: string;
  branch: string;
  state: RuntimeUiState;
  startedAt: string;
};

export const mockRuns: MockRun[] = [
  {
    id: "run-1024",
    projectId: "proj-alpha",
    label: "strategy → execution",
    phase: "execution",
    branch: "feature/mission-control-ui",
    state: "running",
    startedAt: "14:02:11",
  },
  {
    id: "run-1023",
    projectId: "proj-alpha",
    label: "intake + clarify",
    phase: "clarify",
    branch: "main",
    state: "success",
    startedAt: "13:41:00",
  },
  {
    id: "run-1022",
    projectId: "proj-alpha",
    label: "review gate",
    phase: "review",
    branch: "feature/mission-control-ui",
    state: "waiting_approval",
    startedAt: "12:08:33",
  },
  {
    id: "run-1021",
    projectId: "proj-alpha",
    label: "correction loop",
    phase: "correction",
    branch: "feature/mission-control-ui",
    state: "correcting",
    startedAt: "11:55:02",
  },
  {
    id: "run-1020",
    projectId: "proj-alpha",
    label: "post-failure retry",
    phase: "execution",
    branch: "feature/mission-control-ui",
    state: "retrying",
    startedAt: "10:22:19",
  },
  {
    id: "run-1019",
    projectId: "proj-alpha",
    label: "integrity rebuild",
    phase: "stabilization",
    branch: "main",
    state: "recovered",
    startedAt: "09:01:00",
  },
  {
    id: "run-1018",
    projectId: "proj-beta",
    label: "full pipeline",
    phase: "review",
    branch: "develop",
    state: "blocked",
    startedAt: "09:12:44",
  },
];
