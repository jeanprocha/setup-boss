# Setup Boss — Discovery Técnico: Fase 4.10
# Change-Oriented Validation Runtime

> **Estado actual:** Fase **4.10 encerrada** operacionalmente — ver **[`validation-runtime-phase410-release-readiness.md`](./validation-runtime-phase410-release-readiness.md)**. O texto abaixo é **descoberta / desenho histórico** (mantido como referência).

> Documento de descoberta inicial datado de **2026-05-14**; o código e os artefactos evoluíram até ao fecho documentado no link acima.

---

## 1. Objetivo da Fase 4.10

Introduzir um **Change-Oriented Validation Runtime**: um sistema capaz de validar **somente o que foi impactado** por uma mudança, em vez de executar validação global a cada run.

Capacidades-alvo:

- Detectar arquivos alterados
- Detectar impacto estrutural e semântico
- Montar dependency graph incremental
- Selecionar validators automaticamente por escopo
- Executar apenas testes/checks relevantes
- Gerar fingerprints de validação para cache
- Suportar validação incremental no daemon

---

## 2. Infraestrutura Existente (Inventário)

### 2.1 Fontes de Detecção de Mudança (já existem)

| Artefato | Localização | O que captura |
|---|---|---|
| `executor-changes.json` | `scripts/executor.js` | Patches aplicados (path, search, replace) |
| `execution-reconciliation.json` | `reconciliation-engine.js` | matched / unmatched / unexpected vs plano |
| `plan-diff` | `execution-plan/diff/plan-diff.js` | Diff entre duas versões do plano (ops, files, lifecycle) |
| `structural-fingerprint` | `hybrid-executor/replay/structural-fingerprint.js` | SHA-256 de span AST (node_kind, node_span, search, replace, before_file_sha256) |
| `structural-stale-analysis.json` | `hybrid-executor/replay/structural-stale-detector.js` | Spans obsoletos, already_applied, superseded |

### 2.2 Seleção de Validators (já existem)

| Componente | Localização | O que faz |
|---|---|---|
| `inferValidators(relPath)` | `validation-targeting/validator-inference.js` | Rótulos por extensão (eslint, jest_or_vitest, typescript, etc.) |
| `inferValidationScope(relPath)` | `validation-targeting/scope-inference.js` | `file` / `module` / `project` por heurística de path |
| `collectDependencyHints(absPath)` | `validation-targeting/dependency-hints.js` | Imports relativos, namespace, package (até 8KB, sem grafo) |
| `semantic-validation-propagation` | `validation-targeting/semantic-validation-propagation.js` | Expande targets via propagation-manifest + mutation graph (shadow) |
| `validation-targets.json` | (gerado) | Targets determinísticos por ficheiro + validators + hints |
| `validation-propagation-manifest.json` | (gerado) | Candidatos semânticos expandidos (shadow, report-only) |
| `validation-manifest.json` | (gerado) | Metadata agregado: refs, counts, fingerprint de propagação |

### 2.3 Fingerprints de Plano (já existem)

| Campo | Origem | O que identifica |
|---|---|---|
| `plan_content_sha256` | `plan-fingerprint.js` | Hash do IR canônico do plano (ops, allowed_files, intent) |
| `structural_inputs_sha256` | `plan-fingerprint.js` | Hash de inputs estruturais |
| `hashNormalizedOperation(op)` | `operation-normalizer.js` | Hash por operação individual |
| `fingerprintSelector(wire)` | `node-selector-generator.js` | SHA-256 do seletor AST MVP |

### 2.4 Infraestrutura de Execução (já existem)

| Componente | Localização | Relevância |
|---|---|---|
| `daemon/setup-bossd.js` | Daemon | Job queue + workers + locking por projeto |
| `queue-store.js` | Daemon | CRUD de jobs com heartbeat, retry, recovery |
| `worker-pool.js` | Daemon | Pool de slots com fairness por projeto |
| `runtime-api.js` | Daemon | API REST local para enqueue, status, eventos |
| `runtime-events.js` | Daemon | Eventos JSONL com subscribe in-process |
| `correction-runtime` | `correction-runtime/` | Assinatura de falhas, memória/streak, lineage, supressão de retry |
| `validation-registry.js` | `execution-plan/validation/` | Extensão preparada (array vazio, não conectado) |

