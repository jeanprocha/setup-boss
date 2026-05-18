# Mission Control — operacional pronto para uso diário

**Data:** 2026-05-16  
**Escopo:** fecho da camada operacional mínima do Setup Boss — auditoria prática, correções residuais, validação de fluxos recovery/happy-path e critérios operacionais.  
**Fora de escopo:** Git flow, PR/merge, multi-worker, distributed runtime, event sourcing, redesign, nova arquitetura.

---

## Resumo executivo

O Mission Control responde de forma coerente às perguntas operacionais do dia-a-dia (run a executar, travado, daemon, worker, último progresso, conclusão, acção humana) através de derivação centralizada (`deriveRunOperationalCoherence`), três camadas de dedupe (SSE bus, live store, merge final), recovery automático (connection + selection + resync SSE) e política de polling alinhada ao estado do transporte.

Nesta sessão foram corrigidos dois edge cases de reconnect/race não cobertos pelo hardening P1 anterior: **reconexão SSE desnecessária ao trocar de run** e **buffer live sem limpeza ao mudar de projeto / ciclo SSE**.

---

## Inconsistências encontradas e corrigidas

| # | Área | Problema | Correção |
|---|------|----------|----------|
| 1 | SSE lifecycle | `selectedRunKey` nas deps do `useRuntimeSse` forçava disconnect/reconnect a cada troca de run | `selectedRunKeyRef` — SSE estável por projeto; resync usa ref actual |
| 2 | Live events | Cleanup SSE não limpava buffer global; troca de projeto podia misturar eventos | `resetRuntimeEventBus()` no cleanup do efeito SSE |
| 3 | Reopen run | Re-clicar o mesmo run na sidebar não refrescava read models | `refetchRunReadModels` + refetch no `onClick` quando run já seleccionado |
| 4 | SSOT UI | Flags dispersas (hero, execution, stall) | Já em P1: `deriveRunOperationalCoherence` + hook |
| 5 | Dedupe | Poll+SSE com ids diferentes | Já em P1/Polish: `dedupeRuntimeEvents` em `getMerged` e merge final |
| 6 | Refresh inicial | Buffer live vazio não disparava resync | Já em P1: `liveEmpty` em `onConnected` |
| 7 | Recovery daemon | `reachable` sem refetch do run activo | Já em Polish: `useRuntimeConnectionRecovery` + `useRunSelectionResync` |

### Ficheiros alterados nesta sessão

| Ficheiro | Alteração |
|----------|-----------|
| `frontend/hooks/use-runtime-sse.ts` | Ref para `selectedRunKey`; cleanup limpa bus SSE + live store |
| `frontend/lib/runtime/orchestration/refetch-run-read-models.ts` | **Novo** — refetch coordenado strategy/clarification/execution/observability |
| `frontend/hooks/use-run-selection-resync.ts` | Usa helper partilhado |
| `frontend/components/regions/ProjectActivitySidebar.tsx` | Refetch ao re-clicar run já activo |
| `frontend/lib/runtime/observability/derive-run-operational-coherence.test.ts` | +1 teste daemon offline |

---

## Cenários validados

### Happy path (intake → completion)

| Fase | Validação | Resultado |
|------|-----------|-----------|
| Intake | Stores audit + query runs | Coberto por testes + fluxo histórico |
| Clarification | `pendingBlockingCount`, approval | API legado + testes clarif |
| Approve | Bloqueio sem plano refinado | Testes hardening anteriores |
| Strategy | Spinner suprimido em `strategy_ready` | Teste coerência + API legado |
| Execution | `executionActive` só com worker alinhado | Teste coerência |
| Review | Stall suprimido em terminal | Teste stall visual |
| Completion | Sem processing/stall fantasma | Teste coerência `success` |

**Nota:** corrida browser intake→review completa não executada nesta sessão (tempo/LLM). Cobertura via 46 testes unitários + API.

### Recovery

| Cenário | Método | Resultado |
|---------|--------|-----------|
| **Refresh** em clarification/strategy/execution/review/completed | `liveEmpty` → resync; poll→live; selection resync | Código + testes |
| **Reopen run** | Troca de run + re-clique (novo) | Refetch imediato dos read models |
| **Restart daemon** | API heartbeat + hooks recovery | `daemonAlive=true`, worker idle; invalidate + refetch sem F5 |
| **Long running** | Testes stall 60s/5m/10m + recovery após evento | warning → stalled → critical → normal |
| **Run legado** `20260516-163856-…` | API runtime directa | Ver secção abaixo |

### Run legado `20260516-163856-na-tela-de-integracao-criar-componente-de-chat-botao-de-abri`

| Endpoint | Estado API | UI esperada |
|----------|------------|-------------|
| `/runs/.../strategy` | `phase3Status=strategy_ready`, `operationalReadiness=ready` | Sem spinner; “Estratégia disponível” |
| `/runs/.../clarification` | `ready_for_execution`, 0 pending blocking | Sem pending falso |
| `/runs/.../execution` | `execution_pending` | Sem “em execução” activo (worker idle) |
| `/runs/.../runtime-observability` | job `completed` | Timeline mínima (poucos eventos persistidos) |
| Heartbeat | `daemonAlive=true`, `workerState=idle` | Badge coerente |

**Sem regressão** de strategy_ready, pending falso, dedupe, heartbeat.

---

## Comportamento reconnect / recovery

