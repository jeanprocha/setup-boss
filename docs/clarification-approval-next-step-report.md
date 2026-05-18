# Relatório — próximo passo após aprovação da clarificação

**Data:** 2026-05-15  
**Escopo:** fluxo pós-`clarification/approve` quando `runtimePhase=strategy_pending` ou clarificação aprovada sem strategy consolidada.

## Sintomas observados

- Evento `clarification_approve` com `phase2=ready_for_execution`, `nextPhase=strategy`, `runtimePhase=strategy_pending`.
- Nenhum `strategy_started` / execução automática subsequente.
- UI mostrava “Aprovado” sem acção explícita para continuar.

## Semântica de `strategy_pending`

Em `scripts/daemon/lib/run-clarification.js`, `mapPhase2ToRuntimePhase`:

- Quando `phase2.status === "ready_for_execution"` **e** existe `run-context.phase3` com `status` diferente de `strategy_ready` e `ready_for_execution`, o runtime de clarificação expõe `strategy_pending`.
- Indica que **phase3/strategy não está fechada** (artefactos incompletos ou estado intermédio), mesmo com clarificação aprovada.

## Arquitectura existente

- O daemon **não** enfileira jobs de strategy após approve da clarificação; o smoke `mvp-web-ui-e2e-smoke.js` faz polling GET `/strategy` e, se necessário, invoca `runStrategyRuntimeBase` **directamente** no processo de teste.
- Existia apenas **GET** `/runs/:id/strategy` (read-model). **Não** havia POST público para pedir geração de strategy via Runtime API.

## Alterações implementadas

### Backend

1. **`scripts/daemon/lib/run-strategy-api.js`** — `triggerStrategyRun`  
   - Invoca `runStrategyRuntimeBase` (pipeline real, sem mock).  
   - Logs: `runtime.strategy_start_requested`, `runtime.strategy_started`, `runtime.strategy_completed`, `runtime.strategy_failed`.  
   - Eventos: `strategy_requested`, `strategy_started`, `strategy_completed`, `strategy_failed`.

2. **`scripts/daemon/runtime-api.js`** — **POST** `/runs/:id/strategy`  
   - Corpo JSON opcional: `{ "force": true }`.  
   - Respostas `200` (idempotente / já gerado), `202` quando trabalho efectivo correu.

3. **`scripts/daemon/lib/run-clarification.js`** — Após approve bem-sucedido quando `nextPhase === "strategy"`:  
   - Log `runtime.strategy_pending` se `runtimePhase === "strategy_pending"`.  
   - Evento `strategy_waiting_user_action` com hint para POST `/runs/:runId/strategy`.

### Frontend

1. **`frontend/lib/runtime/strategy/strategy-actions.ts`** — `postStrategyRun` com timeout alargado.  
2. **`frontend/app/api/runtime/[[...segments]]/route.ts`** — POST `/runs/…/strategy` com timeout de 120s no proxy.  
3. **`ClarificationPanel` + `ApprovalFlow`** — Mensagem explícita, estado `strategy_pending` visível, CTA **“Gerar estratégia de execução”** que chama o POST real; texto quando strategy já está disponível.  
4. **`clarification-operational-state.ts`** — `clarificationApprovedAwaitingStrategy`.  
5. **`strategy-readiness.ts`** — `isStrategyGenerationComplete` para não fingir execução: só esconde o CTA quando há bundle strategy suficiente.

### Documentação

Este ficheiro.

## Validação recomendada

1. Responder perguntas, refinamento disponível, **Aprovar**.  
2. Confirmar logs/eventos: `strategy_waiting_user_action`; se aplicável `runtime.strategy_pending`.  
3. Clicar **Gerar estratégia de execução** — esperar `strategy_requested` → `strategy_started` → `strategy_completed`.  
4. Confirmar GET `/runs/:id/strategy` com readiness aceitável antes de **Execute**.

## Limitações conscientes

- **Não** iniciamos executor nem orchestration automaticamente após approve — apenas clarificação + pedido explícito de strategy.  
- **Não** enfileiramos worker novo para strategy — mesmo modelo que o smoke (pedido explícito ao runtime).  
- Regeneração forçada: corpo `{ "force": true }` (exposto pela API; UI MVP não inclui segundo botão).
