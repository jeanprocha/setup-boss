# miniActivities — Fase C

**Data:** 2026-05-16  
**Pré-requisitos:** Fase A (`SetupWorkspace`), Fase B (`WorkspaceRun`)  
**Escopo:** schema formal de `miniActivity`, validação, CRUD via API, vínculo preparatório com run index. **Sem** orquestrador nem execução.

## Schema `miniActivity`

| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| `miniActivityId` | string | sim (`ma_<hex>` se omitido no POST) |
| `order` | integer | sim (auto `max+1` no POST se omitido) |
| `title` | string | sim |
| `description` | string \| null | não |
| `targetProjectId` | string | sim, ∈ `workspace.projectIds` |
| `status` | enum | sim (default `pending`) |
| `runId` | string \| null | não |
| `dependsOnMiniActivityIds` | string[] | sim (pode ser `[]`) |
| `createdAt` / `updatedAt` | ISO | sim |

### Status

`pending`, `ready`, `running`, `waiting_user_action`, `failed`, `completed`, `skipped`, `cancelled`

## Validações

| Código | Regra |
|--------|--------|
| `mini_activity_id_duplicate` | id único no WorkspaceRun |
| `mini_activity_order_duplicate` | order único |
| `mini_activity_title_required` | title não vazio |
| `mini_activity_target_project_not_in_workspace` | projectId no workspace |
| `mini_activity_status_invalid` | enum |
| `mini_activity_dependency_not_found` | dependsOn existe |
| `mini_activity_dependency_cycle` | sem ciclo no grafo dependsOn |
| `mini_activity_self_dependency` | não depender de si |

## API

| Método | Rota | Descrição |
|--------|------|-----------|
| PATCH | `/workspace-runs/:id` | Substitui `miniActivities` (bulk) |
| POST | `/workspace-runs/:id/mini-activities` | Adiciona uma |
| PATCH | `/workspace-runs/:id/mini-activities/:miniActivityId` | Atualiza uma |
| DELETE | `/workspace-runs/:id/mini-activities/:miniActivityId` | Remove uma |

Resposta: WorkspaceRun completo atualizado.

## `childRunIds`

Derivado automaticamente na validação: união de `childRunIds` explícitos + `runId` de cada miniActivity (preparação para orquestrador).

## Vínculo com run index (preparatório)

`writeRunIndex` aceita opcionalmente:

- `workspaceRunId` → `workspace_run_id` no JSON do índice
- `miniActivityId` → `mini_activity_id`

**Comportamento actual:** runs existentes inalterados; campos só gravados quando passados explicitamente (futuro intake filho).

Contratos TS: `frontend/lib/api/mini-activity-types.ts`, `RunIndexWorkspaceLinkDto`.

## Limitações

- Sem criação automática de runs filhos
- `runId` não validado contra `.setup-boss/runs/`
- Sem orquestração de status `running` / transições

## Validação local

```bash
npm run smoke:workspace-mini-activities-phaseC
node --test core/validate-mini-activity.test.js scripts/daemon/lib/workspace-run-registry.test.js
node --test --test-name-pattern "CRUD /workspace-runs" scripts/daemon/runtime-api.test.js
```

## Próximo passo (Fase D)

Orquestrador sequencial: criar run filho por miniActivity, atualizar `runId` / `childRunIds`, propagar `workspace_run_id` no `writeRunIndex`.
