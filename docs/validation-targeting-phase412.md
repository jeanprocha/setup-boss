# Validation Targeting — Fase 4.1.2

Documentação técnica da camada **Validation Targeting Foundation**: preparação do grafo de validação incremental **sem execução** de linters, typecheck ou testes.

## Objetivo

- Descobrir **targets** de validação a partir do plano de execução, alterações do executor e reconciliação.
- Inferir **âmbito** (`file` | `module` | `project`) e **validators** candidatos por heurísticas de caminho/extensão.
- Produzir **hints de dependência** leves (regex / estrutura de caminho).
- Persistir **`validation-targets.json`** e **`validation-manifest.json`** e integrar telemetria e CLI.

## Ativação

Toda a funcionalidade está ligada ao modo shadow do Execution Plan:

- `SETUP_BOSS_PLAN_MODE=shadow`

Com `off`, o gerador não corre e o pipeline permanece inalterado.

## Artefactos

| Ficheiro | Descrição |
|----------|-----------|
| `validation-targets.json` | Lista de targets + sumário (`validator_types`, contagens). |
| `validation-manifest.json` | Metadados da geração: fase (`post_architect` / `post_reconciliation`), refs ao plano e reconciliação, cópia resumida de eventos de telemetria. |

O manifesto global `plan-artifacts.json` passa a referenciar estes campos quando existirem (`validation_targets`, `validation_manifest`).

## Fluxo operacional

1. **Architect** → `execution-plan.json` (shadow).
2. **Hook `post_architect` (orquestração)** → `runShadowValidationTargetingAfterArchitect`: targets apenas com operações e `allowed_files` (sem reconciliação nem `executor-changes`).
3. **Executor** → `executor-changes.json`.
4. **Reconciliação** → `execution-reconciliation.json`.
5. **Hook `post_reconciliation` (orquestração)** → `runShadowValidationTargetingAfterReconciliation`: regeneração completa dos targets com reconciliação e alterações.

Falhas na geração são **best-effort**: capturadas e não abortam correção, review ou resume.

## Módulos (`scripts/execution-plan/validation-targeting/`)

- **`validation-target-generator.js`** — junção determinística de caminhos (operações, executor, reconciliação), dedupe por ficheiro, `target_id` estável (SHA-256 truncado).
- **`scope-inference.js`** — regras por extensão/caminho (ex.: `package.json`, Docker, migrações → `project`; código TS/JS → `module`; `.md`/`.yaml` isolados → `file`).
- **`validator-inference.js`** — etiquetas simbólicas (`eslint`, `typescript`, `go_test`, …); opcionalmente sensível à existência de configs na raiz (`biome.json`, etc.).
- **`dependency-hints.js`** — leitura limitada (8 KiB) para imports relativos, `namespace` PHP, `package` Go, blocos Vue.
- **`validation-manifest.js`** — persistência e leitura dos JSON.
- **`index.js`** — API `runShadowValidationTargeting*` + emissão de telemetria.
- **`diagnostics.js`** — agregação para CLI / `inspect-plan`.

## Telemetria

Eventos emitidos em `ctx.telemetry.emit` (e duplicados no manifesto):

- `validation_targets_generated`
- `validation_scope_inferred`
- `validator_inference_completed`
- `dependency_hints_generated`
- `validation_manifest_updated` (também via `emitPlanTelemetryEvent` para alinhar ao plano)

## CLI

- `npm run setup-boss -- inspect-plan …` — secção extra **validation targeting** e campos no manifesto.
- `npm run setup-boss -- inspect-validation-targets [run\|latest\|índice] [--json] [--sample=N]`

## Compatibilidade

- Runs antigas sem estes ficheiros: diagnósticos reportam ausência; nenhuma validação obrigatória.
- Daemon / resume: dependem da mesma orquestração; se o plano shadow estiver desligado, comportamento idêntico ao anterior.

## Fase 4.2 (próximo passo)

Executar validators reais por target, orquestrar grafo incremental e enforcement opcional — usando `validation-targets.json` como contrato estável.
