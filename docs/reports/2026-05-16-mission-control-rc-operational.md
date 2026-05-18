# Mission Control — RC operacional

**Data:** 2026-05-16  
**Tipo:** Release candidate operacional (última passada antes de uso diário local)  
**Fora de escopo:** features novas, redesign, Git flow, multi-worker, arquitectura runtime nova, refactors grandes.

**Histórico append-only:** `mission-control-final-operational-pass.md`, `mission-control-operational-ready.md`, `mission-control-hardening-p1.md`, `mission-control-polish-p1.md`.

---

## Veredicto RC

O Mission Control está **aprovado como RC operacional** para uso diário local no Setup Boss. Responde às 8 perguntas operacionais sem contradição nos cenários validados (API, testes, smoke infra). Pendência principal: **E2E browser** de um run novo completo (LLM/tempo).

---

## Inconsistências corrigidas neste RC

| # | Área | Problema | Correção |
|---|------|----------|----------|
| 1 | Heartbeat badge | `null` durante loading inicial → gap visual no painel técnico | Mostra `Daemon —` / `Worker —` (unknown) em vez de desaparecer |
| 2 | Resync SSE | Throttle só bloqueava se `resyncInFlight` **e** janela < 2s → storms possíveis | `resyncInFlight` primeiro; depois janela mínima sem in-flight duplicado |

### Acumulado (passes anteriores — sem regressão)

- SSE estável por projeto (`selectedRunKeyRef`)
- Cleanup `resetRuntimeEventBus()` no ciclo SSE
- `refetchRunReadModels` + re-clique na sidebar
- `deriveRunOperationalCoherence` (SSOT UI)
- Dedupe 3 camadas (bus SSE, live store, merge)
- `liveEmpty` → resync no connect
- Connection + selection recovery

### Ficheiros alterados (este RC)

| Ficheiro | Alteração |
|----------|-----------|
| `frontend/components/features/observability/RuntimeOperationalHeartbeatBadge.tsx` | Loading → badges unknown |
| `frontend/lib/runtime/orchestration/runtime-resync.ts` | Throttle resync corrigido |

---

## Cenários validados

### 1. Fluxo completo (novo run)

| Fase | Validação RC | Resultado |
|------|--------------|-----------|
| intake → completion | Testes auto-start, coerência, stall, timeline | **Coberto por testes** |
| Browser E2E novo run | Não executado (LLM) | **Pendente operador** |

Garantias por teste/código: sem pending falso em `strategy_ready`; sem processing em terminal; worker mismatch suprime execução activa; stall suprimido após completion.

### 2. Refresh / reopen (todas as fases)

| Mecanismo | Comportamento |
|-----------|---------------|
| F5 / refresh | `liveEmpty` → `resyncRuntimeAfterReconnect`; poll→live; dedupe |
| Troca de run | `useRunSelectionResync` |
| Re-clique mesmo run | `refetchRunReadModels` |
| Reopen | Refetch + merge timeline/logs |

*Refresh manual fase-a-fase no browser:* não repetido; desenho validado em passes anteriores + RC código.

### 3. Recovery daemon (smoke RC executado)

| Passo | Resultado |
|-------|-----------|
| Online baseline | `daemonAlive=true`, `workerState=idle` |
| Stop daemon | API directa down |
| Proxy MC | **502** |
| `daemon start` (CLI) | Recovery ~4s |
| Pós-recovery | `daemonAlive=true`; run legado inalterado |

### 4. Long running / stall

| Cenário | Resultado |
|---------|-----------|
| warning → stalled → critical | 12 testes stall — OK |
| Recovery após evento | Teste “repõe normal” — OK |
| Worker busy noutro run | Supressão — OK |
| Worker idle | Sem stalled falso — OK |
| Pós completion / strategy_ready | `shouldSuppressStallVisual` — OK |

### 5. Run legado `20260516-163856-…`

| Campo | API RC |
|-------|--------|
| strategy | `strategy_ready`, `operationalReadiness=ready` |
| clarification | `ready_for_execution`, `pendingBlockingCount=0` |
| execution | `execution_pending` |
| worker | idle, `currentRunId=null` |
| timeline persistida | 0 `recentEvents` — UI mínima (limitação conhecida) |

### 6. Timeline / logs

| Verificação | Testes | RC |
|-------------|--------|-----|
| ordering | timeline | OK |
| dedupe | dedupe-runtime-events + timeline | OK |
| noise | timeline + normalize | OK |
| truncation | normalize | OK |
| errors visíveis | normalize | OK |
| cap memória | live MAX_LIVE=300 | OK |
| reconnect sem duplicar | bus `seenKeys` + dedupe merge | OK |