---

## 3. Análise de Gaps

### 3.1 O que falta para "change-oriented"

| Gap | Impacto | Complexidade |
|---|---|---|
| Resolver rótulos → comandos reais (`jest_or_vitest` → comando concreto) | Alto: sem isso não há execução | Baixa |
| Execução real de validators (hoje só rótulos gerados, nunca executados) | Blocker para 4.10 | Alta |
| Cache de validação com chave (mudanças + validators + resultado) | Alto: central para "não revalidar" | Média |
| Dependency graph real (imports completos, não só hints 8KB) | Alto para escopo correto | Alta |
| Workers paralelos para validators do mesmo projeto | Médio | Média |
| Integração `validation-registry` no pipeline estrutural | Baixo (extensão já existe) | Baixa |
| Fingerprints de validação (distintos de fingerprints de plano) | Médio | Média |
| Source de mudanças por git diff (complementar ao executor-changes) | Médio | Baixa |

### 3.2 O que pode ser reutilizado diretamente

- **`executor-changes.json` + reconciliation** → fonte primária de "o que mudou" sem git
- **`accumulateCandidates` / `generateValidationTargets`** → conjunto inicial de paths a validar
- **`inferValidators` + `inferValidationScope`** → planeamento rápido de validators
- **`dependency-hints`** → semeadura para grafo de primeira camada
- **`validation-propagation-manifest`** → especificação shadow de quem mais validar
- **`structural-fingerprint`** → identidade por span AST para cache de resultado
- **`correction-runtime` (assinatura + memória)** → evitar re-execução idêntica
- **`daemon` enqueue + worker model** → execução de validation tasks via `run.js` ou entrypoint dedicado
- **`plan-diff`** → derivar subconjunto de operações alteradas entre revisões

---

## 4. Arquitetura Recomendada

### 4.1 Visão Geral

```
[Fontes de Mudança]
  executor-changes.json
  execution-reconciliation.json
  (futuro: git diff)
        │
        ▼
[Change Aggregator]
  Normaliza mudanças em ChangeSets
  → { path, kind, before_sha, after_sha }[]
        │
        ▼
[Impact Resolver]
  Usa validation-targeting existente
  + dependency-hints (1ª camada)
  + semantic-propagation manifest (shadow)
  + (futuro: dependency graph real)
  → ImpactMap: path → { scope, validators[], hints }
        │
        ▼
[Validation Plan Builder]
  Monta ValidationPlan (novo artefato)
  → validation-plan.json
  { plan_id, run_id, fingerprint, targets[], validators[] }
        │
        ▼
[Validation Fingerprint Engine]
  Hash(changeset + validators + scope) → fingerprint_key
  Consulta ValidationCache
  Cache hit → reutilizar resultado
  Cache miss → executa
        │
        ▼
[Validation Executor]
  Resolve rótulos → comandos reais
  Executa por escopo (file / module / project)
  Paralelo quando possível (projeto isolado pelo lock)
  Grava resultados + telemetria
        │
        ▼
[Validation Result Store]
  validation-result.json
  Cache entry { fingerprint_key, result, timestamp }
  Integra em plan-artifacts.json
```

### 4.2 Artefatos Novos

| Artefato | Descrição |
|---|---|
| `validation-plan.json` | Plano declarativo: targets, validators por alvo, fingerprint do changeSet |
| `validation-result.json` | Resultado da execução: por validator, por arquivo, status, stderr/stdout |
| `validation-cache.json` | Cache de resultados: chave = fingerprint_key, valor = resultado comprimido |
| `validation-runtime-manifest.json` | Manifest completo da run de validação (já parcialmente existe como `validation-manifest`) |

### 4.3 Modelo de Dados: ValidationPlan

