# Workspace — Fase A (modelo estrutural)

**Data:** 2026-05-16  
**Escopo:** fundação de `SetupWorkspace` — persistência, validação e API CRUD. **Sem** runtime multi-projeto, WorkspaceRun, UI ou orquestração.

## Vocabulário

| Termo | Significado |
|-------|-------------|
| **SetupWorkspace** | Agrupamento lógico de vários `projectId` registados em `projects.json` |
| **Managed Workspace** | Conceito distinto (lifecycle Git em disco) — ver `docs/discovery-managed-workspaces-architecture.md` |
| **MainWorkspaceView** | Vista interna do Mission Control (`mission-shell-store`) — não é SetupWorkspace |

## Arquitetura

```
.setup-boss/workspaces.json     ← índice único (schemaVersion: 1)
        ↑
workspace-registry.js          ← CRUD + atomic write
        ↑
validate-workspace.js          ← regras de integridade
        ↑
runtime-api.js                 ← GET/POST/PATCH/DELETE /workspaces
```

O runtime de runs, fila, Git e executor **não** consulta workspaces nesta fase.

## Storage

- **Ficheiro:** `.setup-boss/workspaces.json` (ou `SETUP_BOSS_DATA_DIR/workspaces.json`)
- **Schema:** `schemaVersion: 1`, array `workspaces[]`
- **Escrita:** atómica (tmp + rename), mesmo padrão de `projects.json`

## Modelo

| Campo | Tipo | Obrigatório | Notas |
|-------|------|-------------|-------|
| `workspaceId` | string | sim | `ws_<8 hex>` gerado no create |
| `name` | string | sim | trim, não vazio |
| `description` | string \| null | não | opcional |
| `projectIds` | string[] | sim | ≥1 id existente em `projects.json` |
| `primaryProjectId` | string \| null | não | deve ∈ `projectIds` |
| `createdAt` | ISO | sim | set no create |
| `updatedAt` | ISO | sim | atualizado em PATCH |

## Validações

| Código | Regra |
|--------|--------|
| `workspace_name_required` | `name` vazio |
| `workspace_empty` | `projectIds` vazio |
| `workspace_duplicate_projects` | mesmo `projectId` repetido no array |
| `project_not_found` | id não existe no registry |
| `primary_project_not_in_workspace` | `primaryProjectId` ∉ `projectIds` |

## API (daemon, 127.0.0.1)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/workspaces` | Lista todos |
| POST | `/workspaces` | Cria (201) |
| GET | `/workspaces/:workspaceId` | Detalhe |
| PATCH | `/workspaces/:workspaceId` | Atualiza campos |
| DELETE | `/workspaces/:workspaceId` | Remove |

Erros de validação: HTTP 400, `error: workspace_validation_failed`, corpo `validation[]`.

## Mission Control

- Contrato TypeScript mínimo: `frontend/lib/api/workspace-types.ts`
- **Sem** alteração a `mission-shell-store`, sidebar ou fluxo Project → Run
- Seleção futura: `selectedWorkspaceId` (não implementado)

## Compatibilidade

- Projetos isolados e runs existentes inalterados
- Nenhuma migração obrigatória; ficheiro ausente ⇒ lista vazia
- APIs `/projects` e pipeline de execução intactos

## Limitações atuais

- Sem WorkspaceRun, mini-activities, DAG ou scheduler
- Sem Git multi-projeto nem branch global
- Sem impedir o mesmo projeto em dois workspaces (política futura)
- Sem UI nem CLI dedicada (só HTTP + testes/smoke)

## Próximos passos (Fase B+)

1. **Fase B:** `WorkspaceRun` + índice `.setup-boss/workspace-runs/`
2. Ligação runs filhos (`parentWorkspaceRunId`)
3. Orquestrador sequencial na fila
4. UI Mission Control: lista workspaces → workspace run
5. Política Git agregada (`gitPolicy`, `activityBranch` global)

## Validação local

```bash
node --test core/validate-workspace.test.js scripts/daemon/lib/workspace-registry.test.js
node --test scripts/daemon/runtime-api.test.js --test-name-pattern "CRUD /workspaces"
npm run smoke:workspace-phaseA
```
