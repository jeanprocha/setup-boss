# Execution Graph Model — Discovery (schema conceitual)

## Objetivos do modelo

- Representar **dependências** entre macro-etapas e, no futuro, sub-etapas (validation/risk).
- Suportar **fingerprints** e **invalidação** de replay sem acoplar ao motor LLM.
- **Serialização JSON** estável (ordenar chaves / arrays com regra clara quando persistir hashes).

## Node schema (proposta)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `node_id` | string | Único no run; ex. `n-architect-0`, `n-executor-c2` (c2 = 2ª iteração correction). |
| `kind` | enum | `preflight`, `scan`, `architect`, `execution_plan`, `executor`, `validation_plan`, `validation_run`, `risk`, `review`, `correction`, `knowledge`, `apply`, `shadow_*`. |
| `iteration` | int | 0 para caminho principal; incrementa em correction loops. |
| `status` | enum | `pending`, `running`, `success`, `failed`, `skipped`, `blocked`. |
| `lifecycle_ref` | string? | Mapeamento para `RUNTIME_LIFECYCLE` quando existir. |
| `inputs` | object | Referências a artefactos ou hashes, não payloads completos. |
| `outputs` | object | Idem. |
| `artifacts_expected` | string[] | Lista canónica (ex. `executor-result.json`). |
| `fingerprints` | object | `input_sha256`, `output_sha256`, `logic_version`. |
| metadata opcional | | tempos, telemetria, motivo skip. |

## Edge schema (proposta)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `from` | string | `node_id` |
| `to` | string | `node_id` |
| `kind` | enum | `hard` (bloqueia), `soft` (shadow/advisory), `conditional` (gate ex. invalid_task). |
| `condition` | string? | Identificador de predicado (ex. `review_requires_correction`). |

## Dependency model

- **Hard deps**: pré-requisito para marcação `ready`.
- **Soft deps**: overlay observability — “deveria ter corrido antes” mas não bloqueia pipeline oficial.
- **Conditional**: arestas ativas só quando predicado avaliado sobre artefactos (review JSON, governance).

## Unlock rules (MVP linear-compatible)

1. Nó torna-se `ready` quando todos os pais `hard` estão `success` (ou `skipped` com política explícita).
2. Ordem de desbloqueio entre múltiplos ready: **FIFO estável** ou ordem fixa `kind_rank` espelhando `orchestration.js`.
3. Correction: duplicar conceptualmente **executor** como novo nó com `iteration+1` ou usar **mesmo kind** com `iteration` — segunda opção preserva histórico.

## Graph fingerprint

- `stable_stringify` de: lista `(node_id, kind, iteration, sorted_edges)` + versão schema.
- Hash `sha256` → `graph_sha256`.
- **Invalidação de replay**: mudança em qualquer `input_sha256` de nó na **subárvore** alvo ou mudança em edges `hard` relevantes.

## Node runtime identity

- Chave composta: `(run_id, node_id)`.
- Para iterações correction: `node_id` deve incluir sufixo ou campo `iteration` na identidade para evitar colisão de estado.

## Serialização / JSON Schema

- Ideal: JSON Schema draft 2020-12 com `additionalProperties: false` em nós e arestas.
- Arrays com ordem **canónica**: edges ordenadas por `(from, to, kind)`.
- **Estabilidade**: nunca persistir `Map` order-dependent; ordenar keys em artefactos derivados.

## Replay invalidation (ligação ao modelo)

- **Subtree replay**: marcar nó alvo + descendentes `hard` como `stale`.
- **Dependent invalidation**: propagar ao longo das arestas reversas para marcar consumidores.
- Hoje **não** há grafo persistido — invalidação é manual via remoção de artefactos e heurística `assessResume`.

## Avaliação

- Modelo é **simples o suficiente** para shadow; extensível para sub-nós executor (validation/risk) sem quebrar compatibilidade se `kind` enum crescer.

## Referências código existente com “graph mindset”

- `scripts/validation-runtime/graph/validation-graph.js` — grafo *interno* de validação (não é pipeline global).
- `scripts/execution-plan/validation-targeting/dependency-graph.js` — dependências de validação alvo.
