# Fix — crash `parse-refined-plan` e loop HTTP 409 em read-models

**Data:** 2026-05-17  
**Tipo:** append-only (correção cirúrgica pós-fix de execução)  
**Escopo:** parsing defensivo do plano refinado + tratamento operacional de 409 em `GET /runs/:id/*`

---

## Resumo executivo

Dois problemas pós-fix:

1. **Crash UI:** `Cannot read properties of undefined (reading 'length')` em `parse-refined-plan.ts` ao aceder `refinement.scopeChanges.length` quando o DTO vinha parcial (fallback/determinístico) ou quando `build-operational-review-document.ts` passava uma **string** em vez do DTO.
2. **Loop 409:** `GET /api/runtime/runs/:id/clarification|execution|strategy|evidence` com HTTP **409** (`run_id_missing`) — job na fila sem `runId` resolvido; o React Query repetia fetch/retry/polling sem feedback.

**Correção:** normalização defensiva de arrays no parser + fallback `unsupported` com mensagem clara nos fetchers + paragem de polling/retry em conflito terminal.

---

## Causa raiz

### Crash do plano refinado

| Origem | Problema |
|--------|----------|
| `parse-refined-plan.ts` | `scopeChanges`, `acceptanceCriteria`, `risks` assumidos sempre definidos |
| `build-operational-review-document.ts` | Chamava `parseRefinedPlanPresentation(refinedMarkdown)` — 1.º arg era `string`, não `RefinementPreviewDto` |

O adapter `mapApiClarificationBundle` já normalizava arrays; o parser e o documento de review **não**.

### HTTP 409 em loop

Backend (`scripts/daemon/runtime-api.js`, `resolveRunIdForEvidence`):

- Se o identificador é um **job id** sem `runId` → `409` + `run_id_missing`
- Se é run id válido com output → `200`

O frontend (`fetchClarificationBundle`, `fetchExecutionBundle`, `fetchStrategyBundle`):

- Só tratava **404**; **409** propagava erro → retry React Query + `refetchInterval` em `useExecution` + polling manual 4s em `PlanningOperationalPlanPanel` → spam na consola.

---

## Alterações

| Ficheiro | Mudança |
|----------|---------|
| `frontend/lib/runtime/clarification/parse-refined-plan.ts` | `normalizeRefinementPreview`, arrays com fallback `[]` |
| `frontend/lib/runtime/clarification/parse-refined-plan.test.ts` | Testes de regressão (3 casos) |
| `frontend/lib/runtime/run-read-model-http.ts` | **Novo** — detecção/mensagem de conflito 409 |
| `frontend/lib/runtime/clarification/clarification-actions.ts` | 409 → bundle `unsupported` com razão operacional |
| `frontend/lib/runtime/execution/execution-actions.ts` | 409 → `buildUnsupportedExecutionBundle` |
| `frontend/lib/runtime/execution/execution-adapters.ts` | `buildUnsupportedExecutionBundle` |
| `frontend/lib/runtime/strategy/strategy-actions.ts` | 409 → `buildUnsupportedStrategyBundle` |
| `frontend/lib/runtime/operational/build-operational-review-document.ts` | Passa DTO normalizado + markdown |
| `frontend/hooks/use-execution.ts` | Sem retry/polling em conflito |
| `frontend/hooks/use-clarification.ts` | Sem retry em 409 |
| `frontend/hooks/use-strategy.ts` | Sem retry em 409 |
| `frontend/lib/api/runtime-api.ts` | `fetchRunEvidence` ignora 409 (evita loop) |
| `frontend/components/features/clarification/ClarificationPanel.tsx` | Mostra `unsupportedReason` |
| `frontend/components/features/planning/PlanningOperationalPlanPanel.tsx` | Para poll 4s em conflito; mensagem clara |

**Fora de escopo (inalterado):** aprovação, versionamento Git, worker, DAG, fluxo de execução no daemon.

---

## Comportamento esperado após fix

| Cenário | Antes | Depois |
|---------|-------|--------|
| Plano refinado sem `scopeChanges` | Crash | UI renderiza com listas vazias |
| Review operacional com DTO parcial | Crash | Documento de review seguro |
| Job id sem `runId` na API | 409 em loop silencioso | Uma resposta `unsupported` + mensagem «job ainda não tem runId…» |
| Execução com orquestração activa + 409 | Poll 12–28s infinito com erro | Poll desliga; bundle `unsupported` estável |

Prefixo interno em `unsupportedReason`: `[read-model-conflito]` — removido na UI ao apresentar.

---

## Critérios de aceite

- [x] Tela não quebra com plano refinado incompleto
- [x] Arrays opcionais com fallback `[]`
- [x] 409 não fica em loop agressivo (fetchers + hooks + painel de plano)
- [x] Conflito real mostra mensagem operacional clara
- [x] Nenhum mock novo criado
- [x] Testes `parse-refined-plan.test.ts` passam

---

## Verificação manual sugerida

1. Abrir corrida em fase de aprovação/plano com refinement fallback (sem arrays no JSON).
2. Confirmar que `RefinedPlanReview` / painel operacional não rebentam.
3. Na consola de rede: não deve haver rajada contínua de 409 no mesmo endpoint.
4. Se seleccionar job sem `runId`: ver mensagem sobre intake/run id, não crash.

---

## Notas

- O 409 **é esperado** quando a UI usa um identificador de job antes do `runId` existir; a correção não altera o daemon — apenas torna o cliente resiliente.
- Se o 409 persistir com **run id** válido, investigar fila (`queue.json`) e pasta de output da run (causa distinta de `run_id_missing`).
