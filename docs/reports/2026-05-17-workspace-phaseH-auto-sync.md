# Relatório: Workspace Fase H — workspace_run_sync e auto-advance

**Data:** 2026-05-17  
**Tipo:** implementação incremental (append-only)

---

## Resumo

Job periódico no daemon que monitora WorkspaceRuns `running` / `waiting_user_action`, reconcilia estado, e chama `advanceWorkspaceRunOrchestration` para auto-avanço quando o run filho completa — sem duplicar runs nem ignorar `dependsOn`.

---

## Arquitetura do sync

| Componente | Papel |
|------------|-------|
| `workspace-run-sync.js` | Loop, tick, `syncOneWorkspaceRun` |
| `workspace-run-lock.js` | Exclusão por `workspaceRunId` |
| `workspace-run-reconcile.js` | Normalização pré-advance |
| `workspace-run-orchestrator.js` | Advance sequencial (reutilizado) |
| `setup-bossd.js` | `startWorkspaceRunSyncLoop` no boot |
| `GET /status` | Expõe `workspaceRunSync` para UI |

---

## Arquivos criados

| Ficheiro |
|----------|
| `scripts/daemon/lib/workspace-run-sync.js` |
| `scripts/daemon/lib/workspace-run-sync.test.js` |
| `scripts/smoke/workspace-sync-phaseH-smoke.js` |
| `frontend/hooks/use-workspace-run-sync-status.ts` |
| `docs/workspace-sync-phaseH.md` |
| `docs/reports/2026-05-17-workspace-phaseH-auto-sync.md` |

---

## Arquivos alterados

| Ficheiro | Alteração |
|----------|-----------|
| `scripts/daemon/setup-bossd.js` | Inicia/para sync loop |
| `scripts/daemon/runtime-api.js` | `workspaceRunSync` em GET /status |
| `package.json` | Script smoke + test |
| `frontend/lib/api/workspace-runtime-api.ts` | `fetchWorkspaceRunSyncStatus` |
| `frontend/components/features/workspace/WorkspaceRunViewShell.tsx` | Badge "Auto Sync Active" |

---

## Fluxo operacional

1. Daemon arranca → `startWorkspaceRunSyncLoop({ repoRoot })`
2. A cada `INTERVAL_MS` (default 5s): `runWorkspaceRunSyncTick`
3. Lista WorkspaceRuns com status `running` ou `waiting_user_action`
4. Por run: lock → reconcile → se `running`, `advanceWorkspaceRunOrchestration`
5. Emite eventos conforme resultado (advance, completed, waiting, failed, error)
6. Atualiza `status.json.workspaceRunSync`

---

## Locks / reconcile

- **Lock:** `runWithWorkspaceRunLock` com label `workspace_run_sync`; skip silencioso se `workspace_run_orchestration_busy`
- **Reconcile:** `reconcileWorkspaceRun` antes de advance (sem `repairOrphanRunIds` no hot path)
- **Advance:** orquestrador existente — respeita `dependsOn`, anti-duplicação de `runId`

---

## Validações

| Cenário | Smoke / test |
|---------|----------------|
| Auto-advance quando filho completed | OK |
| `waiting_user_action` não avança | OK |
| `failed` fora do conjunto ativo | OK |
| `dependsOn` entre projetos | OK (test unitário) |
| Lock evita sync concorrente | OK |
| Loop daemon start/stop + status | OK |
| Completed agregado automático | OK |
| Não duplica run filho em tick subsequente | OK |

```bash
npm run smoke:workspace-sync-phaseH
node --test scripts/daemon/lib/workspace-run-sync.test.js
```

---

## Limitações

- HITL (`waiting_user_action`) exige `resume` manual após aprovação humana
- Intervalo fixo — pode ser lento ou ruidoso em muitos WorkspaceRuns
- UI ainda depende de refetch periódico (sem SSE)
- Um único processo daemon por data dir

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Tick durante POST /start concorrente | Lock compartilhado com orquestrador |
| Carga com muitos runs ativos | Cap implícito (itera lista em memória); futuro: cap configurável |
| UI desatualizada entre ticks | Badge + refetch existente; SSE na fase seguinte |

---

## Readiness operacional

**~92%** para uso local multi-projeto com supervisão leve.

- Auto-advance remove dependência de `POST /resume` após cada mini completar
- Ainda não pronto para produção multi-tenant sem observabilidade SSE e limites de escala

---

## Próximos passos

1. Eventos SSE `workspace_run.*` para Mission Control
2. Backoff / cap de runs por tick (`SETUP_BOSS_WORKSPACE_SYNC_CAP`)
3. Auto-resume opcional após HITL (flag explícita, off por defeito)