```js
{
  schema_version: "1",
  plan_id: "<sha>",
  run_id: "<run_id>",
  generated_at: "<iso>",
  changeset_fingerprint: "<sha>",         // hash dos paths+before_sha+after_sha
  targets: [
    {
      target_id: "<sha>",                 // reutiliza stableTargetId existente
      path: "src/foo.ts",
      reason: "executor_change",          // executor_change | reconciliation_unexpected | semantic_expansion
      validation_scope: "module",         // file | module | project
      validators: ["eslint", "jest"],     // rótulos resolvidos
      commands: [                         // NOVO: comandos concretos
        { tool: "eslint", args: ["src/foo.ts"], cwd: "<projectRoot>" },
        { tool: "jest", args: ["--testPathPattern", "foo"] }
      ],
      dependency_hints: [...],            // reutiliza existente
      risk_hints: [...]                   // reutiliza existente
    }
  ],
  summary: {
    total_targets: 3,
    by_scope: { file: 1, module: 2, project: 0 },
    by_validator: { eslint: 3, jest: 2 }
  }
}
```

### 4.4 Modelo de Dados: ValidationFingerprint

```js
{
  fingerprint_key: "<sha256>",
  inputs: {
    changeset_fingerprint: "<sha>",       // identidade das mudanças
    validators_canonical: ["eslint@..."], // versão + config
    scope: "module",
    paths_sorted: ["src/foo.ts"]
  },
  result: {
    status: "passed",                     // passed | failed | skipped
    at: "<iso>",
    duration_ms: 1234,
    by_validator: { eslint: "passed", jest: "failed" }
  },
  ttl_ms: 86400000                        // invalida após 24h
}
```

### 4.5 Modelo de Dados: ValidationResult

```js
{
  schema_version: "1",
  run_id: "<run_id>",
  plan_id: "<plan_id>",
  status: "passed",                       // passed | failed | partial | skipped_cache
  cache_hit: false,
  fingerprint_key: "<sha>",
  results: [
    {
      target_id: "<sha>",
      path: "src/foo.ts",
      validator: "eslint",
      status: "passed",
      stdout: "...",
      stderr: "",
      duration_ms: 340
    }
  ],
  summary: { passed: 4, failed: 0, skipped: 1 },
  telemetry: { t_validation_runtime: 1200 }
}
```

---

## 5. Modelo de Dependency Graph

### 5.1 Estratégia Incremental (3 camadas)

**Camada 1 — Hints (já existe, reutilizar)**
- `dependency-hints.js`: imports relativos via regex (8KB), namespace, package
- Custo: zero (já é executado no validation-targeting)
- Limitação: apenas imports locais, sem resolution, sem node_modules

**Camada 2 — Static Import Graph (novo, fase 4.10.6+)**
- Varrer `import/require` via regex robusta por arquivo (sem full AST)
- Resolver paths relativos + aliases do `tsconfig.json`
- Resultado: `{ path → Set<imported_paths> }` em memória ou `dependency-graph.json`
- Custo: médio — varredura de todos os `.ts/.js` no projeto
- Viabilidade: alta — regex simples, sem bibliotecas pesadas

**Camada 3 — AST Graph (futuro, 4.11+)**
- Usar AST existente do `hybrid-executor/languages/` para imports reais
- Re-exports, barrel files, dynamic imports
- Custo: alto — parse completo
- Recomendação: adiar até validar valor com camadas 1 e 2

### 5.2 Estrutura do Grafo (Camada 2)

```js
{
  schema_version: "1",
  computed_at: "<iso>",
  project_root: "<abs>",
  nodes: {
    "src/foo.ts": {
      imports: ["src/bar.ts", "src/utils/helper.ts"],
      imported_by: ["src/index.ts"]
    }
  },
  fingerprint: "<sha>"  // hash do grafo para invalidação
}
```

### 5.3 Algoritmo de Expansão de Impacto