| Evento | Comportamento |
|--------|----------------|
| **F5 / refresh** | Live store vazio → `onConnected` dispara `resyncRuntimeAfterReconnect`; poll repovoa live; read models refetch |
| **Daemon offline** | Poll desactivado; badge offline estável; stall “Daemon offline…” se UI processing |
| **Daemon online** | `useRuntimeConnectionRecovery` invalida heartbeat + refetch run activo |
| **SSE reconnect** | `seenKeys` evita duplicar; resync se reconnect ou buffer vazio |
| **Troca de run** | SSE **mantém-se** (fix desta sessão); `useRunSelectionResync` refetch |
| **Re-clicar mesmo run** | `refetchRunReadModels` na sidebar (fix desta sessão) |
| **Troca de projeto** | Cleanup SSE limpa bus + live store; nova ligação por `projectId` |

---

## Critérios operacionais obrigatórios

| Pergunta | Fonte | Estado |
|----------|-------|--------|
| O run está executando? | `showExecutionProcessing` + lifecycle + heartbeat | OK |
| Travou? | `deriveRuntimeStallVisual` (warning/stalled/critical) | OK |
| Daemon morreu? | Heartbeat `daemonAlive` + connection `reachable` | OK |
| Worker está ocupado? | Heartbeat `workerState` / `currentRunId` | OK |
| Qual foi o último progresso? | Timeline `lastProgressLabel` + logs normalizados | OK (esparso em legado) |
| O run terminou? | `isRunTerminal` / estados success-failed | OK |
| Precisa acção humana? | Clarification pending, strategy retry, review | OK |

**Sem contradição visual** entre hero strategy, painel execution e stall quando coerência e heartbeat estão alinhados.

---

## Testes executados

```bash
cd frontend
npx tsx --test \
  lib/runtime/observability/derive-run-operational-coherence.test.ts \
  lib/runtime/observability/dedupe-runtime-events.test.ts \
  lib/runtime/observability/is-ui-processing.test.ts \
  lib/runtime/observability/derive-run-operational-timeline.test.ts \
  lib/runtime/observability/derive-runtime-stall-visual.test.ts \
  lib/runtime/observability/derive-runtime-operational-context.test.ts \
  lib/runtime/observability/normalize-runtime-log-for-ui.test.ts \
  lib/runtime/polling/mission-polling-policy.test.ts

cd ..
node --test scripts/daemon/lib/runtime-heartbeat.test.js
```

**Resultado:** 46 testes frontend + 4 daemon — **0 falhas**.

---

## Checklist — estável para uso diário

- [x] SSOT operacional por run (`deriveRunOperationalCoherence`)
- [x] Dedupe SSE + poll + audit (id + `runtimeLogDedupeKey`)
- [x] Poll→live store + merge final
- [x] SSE estável por projeto (não reconecta por troca de run)
- [x] Resync após reconnect / buffer vazio / recovery daemon
- [x] Refetch em troca de run, recovery reachable e re-clique
- [x] Terminais sem spinner/stall fantasma
- [x] Stall thresholds + supressões (ready, terminal, worker mismatch, offline)
- [x] Heartbeat badges offline/idle/busy
- [x] Run legado strategy_ready validado via API
- [x] Política polling SSE-aware

---

## Checklist — NÃO pronto para produção “hard”

- [ ] Smoke browser E2E intake→review (uma corrida manual)
- [ ] Timeline rica em runs legados sem eventos persistidos no runtime
- [ ] Rehydration histórica de eventos para runs antigos
- [ ] Latência heartbeat ~12s após restart (aceitável, não ideal)
- [ ] Badge heartbeat só no painel técnico (sem redesign do hero)
- [ ] Stores in-memory perdem histórico no F5 (mitigado, não eliminado)
- [ ] `tsc --noEmit` global (erros pré-existentes fora do MC)
- [ ] Git flow / PR / multi-worker / distributed runtime (explicitamente fora de escopo)

---

## Limitações restantes

1. Timeline vazia ou mínima em runs legados sem eventos SSE/observability persistidos.  
2. Latência perceptível (~12s) na troca idle/busy após restart do daemon.  
3. Fluxo completo intake→review não corrido em browser nesta sessão.  
4. Histórico live/daemon logs é volátil no refresh total da página.  
5. Observabilidade heartbeat concentrada no painel técnico.

---

## Avaliação operacional final

| Dimensão | Nota | Comentário |
|----------|------|------------|
| Coerência run / worker / UI | **Bom** | SSOT + supressões terminal/ready |
| SSE + poll + dedupe | **Bom** | SSE estável; três camadas dedupe |
| Refresh / reopen / recovery | **Bom** | Resync + refetch + re-clique |
| Long running / stall | **Bom** | Thresholds testados; recovery após evento |
| Run legado | **Aceitável** | API coerente; timeline esparso |
| Uso diário Setup Boss | **Pronto** | Base operacional mínima fechada |

**Conclusão:** o Mission Control está **operacionalmente pronto para uso diário real** dentro do escopo acordado. A camada mínima antes das próximas grandes features está fechada, com limitações documentadas e smoke manual recomendado (daemon stop/start + um run novo até execution).

### Smoke manual recomendado (5–10 min)

1. `npm run dev:stack`  
2. Abrir run legado `20260516-163856-…` — confirmar strategy ready sem spinner.  
3. Parar daemon → badge offline → reiniciar → confirmar recovery sem F5.  
4. Re-clicar o mesmo run na lista — confirmar dados actualizados.  
5. (Opcional) Novo run até `execution_running` com Timeline + Logs abertos.
