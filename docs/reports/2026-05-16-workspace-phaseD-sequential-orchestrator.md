# Relatório: Workspace Fase D — orquestrador sequencial MVP

**Data:** 2026-05-16  
**Tipo:** implementação incremental

---

## Resumo

Primeiro orquestrador **sequencial** para `WorkspaceRun`: cada miniActivity elegível dispara `createRunFromTask` no projeto alvo, grava vínculo no índice do run filho e propaga estados terminais (`failed`, `waiting_user_action`, `completed`) para a mini e para o WorkspaceRun.

---

## Arquivos criados

| Ficheiro |
|----------|
| `core/workspace-child-run-status.js` |
| `scripts/daemon/lib/workspace-run-orchestrator.js` |
| `scripts/daemon/lib/workspace-run-orchestrator.test.js` |
| `scripts/smoke/workspace-orchestrator-phaseD-smoke.js` |
| `docs/workspace-orchestrator-phaseD.md` |

---

## Arquivos alterados

| Ficheiro | Alteração |
|----------|-----------|
| `scripts/daemon/runtime-api.js` | POST start/resume/retry/skip |
| `package.json` | smoke + testes |

---

## Modelo de execução

1. `start` valida minis, passa WorkspaceRun a `running`, chama `advance`.
2. `advance` faz poll da mini activa (`running` ou `waiting_user_action` com `runId`).
3. Se não há activa, escolhe próxima mini (`pending`/`ready`, deps OK, sem `runId`).
4. Cria run filho, preenche `runId`, patch índice + `run-context`.
5. Para em HITL/erro; `resume`/`retry`/`skip` voltam a chamar `advance`.

---

## Endpoints criados

- `POST /workspace-runs/:workspaceRunId/start`
- `POST /workspace-runs/:workspaceRunId/resume`
- `POST /workspace-runs/:workspaceRunId/retry-mini-activity/:miniActivityId`
- `POST /workspace-runs/:workspaceRunId/skip-mini-activity/:miniActivityId`

---

## Regras de status

| Evento | WorkspaceRun | miniActivity |
|--------|--------------|--------------|
| start | `running` | primeira → `running` + `runId` |
| filho completed | `running` → próxima ou `completed` | `completed` |
| filho waiting | `waiting_user_action` | `waiting_user_action` |
| filho failed | `failed` | `failed` |
| skip | `running` + advance | `skipped` |
| retry | `running` + advance | `ready` (sem `runId`) |

---

## Validações executadas

| Comando | Resultado |
|---------|-----------|
| `node --test scripts/daemon/lib/workspace-run-orchestrator.test.js` | 8/8 pass |
| `npm run smoke:workspace-orchestrator-phaseD` | OK |
| `npm run smoke:workspace-orchestrator-phaseD` | OK |

Cobertura: start + índice, resume sem duplicar run, dependsOn, failed/waiting, completed agregado, skip/retry, bloqueios start.

---

## Limitações

- Sem poll em background (operador chama `resume` após destravar run filho)
- Intake real no create (pesado; testes usam mock)
- Sem Git global / PR multi-projeto
- Sem UI

---

## Riscos

| Risco | Mitigação futura |
|-------|------------------|
| Estado filho desatualizado até `resume` | Job sync periódico |
| `createRunFromTask` falha (KB Git) | WorkspaceRun → `failed` na mini |
| Múltiplos `resume` concorrentes | Lock por workspaceRunId |

---

## Próximos passos

1. Daemon tick: `advanceWorkspaceRunOrchestration` para todos `running`
2. SSE `workspace_run.progress`
3. UI Mission Control Start/Resume
4. Branch global (fase Git multi-projeto)
