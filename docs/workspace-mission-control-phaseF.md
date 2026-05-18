# Mission Control — Fase F (UI WorkspaceRun + Git agregado)

UI mínima para operar **SetupWorkspace** e **WorkspaceRun** no Mission Control, reutilizando o proxy `/api/runtime` e o padrão React Query + Zustand existente.

## Navegação

1. **Sidebar** — secção **Workspaces** (acima de Projetos)
   - Expandir workspace → lista de WorkspaceRuns
   - Clicar num run → painel central dedicado

2. **Painel central** — `WorkspaceRunViewShell` quando `selectedWorkspaceRunId` está definido
   - Título, status agregado, branch global, progresso das minis
   - Card Git agregado + card miniActivities

3. **Runs filhos** — botão **Run filho** numa mini abre o fluxo Project → Run habitual (limpa seleção de workspace run)

## API frontend

| Módulo | Funções |
|--------|---------|
| `lib/api/workspace-runtime-api.ts` | `fetchWorkspaces`, `fetchWorkspaceRuns`, `fetchWorkspaceRun`, `fetchWorkspaceRunGitStatus`, `postPrepareWorkspaceGit`, `postRetryPrepareWorkspaceGitProject`, `postStartWorkspaceRun`, `postResumeWorkspaceRun`, `postRetryWorkspaceMiniActivity`, `postSkipWorkspaceMiniActivity` |

## Hooks

| Hook | Uso |
|------|-----|
| `use-workspaces.ts` | Lista workspaces |
| `use-workspace-runs.ts` | Runs por workspace (sidebar) |
| `use-workspace-run-detail.ts` | Detalhe + git-status |
| `use-workspace-run-mutations.ts` | Prepare git, start, resume, retry/skip mini |

## Estado (Zustand)

`mission-shell-store` — campos adicionados:

- `selectedWorkspaceId`, `selectedWorkspaceRunId`
- `expandedWorkspaceIds`
- `setSelectedWorkspace`, `setSelectedWorkspaceRun`, `toggleWorkspaceExpanded`

Seleccionar projeto/run limpa workspace run; seleccionar workspace run limpa projeto/run.

## Componentes

| Componente | Ficheiro |
|------------|----------|
| Sidebar workspaces | `components/features/workspace/WorkspaceSidebarSection.tsx` |
| Painel WorkspaceRun | `components/features/workspace/WorkspaceRunViewShell.tsx` |
| Card Git | `components/features/workspace/WorkspaceGitAggregatedCard.tsx` |
| Card minis | `components/features/workspace/WorkspaceMiniActivitiesCard.tsx` |

## Fora de escopo

- Criação visual de workspace / editor de minis
- PR agregado, merge, SSE workspace_run
- Redesign global

## Testes manuais

1. Runtime online → sidebar mostra workspaces
2. Expandir workspace → WorkspaceRuns
3. Seleccionar run → painel com Git + minis
4. **Preparar Git** → refresh manual / botão Atualizar
5. **Start** / **Resume** (após git ready)
6. **Retry prepare** por projeto com falha
7. **Run filho** → fluxo single-run intacto
8. Seleccionar projeto/run na sidebar → volta ao `RunViewShell`
