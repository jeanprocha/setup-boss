# Stage → Node Mapping (DAG conceitual — Discovery 4.12)

Mapeamento de **runtimes atuais** para **nós** de um DAG futuro. Não altera código; define contrato mental para overlay.

Legenda comum:
- **ID de nó sugerido**: estável por tipo + iteração onde aplicável.
- **Fingerprints**: hoje dispersos (plano, validação, scan cache); unificar em camada 4.12.

---

## scan

| Aspecto | Hoje | Notas DAG |
|---------|------|-----------|
| Onde corre | Dentro de `runArchitect(ctx, { skipScan })` + cache em torno em `startFlow`; preflight só *analisa* se scan usará cache. | Nó lógico separável: “materializar `scan-output.md`” vs “usar cache”. |
| Inputs | `projectRoot`, flags `forceScan`, fingerprint cache, opcionalmente artefactos prévios. | Dependência: preflight opcional para política; dependência dura: projeto no disco. |
| Outputs | `scan-output.md`, entrada para architect. | Artefacto canónico. |
| Side effects | Leitura disco; escrita cache `.setup-boss/cache`. | Replay: sensível a mudança no tree entre runs. |
| Dependências implícitas | Arquitecto assume scan ou skip explícito. | Aresta: scan → architect (ou scan_skip com contrato). |
| Replay sensitivity | **Alta** sem cache/fixação de input. | Fingerprint: conteúdo normalizado ou hash do scan + versão ferramenta scan. |
| Identidade | Pode ser `scan@runId` ou `scan@runId#fresh|cached`. | Mesma run: uma instância; reruns correction podem **não** refazer scan. |

---

## architect

| Aspecto | Hoje | Notas DAG |
|---------|------|-----------|
| Inputs | `task.md`, `scan-output.md` (ou skip), `ctx`. | Dependências: task + scan branch. |
| Outputs | `architect-output.md`, `run-context.json`, `metadata.json`, `architect-validation.json`, etc. | Nó que **publica** contexto para executor e shadow plan. |
| Side effects | LLM; escrita `.IA/outputs`. | Não idempotente (LLM). |
| Gate | `invalid_task` aborta fluxo downstream. | Nó terminal parcial ou aresta condicional “abort”. |
| Replay sensitivity | **Média/alta** (LLM + temperatura). | Baseline determinística só com seeds/contratos congelados (fora escopo 4.12). |
| Fingerprint | Conteúdo task + scan + política; hoje não um único hash de “architect node”. | Proposto: hash de inputs estruturais + profile governance. |

---

## execution-plan (shadow compiler)

| Aspecto | Hoje | Notas DAG |
|---------|------|-----------|
| Onde | `runShadowExecutionPlanAfterArchitect` em `execution-plan/index.js`. | Nó **advisory**; default `SETUP_BOSS_PLAN_MODE=off`. |
| Inputs | `run-context.json`, `architect-output.md`. | Dep: architect (sucesso). |
| Outputs | `execution-plan.json`, telemetria plano. | |
| Side effects | Disco; não altera executor “oficial”. | Encaixa como nó paralelo *shadow* na mesma “camada” lógica pós-architect. |
| Replay sensitivity | Determinístico se inputs fixos + gerador estável. | |

---

## executor

| Aspecto | Hoje | Notas DAG |
|---------|------|-----------|
| Inputs | `run-context.json`, `architect-output.md`, `task`, estado virtual (dry-run). | Dep: architect + (implicit) validation targeting opcional não bloqueia entrada. |
| Outputs | `executor-result.json` (**gate**), `executor-changes.json`, outputs md, overlay dry-run. | |
| Subgrafo interno | Recovery loop, structural/hybrid apply, shadow reconcile. | Pode modelar-se como sub-DAG 4.12+ sem mudar semântica agora. |
| Side effects | **Crítico**: mutação repo se apply. | Fronteira determinística: diff + manifest. |
| Replay sensitivity | Parcial: com mesmo inputs e disco, hybrid paths podem ser repetíveis; LLM executor não. | Fingerprint: manifest + allowed files + mode dry/apply. |