```
dado ChangedPaths = { src/bar.ts }

1. direct_impact = ChangedPaths
2. downstream = nodes que importam qualquer path em direct_impact (BFS 1 hop)
3. transitive = BFS completo com limite de profundidade (default: 3 hops)
4. cap: máx VALIDATION_SEMANTIC_EXPANSION_CANDIDATE_CAP_DEFAULT (512) targets
5. resultado: direct_impact ∪ downstream ∪ transitive (classificados por distância)
```

Compatível com classificação existente em `semantic-validation-propagation.js`:
- `direct_semantic_dependency`
- `transitive_semantic_dependency`
- `reverse_semantic_dependency`

---

## 6. Modelo de Validation Targeting (Integração com 4.12)

### 6.1 O que a 4.12 já entrega

A Fase 4.12 (`validation-targeting`) já produz os artefatos fundamentais:

- `validation-targets.json` — conjunto de paths + validators inferidos + hints
- `validation-propagation-manifest.json` — expansão semântica shadow
- `validation-manifest.json` — metadata/telemetria

**A 4.10 consome estes artefatos como entrada**, adicionando:
1. Resolução de rótulos → comandos concretos
2. Execução dos validators
3. Cache de resultado por fingerprint

### 6.2 Fluxo de Integração

```
[4.12 output]
validation-targets.json
        │
        ▼
[4.10: Validation Plan Builder]
  Para cada target:
    - resolve rótulo → comando concreto (novo: resolver-map)
    - monta ValidationPlanTarget
  Gera validation-plan.json
        │
        ▼
[4.10: Fingerprint Check]
  hash(plan_id + target.path + target.validators + changeset_fingerprint)
  → cache hit? return cached result
  → cache miss? execute
        │
        ▼
[4.10: Validator Executor]
  spawn comando por target
  coleta resultado
        │
        ▼
[4.10: Result Store]
  validation-result.json
  atualiza validation-cache.json
  merge em plan-artifacts.json
```

### 6.3 Resolver Map (Rótulo → Comando)

```js
// scripts/validation-runtime/lib/validator-resolver.js (NOVO)
const RESOLVER_MAP = {
  eslint: (path, opts) => ({
    cmd: 'npx', args: ['eslint', '--format', 'json', path]
  }),
  jest_or_vitest: (path, opts) => {
    // detecta via package.json scripts
    const tool = opts.hasVitest ? 'vitest' : 'jest'
    return { cmd: 'npx', args: [tool, '--testPathPattern', path, '--passWithNoTests'] }
  },
  typescript: (path, opts) => ({
    cmd: 'npx', args: ['tsc', '--noEmit', '--skipLibCheck']
  }),
  // ...
}
```

---

## 7. Modelo de Fingerprints de Validação

### 7.1 Fingerprint de Mudança (ChangeSet)

```
fingerprint_changeset = SHA256(
  sorted(
    [ path + "|" + before_sha + "|" + after_sha ]
    for each changed path
  ).join("\n")
)
```

Reutiliza `sha256HexUtf8` + `stableStringify` já existentes em `structural-fingerprint.js`.

### 7.2 Fingerprint de ValidationPlan

```
fingerprint_plan = SHA256(stableStringify({
  changeset_fingerprint,
  targets: sorted_targets.map(t => ({
    path: t.path,
    scope: t.validation_scope,
    validators: t.validators.sort()
  }))
}))
```

### 7.3 Chave de Cache

```
cache_key = SHA256(stableStringify({
  plan_fingerprint,
  validator_versions: { eslint: "8.x", jest: "29.x" }, // lock versions
  config_fingerprint  // hash de eslint.config.js + jest.config.js
}))
```

### 7.4 Estratégia de Invalidação

| Condição | Ação |
|---|---|
| `changeset_fingerprint` mudou | Cache miss (mudança no código) |
| Versão de validator mudou | Cache miss (resultado pode diferir) |
| Config de validator mudou | Cache miss (regras diferentes) |
| TTL expirado (default 24h) | Cache miss |
| `before_sha` bate mas resultado foi `failed` | Nunca usar cache de falha |

---

## 8. Integração com Replay / Runtime

### 8.1 Reuso de Lineage (correction-runtime)

