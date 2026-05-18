export type MockProject = {
  id: string;
  name: string;
  path: string;
  lastActivity: string;
};

export const mockProjects: MockProject[] = [
  {
    id: "proj-alpha",
    name: "alpha-workspace",
    path: "~/repos/alpha-workspace",
    lastActivity: "há 12 min",
  },
  {
    id: "proj-beta",
    name: "setup-boss",
    path: "~/repos/setup-boss",
    lastActivity: "há 1 h",
  },
  {
    id: "proj-gamma",
    name: "infra-diagnostics",
    path: "~/repos/infra-diagnostics",
    lastActivity: "ontem",
  },
];
