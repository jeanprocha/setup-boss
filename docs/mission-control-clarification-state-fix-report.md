# Setup-Boss — Consistência de estado na clarificação (0 perguntas)

Relatório do fix aplicado quando uma corrida é `needs_context`, `initialState: clarification_required`, `phase2Status: clarification_initialized` e **`questionsCount: 0`**, evitando `uiState: waiting_approval` indevido e o gate HITL de aprovação sem SPEC/refinement.

---

## Causa raiz

1. **Daemon (`scripts/daemon/lib/run-intake-api.js`)**  
   `uiStateForInitialState` mapeava **qualquer** `clarification_required` para **`waiting_approval`**. Conceitualmente incorreto: clarificação sem perguntas/spec não é um gate de aprovação.

2. **Bundle phase2 (`scripts/daemon/lib/run-clarification.js`)**  
   `mapPhase2ToRuntimePhase` devolvia `clarification_required` para `clarification_initialized` mesmo com **0 questões**, não distinguindo o caso diagnóstico “inicializado mas vazio”.

3. **Frontend**  
   O gate (`ApprovalFlow`) era sempre renderizado; `canApprove` já era `false`, mas a UI parecia “travada” em aprovação por causa do **`summary.state`** vindo do metadata do job (`waiting_approval`).

---

## Regra nova de contrato

### Metadata do job (`uiState`)

Definido em **`core/clarification-ui-contract.js`** (`deriveUiStateAfterIntake`) e usado em `createRunFromTask`:

| Situação | `uiState` |
|----------|-----------|
| `clarification_required` + `questionsCount === 0` + phase2 `clarification_initialized` ou `questions_generated` | `waiting_clarification_questions` |
| `clarification_required` + `questionsCount > 0` | `waiting_clarification_answers` |
| `clarification_ready` | `running` |

### Runtime phase2 na API `/runs/:id/clarification`

| Situação | `session.runtimePhase` |
|----------|-------------------------|
| `clarification_initialized` ou `questions_generated` com **0** perguntas no bundle | `clarification_empty` |
| `clarification_initialized` com perguntas (`questions.length > 0`) | `clarification_required` |

O frontend reconcilia sessões antigas: se o servidor ainda enviar `clarification_required` com `questionsCount === 0` e phase2 compatível, **`mapPhase2StatusToRuntimePhase`** normaliza para **`clarification_empty`**.

---

## Arquivos alterados

| Ficheiro | Alteração |
|----------|-----------|
| `core/clarification-ui-contract.js` | `deriveUiStateAfterIntake`, `classifyOperationalClarificationBucket` |
| `core/clarification-ui-contract.test.js` | Testes do contrato UI |
| `scripts/daemon/lib/run-intake-api.js` | Usa `deriveUiStateAfterIntake`; remove mapeamento errado para `waiting_approval` |
| `scripts/daemon/lib/run-clarification.js` | `mapPhase2ToRuntimePhase(..., questionsCount)` → `clarification_empty` quando aplicável |
| `frontend/lib/runtime/runtime-ui-types.ts` | Novos `RuntimeUiState` |
| `frontend/lib/runtime/adapters/map-job.ts` | Leitura dos novos `uiState` no metadata |
| `frontend/lib/runtime/clarification/clarification-types.ts` | Fase `clarification_empty` |
| `frontend/lib/runtime/clarification/clarification-state.ts` | Mapeamento phase2 + disponibilidade HITL para `clarification_empty` |
| `frontend/lib/runtime/clarification/clarification-operational-state.ts` | Gate de aprovação + cópia UX |
| `frontend/lib/runtime/clarification/clarification-actions.ts` | Parser de fases nas mutações |
| `frontend/components/features/clarification/ClarificationPanel.tsx` | Banner diagnóstico, botões explícitos (desabilitados onde não há API segura), gate condicional |
| `frontend/components/features/clarification/ClarificationStateBadge.tsx` | Badge `clarification_empty` |
| `frontend/components/features/run-detail/RunViewShell.tsx` | Hint operacional para `clarification_empty` |
| `frontend/lib/runtime/adapters/dynamic-activity-steps.ts` | Headline + scroll highlight para novos estados |
| `frontend/lib/runtime/adapters/map-event.ts` | Mensagem + **severity warn** em `clarification_initialized` com `questionsCount: 0` |
| `frontend/lib/runtime/adapters/runtime-labels.ts` | Rótulos curtos dos novos estados |
| `frontend/components/primitives/StatusBadge.tsx` | Estilos dos novos estados |
| `frontend/lib/mocks/runtime-states.ts` | Alinhamento com `RuntimeUiState` real |
| `package.json` | Inclusão de `core/clarification-ui-contract.test.js` na suite `npm test` |

---

## Comportamento antes / depois

**Antes**

- Job metadata: `uiPhase: clarify`, `uiState: waiting_approval` mesmo sem perguntas/spec.
- Painel: gate de aprovação visível com botões desativados e mensagens ambíguas (“Refinement ainda não gerado”).
- Estado confuso com “aprovação” sem artefacto.

**Depois**

- Job metadata: `waiting_clarification_questions` (ou `waiting_clarification_answers` quando há perguntas).
- Bundle: `runtimePhase: clarification_empty` quando 0 perguntas + phase2 inicializado.
- Painel: mensagem explícita + acções nomeadas (**Gerar perguntas** / **Continuar sem clarificação** desabilitadas com tooltip honesto; **Pedir refinamento** só se o contrato permitir — neste estado continua desabilitado).
- **Gate de aprovação oculto** até haver sinal de SPEC/refinement (`refinement.available`, `planRef`, readiness, ou decisão já tomada).

---

## Validação executada

- `cd frontend && npx tsc --noEmit`
- `node --test core/clarification-ui-contract.test.js`
- Recomendação manual: abrir a corrida com `questionsCount: 0` e confirmar badge **Sem perguntas geradas**, ausência do gate principal e evento `clarification_initialized` com texto de aviso na timeline/stream.

---

## Limitações / próximos passos

- **Gerar perguntas** e **Continuar sem clarificação** permanecem sem endpoint HTTP dedicado no MVP — botões existem como contrato UX com `disabled` explícito.
- Corridas já persistidas com metadata antigo (`waiting_approval`) só mudam após novo create ou eventual sync que regrave `uiState` (o frontend ainda reconcilia `clarification_empty` via bundle quando possível).