O `correction-runtime/lineage/lineage-store.js` já mantém cadeia de runs com:
- `parent_id`, `signature`, `outcome`, `supression`

A Fase 4.10 pode estender este modelo para **validation lineage**:
```js
{
  validation_lineage_node_id: "<sha>",
  parent_id: "<prev>",
  plan_fingerprint: "<sha>",
  cache_hit: false,
  outcome: "passed",
  suppressed: false     // reutilizar lógica de streak do correction-runtime
}
```

### 8.2 Integração com Daemon

Novo tipo de job no daemon:

```js
// POST /jobs
{
  taskArg: "validate",
  projectArg: "/path/to/project",
  metadata: {
    taskKind: "validation",
    plan_fingerprint: "<sha>",
    changeset_fingerprint: "<sha>",
    targets: ["src/foo.ts", "src/bar.ts"]
  },
  flowOptions: {
    validationOnly: true
  }
}
```

O `setup-bossd.js` já suporta via `buildRunJsArgv` + `flowOptions` — apenas convenção de `metadata.taskKind` precisa ser definida.

### 8.3 Parallelismo de Validators

Limitação atual: lock de projeto serializa jobs do mesmo `projectRoot`.

Estratégia para validação paralela:
- **Opção A**: Validators que não mutam (lint, tsc, jest read-only) não precisam do write-lock
- Implementar lock **diferenciado**: `write-lock` vs `read-lock` por projeto
- Permite N validators em paralelo + serializa com qualquer job mutante
- **Opção B** (mais simples): Múltiplos targets num único job de validação, paralelizando internamente via `Promise.all`

Recomendação para 4.10: **Opção B** — menos risco de race condition, reutiliza o modelo de job atual.

---

## 9. Riscos

### 9.1 Riscos Funcionais

| Risco | Severidade | Mitigação |
|---|---|---|
| **Falso negativo**: dependency graph incompleto não detecta impacto | Alta | Manter fallback para validação global se confiança < threshold; camadas progressivas |
| **Stale cache**: fingerprint igual mas contexto mudou (NODE_ENV, env vars, configs) | Alta | Incluir config-fingerprint na chave de cache; TTL agressivo no início |
| **`jest_or_vitest` ambíguo**: resolve errado e falha silenciosamente | Alta | Detectar na criação do `validation-plan.json`; emitir warning se ambíguo |
| **Validation bypass**: shadow mode não executa nada | Média | Feature flag explícita para modo `execute` vs `shadow`; gate em produção |
| **Import cycles no grafo**: BFS infinito | Média | Visited set no BFS; depth limit configurável |

### 9.2 Riscos Arquiteturais

| Risco | Severidade | Mitigação |
|---|---|---|
| **Semantic propagation shadow permanece shadow**: expanded_targets nunca chegam a validators | Alta | Promover para `execute` mode explicitamente na 4.10 |
| **Graph inconsistency**: hints (camada 1) divergem do grafo real (camada 2+) | Média | Usar hints apenas como fallback; priorizar grafo quando disponível |
| **Performance do grafo**: varredura completa em mono-repos grandes | Média | Compute incremental; cache do grafo com fingerprint; lazy build por módulo |
| **Replay inconsistency**: validation-lineage diverge de execution-lineage | Baixa | Associar por `run_id` + `plan_id` — chaves já existentes |
| **Daemon lock contention**: validator jobs bloqueiam outros jobs | Média | Estratégia de lock diferenciado (ver seção 8.3) |

### 9.3 Riscos de Rollout

| Risco | Mitigação |
|---|---|
| Regression em pipelines existentes | Feature flags para cada sub-componente; shadow mode antes de produção |
| Custo de manutenção do cache | TTL + prune automático; limite de tamanho em `validation-cache.json` |
| Compatibilidade com 4.11+ (execution graph) | Não hardcodar estrutura do grafo; interface por contrato (`dependency-graph.json`) |

---

## 10. Roadmap Incremental

