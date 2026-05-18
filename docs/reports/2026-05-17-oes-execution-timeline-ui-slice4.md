# OES — Timeline visual da execução (Slice 4)

**Data:** 2026-05-17  
**Fase:** 6 — Slice 4  
**Objetivo:** Transformar `materializedExecution` numa esteira visual clara no painel central de execução.

---

## Componentes criados

| Componente | Caminho | Função |
|------------|---------|--------|
| `ExecutionMiniActivityTimeline` | `frontend/components/features/execution/ExecutionMiniActivityTimeline.tsx` | Container da esteira (ordem sequencial, modo de ordenação) |
| `ExecutionMiniActivityTimelineStep` | `frontend/components/features/execution/ExecutionMiniActivityTimelineStep.tsx` | Passo individual: badge, corpo, histórico, compact/expand |
| Lógica de projeção | `frontend/lib/runtime/operational/execution-mini-activity-timeline.ts` | Estados visuais, tiers, histórico legível |
| Estilos | `frontend/styles/execution-mini-activity-timeline.css` | Linha temporal minimalista (espelho da timeline de aprovação) |

## Integração

- `ExecutionPhasePanel` usa `ExecutionMiniActivityTimeline` quando `materializedExecution` existe, não é legado e tem miniActivities.
- Painel lateral / abas de execução mantêm-se resumidos (sem alteração de contrato).
- `globals.css` importa `execution-mini-activity-timeline.css`.

## Projeção de dados (backend → UI)

- `core/map-execution-runtime-state-dto.js` passa a expor por miniActivity:
  - `operationalHistory` — eventos de review/correção
  - `transitionHistory` — transições de estado (ex.: início de execução)
- `frontend/lib/runtime/execution/execution-adapters.ts` mapeia os mesmos campos para `MaterializedMiniActivityDto`.

## Regras visuais

### Tiers (densidade)

| Tier | Quando | Comportamento |
|------|--------|----------------|
| `active` | Em execução, revisão, correção ou `currentMiniActivityId` | Expandido: objetivo, critérios, review, histórico |
| `compact` | Concluída ou falhou | Uma linha; `<details>` para expandir |
| `upcoming` | Pendente / pronta / bloqueada (sem ser foco) | Título + badge; objetivo em uma linha |

### Estados suportados (badge)

| Estado visual | Rótulo PT |
|---------------|-----------|
| `pending` | Pendente |
| `ready` | Pronta |
| `running` | Em execução |
| `review` | Em revisão |
| `correction_required` | Correção necessária |
| `correcting` | Corrigindo |
| `completed` | Concluída |
| `failed` | Falhou |
| `blocked` | Bloqueada por dependência |

Prioridade: correção e review rejeitado sobrepõem o status base (`running`, `review`, etc.).

### Histórico operacional (compacto)

Derivado de `transitionHistory` + `operationalHistory`, sem JSON nem logs crus:

| Origem | Rótulo |
|--------|--------|
| Transição → `running` | Iniciou execução |
| `review_started` | Entrou em revisão |
| `review_approved` | Review aprovado |
| `review_rejected` | Review rejeitado |
| `correction_started` | Correção iniciada |
| `correction_completed` | Correção concluída |
| `review_retried` | Nova revisão |

Timestamps formatados em `pt-PT` (dia/mês hora:minuto).

### Destaque da miniActivity atual

- Classe `execution-mini-timeline__item--active` + anel no marcador da linha temporal.
- Texto «Em curso nesta etapa» quando `miniActivityId === currentMiniActivityId`.

## Fallback legado

Condição inalterada em `ExecutionPhasePanel`:

```ts
useMaterialized =
  materialized != null &&
  !materialized.legacy &&
  materialized.miniActivities.length > 0;
```

Se falso: lista resumida de `subtasks` (comportamento anterior), sem mensagem técnica nem erro.

## Validação

### Testes automatizados

```bash
node --test frontend/lib/runtime/operational/execution-mini-activity-timeline.test.ts
node --test core/update-execution-runtime-state.test.js
node --test core/materialize-execution-runtime-from-oes.test.js
```

Cobertura do slice:

- [x] MiniActivity atual → tier `active`
- [x] Concluídas → tier `compact`
- [x] Review rejeitado → «Correção necessária»
- [x] `correction_running` → «Corrigindo»
- [x] `failed` → «Falhou»
- [x] `blocked_by_dependency` → «Bloqueada por dependência»
- [x] Histórico: execução, review, correção, re-review
- [x] Fallback: painel legado por subtasks quando sem materialização

### Verificação manual sugerida

1. Run com OES materializado em execução → esteira sequencial no painel central.
2. Confirmar passo ativo expandido e concluídos compactos.
3. Run legado (sem `materializedExecution`) → lista de mini-tarefas anterior.

## Resultado

A execução deixa de parecer uma lista técnica agrupada por secções; o utilizador vê a esteira real (ordem do plano), o passo actual, review/correção e progresso por etapa de forma confiável e legível.