---

## validation-plan / targeting

| Aspecto | Hoje | Notas DAG |
|---------|------|-----------|
| Onde | `runShadowValidationTargetingAfterArchitect` / `AfterReconciliation` (`execution-plan/validation-targeting`). | |
| Inputs | Plano shadow, run context, reconciliation opcional. | Dep: execution-plan shadow + executor changes (pós-reconcile). |
| Outputs | Manifests de targets, graph de validação (ver `validation-runtime`). | |
| Side effects | Artefactos; não barra architect. | |

---

## validator-executor (validation runtime)

| Aspecto | Hoje | Notas DAG |
|---------|------|-----------|
| Onde | `runValidationRuntimeAfterTargeting` dentro de `runExecutorStep` (após targeting/reconcile). | Ordem hardcoded **dentro** do step executor. |
| Inputs | `validation-targets` manifest, plano, policy profile. | Dep: targeting + plano. |
| Outputs | `validation-results.json`, manifest runtime. | |
| Bloqueio | Falhas “soft” por padrão; **enforce** via governance hook `POST_VALIDATION` pode abortar pipeline. | Nó com aresta de **erro fiscalizável** para o scheduler global futuro. |
| Replay sensitivity | Mais determinístico que LLM se validadores forem tooling (eslint, etc.). | `validation_run_id` já derivado em `validation-runtime/index.js`. |

---

## review

| Aspecto | Hoje | Notas DAG |
|---------|------|-----------|
| Onde | `runReviewStep` → `runReview(ctx)`. | Dep: executor bem-sucedido (artefactos). |
| Outputs | `review-output.json` (status approved/rejected/blocked). | Control flow: decisão do loop. |
| Side effects | LLM; possível histórico problemas. | |
| Replay sensitivity | Média; existe camada deterministic review (tests em `review-runtime/`). | Nó candidato a “modo determinístico” em replay. |

---

## correction

| Aspecto | Hoje | Notas DAG |
|---------|------|-----------|
| Onde | Loop em `runPostExecutorLoop` após review rejected + `requires_correction`. | Dep: review + limite cap + suppression gate. |
| Outputs | `correction-instructions.md`, artefactos `correction-runtime`. | |
| Side effects | LLM + memória correção. | Iteração: **aresta correction → executor** fecha ciclo. |
| Replay sensitivity | Baixa/média; gate de supressão usa fingerprints de falha. | Nó versionado por `correction_iterations`. |

---

## knowledge

| Aspecto | Hoje | Notas DAG |
|---------|------|-----------|
| Onde | `finishKnowledge` após review approved. | Dep: review approved **e** artefactos metadata/review. |
| Outputs | `knowledge-update.md`, enrich `.IA` projeto (se não dry-run). | |
| Side effects | Escrita fora de outputs run (projeto). | Terminal node “happy path”. |
| Replay sensitivity | Side effects em projeto — replay node exige dry-run ou branch isolado. | |

---

## Arestas DAG conceituais (MVP linear compatível)

```
preflight → scan_branch → architect → [execution_plan_shadow?] → executor
  → [validation_targeting → validation_run]  # actual order today: pos-reconcile inside executor step
  → review → (correction → executor)* → knowledge
```

Paralelismo real **não** é objetivo 4.12; “paralelo” limita-se a **shadow** (plano/observabilidade) sem alterar ordem oficial.

---

## Deterministic boundaries (resumo)

| Nó | Fronteira útil para replay parcial |
|----|-----------------------------------|
| Scan | Sim com fingerprint + snapshot. |
| Architect / Review / Correction | Depende de contrato LLM; replay parcial hoje é **artefacto-driven** (`replay-engine`). |
| Executor | Sim com manifest + dry-run overlay. |
| Validation tooling | Sim, se commandos e inputs fixos. |

---

## Arquivos de referência

- `scripts/runtime/orchestration.js`
- `scripts/architect.js`, `scripts/executor.js`, `scripts/review.js`, `scripts/correction.js`, `scripts/knowledge.js`
- `scripts/execution-plan/index.js`, `scripts/validation-runtime/index.js`
