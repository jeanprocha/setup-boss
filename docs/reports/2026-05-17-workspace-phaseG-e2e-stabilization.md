# Relatório: Workspace Fase G — E2E multi-projeto e estabilização operacional

**Data:** 2026-05-17  
**Tipo:** implementação incremental (append-only)

---

## Resumo

Smoke E2E local multi-projeto cobrindo Workspace → Git → miniActivities → runs filhos, com locks, reconcile e recovery no boot do daemon. Pequenos hardenings na UI Mission Control.

---

## Cenários validados

| Cenário | Resultado |
|---------|-----------|
| Persistência workspace / workspace run / Git agregado | OK (smoke) |
| `dependsOn` entre minis em projetos diferentes | OK |
| Start + advance sequencial com 2 projetos Git | OK |
| Resume sem duplicar run filho | OK |
| `waiting_user_action` / `failed` param sequência | OK |
| Skip mini + retry mini após falha | OK |
| `childRunIds` e vínculo índice `workspace_run_id` / `mini_activity_id` | OK |
| Branch global propagada nos repositórios | OK |
| Reconcile mini `running` sem `runId` | OK |
| Recovery pós-persistência (simula restart) | OK |
| Run legado Project → Run (sem workspace) | OK |

---

## Arquivos criados

| Ficheiro |
|----------|
| `scripts/daemon/lib/workspace-run-lock.js` |
| `scripts/daemon/lib/workspace-run-reconcile.js` |
| `scripts/daemon/lib/workspace-run-reconcile.test.js` |
| `scripts/smoke/workspace-e2e-phaseG-smoke.js` |
| `docs/workspace-e2e-phaseG.md` |
| `docs/reports/2026-05-17-workspace-phaseG-e2e-stabilization.md` |

---

## Arquivos alterados

| Ficheiro | Alteração |
|----------|-----------|
| `scripts/daemon/lib/workspace-run-orchestrator.js` | Lock + reconcile antes de start/resume/retry/skip |
| `scripts/daemon/setup-bossd.js` | `reconcileWorkspaceRunsOnBoot` no startup |
| `package.json` | Script `smoke:workspace-e2e-phaseG` + test reconcile |
| `frontend/components/features/workspace/WorkspaceRunViewShell.tsx` | Mensagem de erro; fallback Git se git-status falhar |
| `frontend/components/features/workspace/WorkspaceSidebarSection.tsx` | Estado de erro ao listar runs |

---

## Bugs encontrados

1. Mini-atividade podia ficar `running` sem `runId` válido após falhas parciais — status agregado incoerente.
2. `resume`/`start` concorrentes podiam competir sem mutex por `workspaceRunId`.
3. UI não mostrava erro explícito quando `GET /workspace-runs` falhava na sidebar.

---

## Correções aplicadas

- Módulo `workspace-run-reconcile.js`: corrige mini presa, sincroniza `childRunIds`, rederive status agregado.
- Módulo `workspace-run-lock.js`: exclusão por `workspaceRunId` em operações de orquestração.
- Boot do daemon executa reconcile em WorkspaceRuns ativos após rehydration de runs.
- Smoke E2E `workspace-e2e-phaseG-smoke.js` como gate de regressão.
- UI: estados de erro básicos sem redesign.

---

## Limitações restantes

- Sem poll automático em background para WorkspaceRuns `running`.
- Reconcile não recria runs filhos; apenas normaliza estado persistido.
- Lock por PID — não distribuído multi-host.
- Intake real (`createRunFromTask` com LLM) não faz parte do smoke (usa mocks/`skipLlm`).

---

## Riscos restantes

| Risco | Mitigação atual |
|-------|-----------------|
| Filho completo sem `resume` manual | Documentado; próximo passo = job sync |
| Corrida entre daemon worker e API HTTP | Lock por workspaceRunId |
| Git dirty em prepare multi-projeto | Fase E inalterada; smoke usa repos limpos |

---

## Readiness atual

**Multi-projeto MVP operacional local: ~85%**

- Fluxo feliz A→F + estabilização G validado por smoke e testes de reconcile/orchestrator.
- Adequado para uso interno / dogfooding com supervisão humana em HITL.
- Não pronto para produção multi-tenant sem job de sync e observabilidade SSE.

---

## Próximos passos

1. Implementar `workspace_run_sync` no daemon (poll + auto-resume controlado).
2. Eventos `workspace_run.*` para UI (sem redesign).
3. Smoke com `createRunFromTask` real opcional (`SETUP_BOSS_SMOKE_LIVE=1`).