### Fase 4.10.1 — Validation Plan Foundation (Quick Win)
**Objetivo**: Artefato `validation-plan.json` como contrato intermediário.  
**Escopo**:
- `scripts/validation-runtime/index.js` — entry point (shadow)
- `scripts/validation-runtime/lib/validation-plan-builder.js` — consome `validation-targets.json` → `validation-plan.json`
- `scripts/validation-runtime/lib/validation-plan-store.js` — persist/load  
**Input**: `validation-targets.json` (já existe)  
**Output**: `validation-plan.json` (novo)  
**Blocker**: Nenhum  
**Risco**: Baixo (shadow only, sem execução)

---

### Fase 4.10.2 — Validator Resolver (Quick Win)
**Objetivo**: Resolver rótulos → comandos concretos.  
**Escopo**:
- `scripts/validation-runtime/lib/validator-resolver.js`  
- Detecção de jest/vitest via `package.json` scripts  
- Detecção de eslint config (`.eslintrc`, `eslint.config.js`, `biome.json`)  
**Input**: `validation-plan.json`, `package.json` do projeto  
**Output**: `validation-plan.json` com campo `commands` preenchido  
**Blocker**: Nenhum  
**Risco**: Baixo

---

### Fase 4.10.3 — Validation Executor (Core)
**Objetivo**: Executar validators selecionados.  
**Escopo**:
- `scripts/validation-runtime/lib/validation-executor.js`  
- Spawn por target/comando, captura stdout/stderr  
- `scripts/validation-runtime/lib/validation-result-store.js`  
- Gera `validation-result.json`  
**Input**: `validation-plan.json` com `commands`  
**Output**: `validation-result.json`  
**Blocker**: Fase 4.10.2  
**Risco**: Médio — primeiros testes com projetos reais revelam edge cases

---

### Fase 4.10.4 — Validation Fingerprint Cache
**Objetivo**: Evitar re-execução de validação idêntica.  
**Escopo**:
- `scripts/validation-runtime/lib/validation-fingerprint.js`  
- `scripts/validation-runtime/lib/validation-cache-store.js`  
- Gera `validation-cache.json` com TTL e prune  
**Input**: `validation-plan.json`, config files  
**Output**: Cache hit/miss na execução; `validation-cache.json`  
**Blocker**: Fase 4.10.3  
**Risco**: Médio (stale cache)

---

### Fase 4.10.5 — Daemon Integration
**Objetivo**: Validation tasks como jobs de primeira classe no daemon.  
**Escopo**:
- Convenção `metadata.taskKind: "validation"` no queue-store  
- `scripts/validation-runtime/validation-entrypoint.js` — invocado por `run.js` quando `taskArg === "validate"`  
- CLI: `setup-boss validate [--project=...]`  
**Input**: Job enqueued com `taskKind: "validation"`  
**Output**: Job status + `validation-result.json` no projeto  
**Blocker**: Fase 4.10.3  
**Risco**: Baixo (daemon já suporta modelos genéricos)

---

### Fase 4.10.6 — Static Dependency Graph (Camada 2)
**Objetivo**: Grafo real de imports para expansão de impacto precisa.  
**Escopo**:
- `scripts/validation-runtime/graph/dependency-graph-builder.js`  
- Varredura regex de imports em `.ts/.js` (sem full AST)  
- Resolução de paths relativos + aliases `tsconfig`  
- `dependency-graph.json` com fingerprint  
**Input**: Arquivos do projeto, `tsconfig.json`  
**Output**: `dependency-graph.json`  
**Blocker**: Nenhum (pode ser desenvolvido em paralelo com 4.10.3/4)  
**Risco**: Médio (performance em projetos grandes; import cycles)

---

### Fase 4.10.7 — Integration com Execution-Plan + Orchestration
**Objetivo**: Integrar `validation-runtime` no hook pós-reconciliação da orquestração.  
**Escopo**:
- Substituir/estender `runValidationRuntimeAfterTargeting` na orquestração  
- Merge de `validation-result.json` em `plan-artifacts.json`  
- `validation_runtime` como seção no `plan-artifacts-manifest`  
**Blocker**: Fases 4.10.3, 4.10.4  
**Risco**: Baixo (hooks já existem na orquestração)

