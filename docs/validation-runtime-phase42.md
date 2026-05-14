# Validation Runtime — Fase 4.2

Este documento descreve o **Validation Runtime** incremental introduzido na Fase 4.2: grafo de validação, adapters, orquestração por estágios, cache/replay local, artefactos e CLI de diagnóstico.

## Objetivo

Decidir **o quê**, **quando** e **com que profundidade** validar alterações derivadas do execution plan e do targeting (Fase 4.1.2), sem substituir o executor nem bloquear o pipeline por defeito.

## Variáveis de ambiente

| Variável | Valores | Notas |
|----------|---------|--------|
| `SETUP_BOSS_VALIDATION_MODE` | `off` (default), `report`, `active` | `report` executa e persiste resultados sem bloquear. `active` reserva enforcement futuro; **ainda não aborta** o executor. |
| `SETUP_BOSS_VALIDATION_POLICY_PROFILE` | `minimal`, `balanced` (default env exemplo), `strict` | Controla conjunto de estágios activados. |
| `SETUP_BOSS_VALIDATION_TIMEOUT_MS` | ms | Timeout por validator externo (default 180000). |
| `SETUP_BOSS_VALIDATION_MAX_CONCURRENCY` | inteiro ≥ 1 | Paralelismo dentro de cada estágio (default 2). |

Compatível com shadow mode: normalmente é preciso `SETUP_BOSS_PLAN_MODE=shadow` para gerar `validation-targets.json`; sem targets o runtime faz skip seguro.

## Fluxo no pipeline

1. Execution plan (shadow) e reconciliation (quando aplicável).
2. **Validation targeting** → `validation-targets.json` + `validation-manifest.json`.
3. **Validation Runtime** (`runValidationRuntimeAfterTargeting`): grafo → execução → `validation-results.json` + `validation-runtime-manifest.json` + cache em `validation-runtime-cache/`.
4. Executor / review / correction continuam inalterados; falhas de validação são observabilidade.

Implementação do gancho: após `runShadowValidationTargetingAfterReconciliation` em `scripts/runtime/orchestration.js`.

## Artefactos por run (`outputDir`)

| Ficheiro | Conteúdo |
|----------|-----------|
| `validation-results.json` | Contrato oficial de corrida (summary, estágios, validators, telemetry embutida, metadata). |
| `validation-runtime-manifest.json` | Índice operacional, refs cruzadas e bloco `replay` (fingerprint do grafo). |
| `validation-runtime-cache/*.json` | Entradas de cache determinísticas por validator + paths + hash de inputs. |

`plan-artifacts.json` é actualizado para referenciar os novos ficheiros quando existem.

## Grafo de validação

- **Entrada**: targets (`inferred_validators`, paths, scopes), plano (via inferência já reflecta nos targets), estágios permitidos pela política.
- **Saída**: nós determinísticos (`validator_node_id`, tipo, estágio, paths agregados, `target_ids`), ordenação por estágio e `order_tier` por tipo de adapter.
- **Fingerprint**: `graph_fingerprint_sha256` estável para os mesmos inputs (sem AST pesado).

Código: `scripts/validation-runtime/graph/validation-graph.js`.

## Adapters

Interface comum: `checkAvailability`, `execute({ projectRoot, paths, scope, timeoutMs, signal })`.

| Adapter | Estágio típico | Notas |
|---------|----------------|-------|
| `json` | structural | `JSON.parse` puro (sem CLI). |
| `yaml` | structural | Usa pacote `yaml` resolvido a partir do **projeto alvo**; senão `skipped`. |
| `typescript` | syntax | `tsc --noEmit` local ou via `npx`. |
| `eslint` | lightweight | `npx eslint …`. |
| `markdown` | lightweight | `npx markdownlint-cli2 …` ou skipped. |
| `gofmt` | syntax | `gofmt -l`. |
| `golangci` | semantic | `golangci-lint run …`. |
| `phpstan` | semantic | `vendor/bin/phpstan` quando existir. |

Registo e mapa desde inferência 4.1.2: `scripts/validation-runtime/validators/registry.js`.

## Políticas de estágio

Definidas em `scripts/validation-runtime/policies/validation-policies.js`:

- **minimal**: structural + syntax  
- **balanced**: structural + syntax + lightweight  
- **strict**: structural + syntax + lightweight + semantic + project  

O estágio `project` está preparado para evoluções (suite completa); validators actuais ocupam sobretudo structural→semantic conforme tipos de ficheiro.

## Cache e replay

- **Cache key**: hash de tipo de validator, estágio, paths ordenados e fingerprint SHA-256 do **conteúdo** dos ficheiros.
- **Replay refs**: cada resultado inclui `replay_fingerprint_sha256`; o manifest guarda `graph_fingerprint_sha256`.
- **Consistência**: `scripts/validation-runtime/replay/validation-replay.js` (`compareReplayRefs`) para detectar divergências quando manifests antigos são comparados com novos resultados.

## Telemetria

Eventos emitidos via `telemetry.emit` e também para o canal do plano (`emitPlanTelemetryEvent`):

`validation_graph_generated`, `validator_started`, `validator_completed`, `validator_failed`, `validation_stage_completed`, `validation_cache_hit`, `validation_runtime_completed`.

## CLI

```bash
npm run setup-boss -- inspect-validation-runtime [latest|runId|índice] [--json]
```

Saída humana ou JSON completo com diagnóstico agregado + `validation_results` opcionalmente embutidos.

## Testes

`scripts/validation-runtime.test.js` cobre:

- determinismo do fingerprint do grafo;
- falha JSON inválido;
- cache hit na segunda execução;
- `mapPool`;
- `compareReplayRefs` sem manifest.

## Riscos e limitações

- Validators externos dependem de tooling instalado / rede (`npx`); falhas de spawn → `skipped` ou `error` conforme caso.
- YAML sem dependência no projeto-alvo não valida estrutura YAML nativamente.
- Modo `active` **não** bloqueia o pipeline nesta entrega (preparação apenas).

## Próximos passos (Fase 4.3 sugerida)

- Enforcement opcional por tipo de falha em modo `active`.
- Grafo enriquecido com hints de dependência entre validators.
- Validators para `jest_or_vitest` / suites npm com políticas de custo.
- Cache versionado partilhável ou fingerprint cruzado com `plan-artifacts.json`.
