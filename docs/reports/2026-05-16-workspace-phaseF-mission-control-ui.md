# Relatório: Workspace Fase F — Mission Control UI

**Data:** 2026-05-16  
**Tipo:** implementação incremental (append-only)

---

## Resumo

UI mínima no Mission Control para listar workspaces e WorkspaceRuns, visualizar Git agregado e miniActivities, e executar ações prepare-git / start / resume / retry / skip via API Fases A–E.

---

## Arquivos criados

| Ficheiro |
|----------|
| `frontend/lib/api/workspace-git-types.ts` |
| `frontend/lib/api/workspace-runtime-api.ts` |
| `frontend/hooks/use-workspaces.ts` |
| `frontend/hooks/use-workspace-runs.ts` |
| `frontend/hooks/use-workspace-run-detail.ts` |
| `frontend/hooks/use-workspace-run-mutations.ts` |
| `frontend/components/features/workspace/WorkspaceSidebarSection.tsx` |
| `frontend/components/features/workspace/WorkspaceRunViewShell.tsx` |
| `frontend/components/features/workspace/WorkspaceGitAggregatedCard.tsx` |
| `frontend/components/features/workspace/WorkspaceMiniActivitiesCard.tsx` |
| `docs/workspace-mission-control-phaseF.md` |
| `docs/reports/2026-05-16-workspace-phaseF-mission-control-ui.md` |

---

## Arquivos alterados

| Ficheiro | Alteração |
|----------|-----------|
| `frontend/lib/api/workspace-run-types.ts` | Campo opcional `git` |
| `frontend/lib/api/query-keys.ts` | Chaves workspace / workspaceRun / git |
| `frontend/stores/mission-shell-store.ts` | Seleção e expansão workspace |
| `frontend/components/regions/AppShell.tsx` | Alterna `WorkspaceRunViewShell` vs `RunViewShell` |
| `frontend/components/regions/ProjectActivitySidebar.tsx` | Secção Workspaces |

---

## Telas / componentes

| Área | Comportamento |
|------|----------------|
| Sidebar Workspaces | Lista `GET /workspaces`, expande, `GET /workspace-runs?workspaceId=` |
| WorkspaceRunViewShell | Header + refresh; cards Git e minis |
| WorkspaceGitAggregatedCard | Estado global, projetos, Prepare / Retry |
| WorkspaceMiniActivitiesCard | Lista ordenada, Start/Resume, Retry/Skip mini, link run filho |

---

## Fluxo de uso

1. Abrir Mission Control com runtime ligado.
2. Na sidebar, expandir um **Workspace** e clicar num **WorkspaceRun**.
3. No painel: rever branch/status Git → **Preparar Git** se necessário.
4. **Start workspace run** (requer git `ready` no backend).
5. Acompanhar minis; **Resume** após HITL; **Retry/Skip** por mini.
6. **Run filho** abre o detalhe da run no projeto (fluxo existente).

---

## Validações executadas

| Verificação | Resultado |
|-------------|-----------|
| `npx tsc --noEmit` (ficheiros workspace) | OK após correção `LoadingState` |
| `npm run build` | Falha pré-existente em `GovernanceStatusCard.tsx` (`projectRoot`) — não introduzida por Fase F |
| Padrão API/hooks | Alinhado com `use-projects` / `use-git-branch-mutation` |
| Fluxo Project → Run | Preservado (`AppShell` só troca vista quando `selectedWorkspaceRunId` setado) |

---

## Limitações

- Sem criação de workspace/run na UI (API existe; menu “Criar workspace” continua desactivado)
- Refresh manual (sem SSE workspace_run)
- Timeline direita oculta quando WorkspaceRun seleccionado
- Erros 422 em prepare-git mostram mensagem genérica do `RuntimeApiError`
- Nomes de projeto na lista Git dependem do catálogo `useProjects()`

---

## Riscos

- Persistência de `selectedWorkspaceRunId` em `localStorage` pode apontar para run apagado (sem reconciliação dedicada)
- Build CI pode falhar por erro de tipos antigo em governance até ser corrigido

---

## Próximos passos recomendados

1. Activar **Criar workspace** no `ProjectsNewMenu` (form mínimo)
2. Reconciliação de seleção stale para `workspaceRunId`
3. Corrigir `GovernanceStatusCard` / `ProjectSummaryDto` para build verde
4. Card Git com polling leve após prepare (opcional)
5. Fase G: PR agregado (fora do escopo actual)