---

## 11. Ordem Ideal de Implementação

```
4.10.1 (Foundation)     ← Quick Win, zero risco, define contrato
    │
    ▼
4.10.2 (Resolver)       ← Quick Win, sem execução ainda
    │
    ├──── 4.10.6 (Dependency Graph) ← pode rodar em paralelo
    │
    ▼
4.10.3 (Executor)       ← Core de valor; revela edge cases reais
    │
    ▼
4.10.4 (Cache)          ← Otimização; depende do executor
    │
    ▼
4.10.5 (Daemon)         ← Integração sistêmica
    │
    ▼
4.10.7 (Orchestration)  ← Encerramento; fecha o loop com plano
```

---

## 12. Quick Wins (zero blocker)

1. **`validation-plan-builder.js`**: consome `validation-targets.json` existente → `validation-plan.json`. Nenhuma dependência nova.
2. **`validator-resolver.js`**: detecta jest/vitest/eslint via `package.json`. Resolve ambiguidade `jest_or_vitest` que já incomoda a 4.12.
3. **Convenção `metadata.taskKind`**: o daemon já aceita `metadata` livre — apenas documentar o contrato.
4. **`validation-registry.js`**: conectar no motor estrutural (array vazio → registrar validadores por delta).

---

## 13. Blockers Arquiteturais

| Blocker | Descrição | Resolução |
|---|---|---|
| **Execução real de validators** | Hoje nenhum validator é executado; tudo são rótulos | Fase 4.10.3 é o ponto de virada |
| **`jest_or_vitest` ambíguo** | Sem resolver, executor não sabe qual binário chamar | Fase 4.10.2 resolve |
| **Semantic propagation em shadow** | `validation-propagation-manifest.json` existe mas não alimenta execução | Promover para `execute` em 4.10.3 |
| **Validation-registry não conectado** | Extensão preparada mas desconectada do motor | Conexão simples na 4.10.7 |

---

## 14. Dependências para Fases Futuras

| Fase futura | Dependência da 4.10 |
|---|---|
| **4.11+ (Execution Graph Runtime)** | `dependency-graph.json` como input; contrato de interface genérico |
| **Intent Runtime** | `validation-plan.json` como artefato de intent; fingerprint para replay |
| **CI parity** | `validation-result.json` como ground truth; comparação com CI remoto |
| **Replay completo** | `validation-lineage` + `cache_hit` + `plan_fingerprint` para determinismo |

---

## 15. Diagnóstico Final

### O que já existe e é sólido
- Pipeline de **targeting** (4.12) entrega conjunto de paths + validators + hints
- **Fingerprints estruturais** (hybrid-executor) para identidade de conteúdo
- **Reconciliation** como fonte de verdade de mudanças efetivas
- **Daemon** com queue robusta, locking, retry e eventos
- **Correction-runtime** com memória/streak para evitar ciclos

### O que está meio-pronto (shadow only)
- Semantic propagation → gera manifest mas não alimenta execução
- Validation-runtime hook na orquestração → existe mas não executa validators
- Validation-registry → extensão preparada, desconectada

### O que precisa ser construído
- `validation-plan.json` como artefato de orquestração central
- Resolver de rótulos → comandos concretos
- Motor de execução de validators
- Cache de fingerprints com TTL
- Dependency graph incremental (camada 2)

### Custo estimado (ordem de grandeza)
- 4.10.1 + 4.10.2: **~1-2 sessões** (novos módulos, sem tocar pipeline)
- 4.10.3: **~2-3 sessões** (executor + result store + edge cases)
- 4.10.4: **~1 sessão** (cache sobre executor existente)
- 4.10.5: **~1 sessão** (convenção no daemon já preparado)
- 4.10.6: **~2 sessões** (grafo incremental)
- 4.10.7: **~1 sessão** (integração com orquestração)

**Total estimado: ~8-11 sessões incrementais, sem risco ao pipeline existente.**
