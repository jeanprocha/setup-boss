# E2E — validação P0 strategy_ready

**Data:** 2026-05-16  
**Escopo:** approve → strategy ready → coerência API/disco/SSE (sem alteração de código P0)

## Fluxo validado

| Passo | Resultado |
|---|---|
| Daemon `GET /health` | OK (porta 3210) |
| Run legado `20260516-163856-...` | OK |
| Novo run: register → intake → answers → refine → approve (HTTP) | OK (`20260516-192512-descricao-longa-...`) |
| Testes unitários P0 | 13/13 pass |

Script: `node scripts/smoke/strategy-ready-p0-e2e-validation.js`

## Observações (sem screenshots — validação automatizada)

### Run legado

| Camada | Antes (pré-restart daemon) | Depois (daemon com P0) |
|---|---|---|
| Disco `phase3.status` | `strategy_runtime_initialized` | (inalterado) |
| API clarification | `strategy_pending` | `ready_for_execution` |
| API strategy `phase3Status` | `strategy_runtime_initialized` | `strategy_ready` |
| API `operationalReadiness` | `ready` | `ready` |

Histórico SSE: 1× `strategy_waiting_user_action` (evento antigo no `events.jsonl`). Nenhum novo evento deste tipo no fluxo novo.

### Novo run (approve HTTP)

| Verificação | Valor |
|---|---|
| Resposta approve `runtimePhase` | `ready_for_execution` |
| Disco `phase3.status` | `strategy_ready` |
| API clarification | `ready_for_execution` |
| API strategy | `phase3Status=strategy_ready`, `operationalReadiness=ready` |
| SSE pós-approve | `strategy_auto_started_after_approval`, `strategy_requested`, `strategy_started`, `strategy_completed`, `clarification_approve` |
| SSE ausente | `strategy_waiting_user_action` |

## Coerência disco / API / SSE

- Artefatos `strategy-readiness.json` + `execution-ready-handoff.json` presentes.
- API alinhada com readiness mesmo com `phase3` legado em disco (run antigo).
- Inline approve emite `strategy_started` + `strategy_completed` (confirmado via `events.jsonl`).

## Validação visual (manual — não executada pelo agente)

Checklist para operador no Mission Control:

- [ ] Após approve: spinner de strategy some em &lt;30s
- [ ] Cartão mostra estratégia disponível (não “A gerar…” eterno)
- [ ] Sem CTA/hint `POST /runs/:runId/strategy`
- [ ] Refresh da página mantém estado correto
- [ ] Reabrir run legado `20260516-163856-...` → sem loading eterno
- [ ] Painel de logs continua acumulando; `strategy_waiting_user_action` não destaca como acção pendente (classificado como noise)

## Regressões encontradas

1. **Daemon sem restart** após deploy do P0: API continuava `strategy_pending` até `daemon stop` + `daemon start`. Não é bug de código — requisito operacional.
2. **createRunFromTask** com `projectId = setup-boss root` falha governance (`PROJECT_ROOT_UNRESOLVED`). Fluxo E2E novo run usa projeto demo git+.IA (padrão P1e).

## Correções aplicadas nesta validação

Nenhuma alteração de código P0. Apenas script de validação `scripts/smoke/strategy-ready-p0-e2e-validation.js`.

## Limitações restantes

- UI não validada pixel-a-pixel nesta execução.
- Stall detection / heartbeat / timeline fora de escopo.
- Run legado mantém `phase3.status` intermediário em disco (leitura corrigida via artifacts).

## Resultado UX esperado

Com daemon reiniciado e P0 ativo: **não deve haver estado falso “strategy em progresso”** após strategy concluída. API e SSE coerentes; frontend deve refletir `strategy_ready` / `ready_for_execution` e `strategyAutoStartInProgress=false` (coberto por testes unitários).

**Resultado automatizado: APROVADO.** Confirmação visual manual pendente (checklist acima).
