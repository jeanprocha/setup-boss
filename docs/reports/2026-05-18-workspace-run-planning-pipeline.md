# WorkspaceRun: pipeline de planeamento alinhado ao Run normal

**Data:** 2026-05-18

## Problema

Após criar `WorkspaceRun`, o painel mostrava Git agregado, mini-atividades e **Start workspace run** imediatamente. O backend respondia `workspace_run_no_mini_activities` porque ainda não havia intake, clarificação, plano, OES nem materialização.

## Solução

### Fase de planeamento (sem mini-atividades)

1. `POST /workspace-runs` cria o registo multi-projeto (`globalSpec`).
2. `POST /runs` no **primeiro projeto** do workspace cria a corrida de planeamento (intake → aprovação).
3. `globalSpec` guarda `planningRunId` + `planningProjectId`.
4. Shell selecciona **ambos**: `selectedWorkspaceRunId` + `selectedRunId` → painel central = **`RunViewShell`** (mesma timeline e fases do Run normal).
5. Git agregado, Start e lista de minis **ocultos** no `WorkspaceRunViewShell`.

### Fase operacional (com mini-atividades materializadas)

1. `useWorkspacePlanningPhaseSync` detecta `miniActivities.length > 0`.
2. `activateWorkspaceRunSelection` limpa `selectedRunId` → painel = **`WorkspaceRunViewShell`** operacional.
3. Start / Resume só aparecem se `miniActivities.length > 0`.

## Ficheiros

| Ficheiro | Alteração |
|----------|-----------|
| `frontend/lib/workspace/workspace-run-lifecycle.ts` | Fases planning vs operacional |
| `frontend/lib/workspace/workspace-global-spec.ts` | `planningRunId`, `planningProjectId` |
| `frontend/hooks/use-create-workspace-run.ts` | Cria run de planeamento + patch globalSpec |
| `frontend/stores/mission-shell-store.ts` | `activateWorkspaceRunSelection`, commit com planning |
| `frontend/components/features/workspace/WorkspaceSidebarSection.tsx` | Seleção por fase |
| `frontend/components/features/workspace/WorkspaceRunViewShell.tsx` | Gating Git/minis |
| `frontend/components/features/workspace/WorkspaceMiniActivitiesCard.tsx` | Start só com minis |
| `frontend/hooks/use-workspace-planning-phase-sync.ts` | Transição automática pós-materialização |

## Fluxo esperado

Workspace → nova atividade → intake → clarificação → plano → aprovação → estratégia/OES → minis → Start → execução.

## Testes

```bash
node --test frontend/lib/workspace/workspace-run-lifecycle.test.ts
```
