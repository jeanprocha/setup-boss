# WorkspaceRun — Fases C + D (OES multi-projeto + materialização automática)

**Data:** 2026-05-18  
**Escopo:** transformar planejamento multi-projeto em fluxo operacional real após aprovação do plano.

## Problema

- OES era semanticamente single-project.
- Não existia ponte automática: plano aprovado → OES multi-repo → `miniActivities` no WorkspaceRun.
- Materialização dependia de PATCH manual, smokes ou APIs auxiliares.

## Solução

### Fase C — OES multi-projeto

| Módulo | Função |
|--------|--------|
| `core/workspace-strategy-context.js` | Catálogo de repositórios a partir de `globalSpec.projectIds` |
| `core/infer-mini-task-project.js` | Inferência de `projectId` por texto/ficheiros |
| `core/decompose-task-multi-project.js` | Decomposição do plano em subtasks por repo + dependências cross-repo |
| `core/build-operational-executable-strategy.js` | MiniTasks com `projectId`, `repositoryName`, `repositorySlug`, `integrationPoints`, `integrationFlow`, `multiRepo` |
| `core/load-workspace-strategy-context-from-run.js` | Lê ligação workspace em `run-context.json` |

`run-strategy-runtime.js` usa decomposição multi-repo quando `run-context.workspace` existe e há ≥2 projetos no catálogo.

### Fase D — Materialização automática

| Módulo | Função |
|--------|--------|
| `core/materialize-workspace-mini-activities-from-oes.js` | OES → `miniActivities` (com `dependsOnMiniActivityIds`) |
| `core/sync-workspace-after-planning-strategy.js` | Pós-estratégia: persiste minis no WorkspaceRun + `globalSpec.phase=materialized` |
| `core/patch-run-context-workspace-link.js` | Grava `workspace` em `run-context.json` no intake |

**Wiring:**

- `run-intake-api.js` — metadata `workspaceRunId` / `workspaceId` → patch context + índice de run.
- `run-strategy-api.js` — após strategy OK → `syncWorkspaceAfterPlanningStrategy`.
- `clarification-runtime.js` — mesmo sync na via inline de approve.
- `use-create-workspace-run.ts` — envia `workspaceRunId` no metadata do POST `/runs`.

### UI

- `WorkspaceMiniActivitiesCard` — agrupa por projeto, dependências como «etapa N», mensagem enquanto não materializado.
- `useWorkspacePlanningPhaseSync` — transição planning → operacional quando surgem minis.

## Fluxo esperado

```
Workspace → intake (planning run) → clarificação → plano → aprovação
  → strategy (OES multi-repo) → sync workspace minis → Git agregado + Start
```

## Testes

`core/workspace-oes-phase-cd.test.js`:

- inferência api/front
- decomposição multi-repo com `projectId` e dependências
- OES `multiRepo` + `integrationFlow`
- materialização de dependências entre miniActivities
- patch de `run-context.workspace`

## Compatibilidade

- Run normal: decomposição single-project inalterada.
- Workspace single-project: `multiRepo: false`, degrada para fluxo existente.
- Materialização single-run (`materialize-execution-runtime-from-oes`) não alterada.

## Validação manual sugerida

Workspace: `wiser-bot-front` + `wiser-bot-api`  
Task: «Criar exportação PDF dashboard»

Após aprovação: miniTasks por repo, dependência integração→API, minis no WorkspaceRun, Start e Git agregado disponíveis.
