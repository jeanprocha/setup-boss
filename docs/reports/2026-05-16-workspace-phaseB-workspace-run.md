# Relatório: Workspace Fase B — WorkspaceRun estático

**Data:** 2026-05-16  
**Tipo:** implementação incremental  
**Pré-requisito:** Fase A (`docs/reports/2026-05-16-workspace-phaseA-implementation.md`)

---

## Resumo

Criada a entidade **WorkspaceRun** como modelo estrutural para atividade global multi-projeto: índice `.setup-boss/workspace-runs/index.json`, validações, registry CRUD e APIs HTTP. Sem orquestração, sem alteração ao pipeline de runs/jobs/Git.

---

## Arquivos criados

| Ficheiro |
|----------|
| `core/validate-workspace-run.js` |
| `core/validate-workspace-run.test.js` |
| `scripts/daemon/lib/workspace-run-registry.js` |
| `scripts/daemon/lib/workspace-run-registry.test.js` |
| `scripts/smoke/workspace-run-phaseB-smoke.js` |
| `frontend/lib/api/workspace-run-types.ts` |
| `docs/workspace-run-phaseB.md` |

---

## Arquivos alterados

| Ficheiro | Alteração |
|----------|-----------|
| `scripts/daemon/lib/daemon-paths.js` | `workspaceRunsDir`, `workspaceRunsIndexPath` |
| `scripts/daemon/runtime-api.js` | CRUD `/workspace-runs`, OPTIONS |
| `scripts/daemon/runtime-api.test.js` | Teste HTTP |
| `package.json` | smoke + testes |

---

## Modelo implementado

- **Persistência:** `workspace-runs/index.json` (`schemaVersion: 1`, array `workspaceRuns`)
- **ID:** `wsrun_<timestamp>-<slug-do-título>` com sufixo aleatório em colisão
- **Defaults no create:** `status: draft`, `miniActivities: []`, `childRunIds: []`
- **Imutável após create:** `workspaceRunId`, `workspaceId` (PATCH não altera workspace)

---

## Decisões tomadas

1. **Índice único** em vez de um JSON por run — suficiente para Fase B; discovery previa também ficheiros por id numa fase posterior.
2. **`globalSpec` / `globalPlan`** aceitam `string` ou `object` para não fechar formato antes da decomposição IA.
3. **`miniActivities`** validado apenas como array; conteúdo dos itens fica para Fase C.
4. **`childRunIds`** como `string[]` sem validar existência em `.setup-boss/runs/` — evita acoplamento prematuro.
5. **Filtro** `GET /workspace-runs?workspaceId=` no mesmo handler de listagem.

---

## Validações executadas

| Comando | Resultado |
|---------|-----------|
| `node --test core/validate-workspace-run.test.js` | 4/4 pass |
| `node --test scripts/daemon/lib/workspace-run-registry.test.js` | 1/1 pass |
| `node --test --test-name-pattern "CRUD /workspace-runs" scripts/daemon/runtime-api.test.js` | 1/1 pass |
| `npm run smoke:workspace-run-phaseB` | OK |

---

## Limitações

- Sem execução, scheduler, Git multi-projeto, UI
- Workspace runs órfãos se workspace for apagado
- Sem campo `workspaceRunId` no run index global ainda
- `miniActivities` sem schema de item

---

## Riscos

| Risco | Mitigação futura |
|-------|------------------|
| Índice cresce sem arquivo por run | Shard para `workspace-runs/<id>.json` se necessário |
| Status `running` setado manualmente sem orquestrador | Gate no orquestrador (Fase D) |
| Colisão rara de `workspaceRunId` | Sufixo hex já aplicado |

---

## Próximos passos

1. **Fase C:** schema `miniActivity` + opcional `workspaceRunId` / `parentWorkspaceRunId` no run index
2. Preenchimento manual ou IA de `miniActivities` (ainda sem execução)
3. **Fase D:** orquestrador sequencial + transições de status
4. UI Mission Control + reconcile delete workspace
