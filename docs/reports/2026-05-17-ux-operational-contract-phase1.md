# Relatório — Contrato UX operacional (Fase 1)

**Data:** 2026-05-17  
**Tipo:** append-only  
**Escopo:** Camada de representação operacional (sem UI final, sem alteração de runtime/executor)

---

## Resumo

Implementado contrato UX centralizado que traduz estados internos (`intake`, `clarification`, `strategy`, eventos de runtime) para **sete fases operacionais humanas**, com foco de derivação em **Inicialização** e **Montando o plano**. Integrado em `useOrchestration` como `operationalUx`. Nenhum mock novo; nenhuma mudança visual.

---

## Arquivos criados

| Arquivo | Função |
|---------|--------|
| `frontend/lib/runtime/operational/operational-ux-types.ts` | Tipos: `OperationalUxPhase`, `OperationalUxStep`, `PlanningStatus`, `RunOperationalUxContract` |
| `frontend/lib/runtime/operational/operational-ux-labels.ts` | Rótulos PT (`Inicialização`, `Montando o plano`, …) |
| `frontend/lib/runtime/operational/derive-operational-ux-contract.ts` | Normalizador central `deriveOperationalUxContract` |
| `frontend/lib/runtime/operational/operational-ux-selectors.ts` | Helpers: `operationalPhaseLabelForUi`, `planningSignals`, … |
| `frontend/lib/runtime/operational/index.ts` | Re-exports públicos |
| `frontend/lib/runtime/operational/derive-operational-ux-contract.test.ts` | 7 testes unitários |
| `frontend/hooks/use-run-operational-ux.ts` | Hook dedicado (governance + events + derive) |

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `frontend/hooks/use-orchestration.ts` | Expõe `operationalUx`; aceita `UseOrchestrationContext` (`projectId`, `newActivityFlow`) |
| `frontend/components/features/run-detail/RunViewShell.tsx` | Passa contexto ao `useOrchestration` (sem consumo visual de `operationalUx`) |
| `frontend/lib/runtime/clarification/clarification-operational-state.ts` | Import relativo (testabilidade node) |
| `frontend/lib/runtime/strategy/strategy-readiness.ts` | Import relativo |
| `package.json` | Teste operacional no script `npm test` |

---

## Contratos criados

### `RunOperationalUxContract`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `uxPhase` | `OperationalUxPhase` | Uma de: `initialization`, `planning`, `approval`, `versioning`, `execution`, `review`, `finalization` |
| `uxStep` | `OperationalUxStep` | Sub-passo narrativo (ex.: `planning_questions`, `initial_spec`) |
| `uxPhaseLabelPt` / `uxStepLabelPt` | `string` | Rótulos para UI (sem termos técnicos) |
| `iaValidated` | `boolean \| null` | Governança `.IA` (null = desconhecido) |
| `contextLoaded` | `boolean` | Contexto do projeto carregado |
| `initialSpecReady` | `boolean` | SPEC inicial disponível (derivado) |
| `planningStatus` | `PlanningStatus` | Estado agregado de Montando o plano |
| `planningQuestionsPending` | `number` | Contagem de perguntas pendentes |
| `finalPlanReady` | `boolean` | Plano final pronto para gate de aprovação |
| `requiresHumanAction` | `boolean` | Ação humana necessária |
| `isInitializationPhase` / `isPlanningPhase` | `boolean` | Flags de escopo fase 1 |
| `confidence` | `high \| derived \| fallback` | Qualidade da derivação |

### Entrada do normalizador

`DeriveOperationalUxContractInput` — `summary`, bundles clarification/strategy, flags `*Applies`, `executionLifecyclePhase`, `events`, governança opcional.

---

## Normalizações implementadas

| Estado interno (exemplos) | Fase UX |
|---------------------------|---------|
| `knowledge_bootstrap_*`, `intake`, nova atividade | `initialization` |
| `clarification_*`, `refining`, `strategy_generating` (pré-execução) | `planning` |
| `refinement_ready` + gate HITL | `approval` |
| `git_branch_*` pós-plano | `versioning` |
| `execution_running` | `execution` |
| `review_running` / `correction_running` | `review` |
| `success` / `completed` | `finalization` |

Funções auxiliares:

- `mapLifecyclePhaseToOperationalUx(rawPhase)` — adaptador legado
- `mapRuntimeEventTypeToOperationalUx(eventType)` — heurística defensiva por tipo de evento

Mapeamento de **planning** inclui `strategy_generating` após approve (alinhado ao fluxo alvo do discovery, mesmo com ordem backend atual invertida).

---

## Estados operacionais suportados (fase 1)

### Inicialização

- `iaValidated` — `GET /projects/:id/governance` ou eventos `governance_ia_ok`
- `contextLoaded` — `knowledge_bootstrap_ready` ou lifecycle > intake
- `initialSpecReady` — `intake_completed`, `task_plan_initial_*`, ou entrada em clarificação

### Montando o plano

- `planningStatus` — `questions_pending` … `strategy_building` … `complete`
- `planningQuestionsPending` — do bundle clarification
- `finalPlanReady` — refinement + (strategy ready quando aplicável)

Fases **approval → finalization** mapeadas no normalizador, mas **sem UI dedicada** nesta fase.

---

## Gaps ainda existentes

1. **`initialSpecReady`** — derivado por eventos/heurística; API não expõe flag dedicada.
2. **`finalPlanReady`** — sem read-model unificado refined+strategy; lógica parcial.
3. **Comentários/dúvidas** — sem modelo; `requestRefinement` não representado no contrato.
4. **Loop de perguntas** — `currentRound` não altera `planningStatus` além de contagem pending.
5. **Consumo visual** — `operationalUx` ainda não substitui `summary.phase` / labels técnicos na UI.
6. **`useRunOperationalUx`** — disponível mas não obrigatório; `useOrchestration.operationalUx` é o caminho principal.

---

## Limitações atuais

- Derivação **defensiva** com `confidence: fallback` quando só há `newActivityFlow` sem governança.
- `mapRawPhaseToLifecycleId` duplicado localmente no módulo operational (evita puxar i18n/stores em testes node).
- `isStrategyGenerationComplete` duplicado no derive (mesma lógica que `strategy-readiness.ts`).
- Ordem real do backend: approve clarification → strategy; contrato UX trata strategy ainda como **planning** até execução.
- Nenhuma alteração em timeline semântica, `OperationalUxPanel`, ou painéis clarification/strategy.

---

## Como validar manualmente

### Testes automáticos

```bash
node --experimental-strip-types --test frontend/lib/runtime/operational/derive-operational-ux-contract.test.ts
```

**Resultado esperado:** 7/7 passando.

### DevTools / consola (stack a correr)

1. Abrir Mission Control com projeto e corrida em clarificação.
2. No React DevTools, localizar componente que chama `useOrchestration`.
3. Verificar `operationalUx.uxPhase === "planning"` e `uxPhaseLabelPt === "Montando o plano"`.
4. Nova atividade (sem run): `uxPhase === "initialization"`.
5. Com governança blocked: `iaValidated === false`.

### Inspeção rápida no código

```typescript
import { deriveOperationalUxContract } from "@/lib/runtime/operational";
// ou orch.operationalUx após useOrchestration(...)
```

---

## Critérios de aceite (checklist)

| Critério | Estado |
|----------|--------|
| Contrato UX centralizado | ✅ `deriveOperationalUxContract` |
| Distinguir Inicialização vs Montando o plano | ✅ `uxPhase` + flags |
| Labels técnicas deixam de ser dependência **obrigatória** | ✅ `uxPhaseLabelPt` (consumo na fase 2) |
| Desacoplado do backend interno | ✅ entrada via bundles/eventos, não `phase` cru na UI nova |
| Sem mocks novos | ✅ |
| Sem mudança visual grande | ✅ |
| Runtime/executor intactos | ✅ |

---

## Próxima fase sugerida (Fase 2 — UI)

1. Substituir `runPhaseDisplayLabel(summary.phase)` por `operationalPhaseLabelForUi(operationalUx, …)` no ribbon.
2. Checklist Inicialização no `TaskComposer` usando `initializationMilestones(operationalUx)`.
3. Container “Montando o plano” unificando `ClarificationPanel` + strategy preview.
4. Pedir ao backend `initialSpecReady` / `uxPhase` no summary quando estável.
