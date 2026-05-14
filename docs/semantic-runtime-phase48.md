# Semantic Dependency Runtime — Fase 4.8 (estabilização 4.8.10)

Documentação alinhada ao código em `scripts/semantic-dependency-runtime/` e integrações **shadow-only**. Não substitui a leitura dos schemas nos próprios artefactos JSON.

## Objectivo da fase

- Grafo de dependências semânticas (JS/TS relativo), **snapshots** e **overlay de mutação** com políticas e limites explícitos.
- Propagação para validation-targeting, risk, review e correction como **telemetria / artefactos extra**, sem enforcement nem alteração silenciosa de decisões principais.

## Variáveis de ambiente (propagação)

| Variável | Valores | Default seguro |
|----------|---------|----------------|
| `SETUP_BOSS_SEMANTIC_VALIDATION_PROPAGATION` | `off` \| `shadow` | `off` |
| `SETUP_BOSS_SEMANTIC_RISK_PROPAGATION` | `off` \| `shadow` | `off` |
| `SETUP_BOSS_REVIEW_SEMANTIC_PROPAGATION` | `off` \| `shadow` | `off` |
| `SETUP_BOSS_CORRECTION_SEMANTIC_PROPAGATION` | `off` \| `shadow` | `off` |

Comentários e exemplos: **`.env.example`**. Valores fora de `shadow` para estes quatro flags são tratados como **`off`** no código (sem modo `active` para propagação).

## Artefactos principais

| Ficheiro | Conteúdo |
|----------|----------|
| `dependency-graph.json` | Grafo core; `graph_fingerprint_sha256` exclui `lifecycle` volátil do payload canónico |
| `graph-snapshot.json` | Snapshot replay-safe (fingerprint sem `created_at`) |
| `semantic-mutation-graph.json` | Overlay a partir de seeds / reconciliação |
| `propagation-manifest.json` | Manifesto do overlay (`propagation-manifest/1`) |
| `validation-propagation-manifest.json` | Candidatos de validação (report-only) |
| `semantic-diagnostics.json` | Relatório consolidado só leitura (`semantic-diagnostics/1`) |
| `review-semantic-propagation.json` | Shadow review-runtime |
| `correction-semantic-propagation.json` | Shadow correction-runtime |

## Determinismo e continuidade

- **Fingerprints**: `scripts/semantic-dependency-runtime/fingerprint/graph-fingerprint.js` e `stable-stringify` com chaves ordenadas.
- **Governança semântica**: `scripts/runtime/governance/governance-semantic-continuity.js` agrega inputs ordenados (`semantic_continuity_inputs`), digest de integrações risk/review/correction e comparação com manifest de aprovação (`semantic_stale`, mismatch de continuidade).
- **Ordem**: listas relevantes (vértices, arestas, razões) são ordenadas lexicalmente antes de digests.

## CLI e diagnóstico

- `setup-boss semantic inspect` (ou equivalente registado em `scripts/cli/commands/semantic-inspect.js`) — leitura de artefactos e resumo de continuidade / propagações.
- Relatório de governança e inspect geral continuam em **`docs/governance.md`** / **`docs/observability.md`** onde aplicável.

## Estratégia de rollout

- Toda a propagação semântica para outros runtimes permanece **`off` por defeito** ou **`shadow`** quando activada: gera ficheiros e metadados, **não** activa enforcement nem altera scores base por propagação isolada.
- Não há **activation fora de shadow** para estes caminhos na Fase 4.8.

## Limitações explícitas (ainda não na roadmap 4.8)

- Sem grafo de símbolos AST.
- Sem executor híbrido.
- Sem scoring semântico avançado dedicado além dos blocos existentes nos motores.
- Sem alteração do transaction/rollback runtime para semântica além do que já estiver integrado nesses módulos.

## Readiness para 4.9

- Base **determinística**, **replay-safe** nos testes actuais (`npm test`, suites semânticas, governança semântica, replay/resume).
- Próximo passo lógico: evolução por trás das mesmas flags e artefactos, mantendo defaults seguros até decisão explícita de productização.
