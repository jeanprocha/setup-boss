# Fix — key duplicada na timeline central (`exec-semantic-execution`)

**Data:** 2026-05-17  
**Tipo:** append-only (correção UI mínima)  
**Escopo:** Warning React em `CentralExecutionTimeline.tsx` apenas

---

## Resumo

A timeline central renderizava vários cards semânticos com o mesmo `anchorId` (ex.: `exec-semantic-execution`), porque `semanticTimelineAnchorId(phase)` é **um id por fase**, não por card agregado. O React usava `key={card.anchorId}` → warning:

`Encountered two children with the same key, exec-semantic-execution`

---

## Causa

| Camada | Comportamento |
|--------|----------------|
| `semantic-workflow-mapper.ts` | Vários steps do pipeline mapeiam para a mesma fase semântica (`execution`, etc.) |
| `semanticTimelineAnchorId` | `exec-semantic-${phase}` — partilhado por todos os cards da fase |
| `CentralExecutionTimeline.tsx` | `key` e `id` ambos = `anchorId` |

`anchorId` repetido é **intencional** para scroll/navegação por fase; não deve ser usado como key React.

---

## Correção

Ficheiro: `frontend/components/features/execution-timeline/CentralExecutionTimeline.tsx`

- Helper `timelineCardReactKey(card, index)` → `${anchorId}-${stepId}-${phase}-${index}`
- `key={timelineCardReactKey(card, i)}` no `.map`
- `id={card.anchorId}` **inalterado** (âncoras DOM / scroll)

Sem alteração de conteúdo dos cards, fases operacionais, mapper ou mocks.

---

## Critérios de aceite

- [x] Warning de key duplicada deixa de aparecer
- [x] Timeline renderiza igual
- [x] `id` / âncoras preservados para navegação
- [x] Fluxos operacionais inalterados
- [x] Sem mocks novos

---

## Verificação manual

1. Abrir corrida com fase de execução na timeline central.
2. Consola React: ausência de warning `same key, exec-semantic-execution`.
3. Clicar CTAs de navegação para execução/review — scroll continua a apontar para `exec-semantic-*`.
