# Relatório: Workspace Fase C — miniActivities

**Data:** 2026-05-16  
**Tipo:** implementação incremental  
**Pré-requisitos:** Fases A e B

---

## Resumo

Schema formal de **miniActivity** integrado ao `WorkspaceRun`, com validação completa, CRUD via sub-rotas HTTP, sincronização preparatória de `childRunIds` e campos opcionais no índice global de runs. Runtime de execução, Git e UI inalterados.

---

## Arquivos criados

| Ficheiro |
|----------|
| `core/validate-mini-activity.js` |
| `core/validate-mini-activity.test.js` |
| `frontend/lib/api/mini-activity-types.ts` |
| `scripts/smoke/workspace-mini-activities-phaseC-smoke.js` |
| `docs/workspace-mini-activities-phaseC.md` |

---

## Arquivos alterados

| Ficheiro | Alteração |
|----------|-----------|
| `core/validate-workspace-run.js` | Delega validação de `miniActivities` |
| `scripts/daemon/lib/workspace-run-registry.js` | `add/update/deleteMiniActivity` |
| `scripts/daemon/runtime-api.js` | Sub-rotas mini-activities |
| `scripts/daemon/runtime-api.test.js` | Testes HTTP |
| `scripts/daemon/lib/workspace-run-registry.test.js` | Testes registry |
| `core/run-resolver.js` | `workspace_run_id`, `mini_activity_id` opcionais |
| `core/run-resolver.test.js` | Teste campos opcionais |
| `frontend/lib/api/workspace-run-types.ts` | `MiniActivityDto[]` |
| `package.json` | smoke + testes |

---

## Schema final

```json
{
  "miniActivityId": "ma_a1b2c3d4",
  "order": 0,
  "title": "API endpoints",
  "description": null,
  "targetProjectId": "proj_abc12345",
  "status": "pending",
  "runId": null,
  "dependsOnMiniActivityIds": [],
  "createdAt": "ISO",
  "updatedAt": "ISO"
}
```

---

## Decisões tomadas

1. **Módulo dedicado** `validate-mini-activity.js` para manter `validate-workspace-run` legível.
2. **Sub-rotas REST** para add/patch/delete de uma miniActivity + **PATCH bulk** no WorkspaceRun (consistência com Fase B).
3. **`childRunIds`** derivado de `runId` nas miniActivities + lista explícita (união deduplicada).
4. **Run index** usa snake_case (`workspace_run_id`, `mini_activity_id`) alinhado a `run_id`.
5. **Sem validar** existência de `runId` no índice — evita acoplamento prematuro.

---

## Validações executadas

| Comando | Resultado |
|---------|-----------|
| `node --test core/validate-mini-activity.test.js` | 3/3 pass |
| `node --test scripts/daemon/lib/workspace-run-registry.test.js` | 2/2 pass |
| `node --test core/run-resolver.test.js` | 7/7 pass |
| `node --test --test-name-pattern "CRUD /workspace-runs" scripts/daemon/runtime-api.test.js` | 1/1 pass (incl. mini-activities HTTP) |
| `npm run smoke:workspace-mini-activities-phaseC` | OK |

---

## Limitações

- Sem orquestrador, decomposição IA, execução automática
- Sem UI Mission Control
- `writeRunIndex` não é chamado automaticamente ao definir `runId` na miniActivity
- Remover miniActivity não remove run filho do disco

---

## Riscos

| Risco | Mitigação futura |
|-------|------------------|
| `childRunIds` dessincronizado se run apagado manualmente | Reconcile no orquestrador |
| PATCH bulk substitui array inteiro | UI deve usar sub-rotas ou enviar lista completa |
| DependsOn órfão após DELETE miniActivity | Validação já impede dependsOn a ids inexistentes no save |

---

## Próximos passos

1. **Fase D:** orquestrador sequencial (criar run filho, preencher `runId`, `writeRunIndex` com vínculo)
2. Transições de status do WorkspaceRun agregadas
3. UI: editor de miniActivities + vista agregada
4. Decomposição IA opcional (gerar array inicial)