### 7. Critérios operacionais (sem contradição)

| Pergunta | Fonte | RC |
|----------|-------|-----|
| Run a executar? | `showExecutionProcessing` + heartbeat | OK |
| Travou? | `deriveRuntimeStallVisual` | OK |
| Daemon morreu? | reachable + `daemonAlive` + badge | OK (smoke 502) |
| Worker ocupado? | `workerState` / `currentRunId` | OK |
| Último progresso? | timeline `lastProgressLabel` | OK* |
| Run terminou? | `isRunTerminal` | OK |
| Acção humana? | clarification / retry / review | OK |

\*Legado sem eventos persistidos.

**Coerência cross-surface:** cards (coherence), timeline (derive), heartbeat (context), logs (normalize), `runtimePhase` / `operationalReadiness` alinhados via adapters + SSOT.

---

## Smoke manual RC (esta sessão)

| Smoke | Resultado |
|-------|-----------|
| API legado (4 endpoints) | OK |
| Proxy heartbeat | `daemonAlive=true` |
| Frontend :3000 | Disponível |
| Daemon stop → proxy 502 | OK |
| Daemon restart → recovery | OK (~4s) |
| Testes automatizados | 55 pass / 0 fail |
| Browser novo run E2E | Não executado |

---

## Comportamento reconnect / recovery

| Evento | Comportamento |
|--------|----------------|
| SSE connect (buffer vazio) | Resync read models + heartbeat |
| SSE reconnect | Throttle 2s; `seenKeys` anti-dup |
| SSE cleanup / troca projeto | Limpa bus + live store |
| Troca de run | **Sem** reconnect SSE |
| Daemon offline | Poll off; badge offline; proxy 502 |
| Daemon online | Invalidate + refetch run activo |
| Loading heartbeat | Badges `Daemon —` / `Worker —` (não null) |

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
  lib/runtime/observability/runtime-logs-scroll.test.ts \
  lib/runtime/polling/mission-polling-policy.test.ts \
  lib/runtime/strategy/strategy-auto-start-policy.test.ts

cd ..
node --test scripts/daemon/lib/runtime-heartbeat.test.js
```

**55 testes — 0 falhas.**

---

## Checklist operacional final

### RC aprovado — uso diário local

- [x] SSOT coerência run/UI
- [x] Dedupe SSE + poll + audit
- [x] SSE estável; cleanup live store
- [x] Refresh/reopen/resync
- [x] Daemon offline/online (smoke)
- [x] Stall long-running + supressões
- [x] Run legado strategy_ready
- [x] Heartbeat badge sem gap loading
- [x] Resync throttle anti-storm
- [x] 55 testes verdes

### Fora do RC (não bloqueia uso local)

- [ ] E2E browser novo run intake→completion
- [ ] Refresh manual em cada fase (browser)
- [ ] Timeline rica em runs legados sem eventos
- [ ] Latência heartbeat ~12s
- [ ] Git / multi-worker / distributed

---

## Limitações restantes

1. **Timeline vazia** em runs sem eventos persistidos no runtime.  
2. **E2E browser** do happy path completo — uma corrida manual recomendada antes de “produção hard”.  
3. **Latência** heartbeat poll ~12s após restart.  
4. **Stores in-memory** voláteis no F5 (mitigado por poll + refetch).  
5. Badge heartbeat no painel técnico (sem mudança de layout).

---

## Avaliação de estabilidade — uso diário local

| Dimensão | Nota | RC |
|----------|------|-----|
| Coerência 8 perguntas | **Bom** | SSOT + testes |
| Recovery infra | **Bom** | Smoke stop/restart |
| Refresh/reopen | **Bom** | Código; browser por fase pendente |
| Timeline/logs | **Aceitável** | Robusto em testes; legado esparso |
| Happy path novo run | **Aceitável** | Testes por fase; E2E pendente |
| **RC operacional** | **Aprovado** | Utilizável diariamente no Setup Boss local |

---

## Conclusão

O Mission Control atinge o critério de **release candidate operacional**: hardening final aplicado (badge loading + resync throttle), regressão completa verde, smoke daemon validado, run legado coerente na API. Pode ser usado no dia-a-dia local com as limitações documentadas; recomenda-se **uma corrida manual** de run novo (Timeline + Logs abertos) como confirmação final opcional.
