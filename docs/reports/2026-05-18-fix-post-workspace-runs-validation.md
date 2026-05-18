# Correção: POST /workspace-runs exigia miniActivityId na criação

**Data:** 2026-05-18

## Problema

`POST /workspace-runs` falhava com `workspace_run_validation_failed` / `miniActivityId é obrigatório` ao criar atividade no Mission Control.

## Causa

1. `validateWorkspaceRunFields` recebia `isCreate: true` em `createWorkspaceRun`, mas **não usava** essa flag — sempre chamava `validateMiniActivitiesList`.
2. O frontend (`use-create-workspace-run`) enviava `miniActivities` por projeto **sem** `miniActivityId`, disparando validação de fase de execução na criação.

## Correção

| Área | Alteração |
|------|-----------|
| `core/validate-workspace-run.js` | Com `isCreate: true`, ignora `miniActivities` e `childRunIds`; aceita `instruction` / `task` / `prompt` como título |
| `frontend/hooks/use-create-workspace-run.ts` | Deixa de enviar `miniActivities` no POST |
| Testes | Cobertura de criação sem id, update com validação, HTTP 201 com payload parcial |

## Fases

- **Criação:** `workspaceId` + título/instrução + `globalSpec` — sem miniActivities/OES/runtime.
- **Estratégia/execução:** miniActivities via `addMiniActivity`, materialização OES ou PATCH com lista completa (exige `miniActivityId`).

## Validação manual

1. Workspace com wiser-bot-front + wiser-bot-api.
2. Nova atividade: «Criar tela de export PDF».
3. Esperado: 201, run em `draft`, sidebar e intake sem erro de `miniActivityId`.

## Testes executados

```bash
node --test core/validate-workspace-run.test.js scripts/daemon/lib/workspace-run-registry.test.js
# 9/9 pass

node --test scripts/daemon/runtime-api.test.js --test-name-pattern "HTTP: CRUD /workspace-runs"
# pass
```
