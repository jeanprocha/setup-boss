# Graph Replay — Discovery

## Cenários de replay hoje

### 1. `replay-engine.js` (`npm run replay`)

- Entrada: `--from executor|review|correction` + `outputDir`.
- **Não** reexecuta scan nem architect.
- Usa `createStageContextFromOutputDir` — contexto reconstruído de artefactos.
- Restaura `lifecycle_state` anterior após terminado (guard no `finally`).
- Chama `enforceReplayGovernanceContinuity` — gate forte.

**Replay-safe parcial**: sim para estrutura de ficheiros; **não** garante determinismo LLM.

### 2. `resume-engine.js`

- Infere `next_phase` a partir de estado do disco + integridade manifest/executor-changes + governance.
- Não é “replay” de nó único, mas **continuação** do pipeline linear.

### 3. `apply-later` / deterministic apply

- Caminho separado para materializar patches após dry-run aprovado — determinístico relativamente a manifest.

### 4. Checkpoints (`runtime-checkpoints.json`)

- Append-only com hashes de artefactos — suporte a **diagnóstico** e continuidade fraca; não substitui state machine.

## Fingerprints e identidades existentes

- Plano: `plan_content_sha256`, etc. (`execution-plan`).
- Validação: `validation_run_id`, `graph_fingerprint_sha256` (`validation-runtime`).
- Scan cache: fingerprint em `.setup-boss/cache`.
- Correction: `failure_signature_sha256` no suppression gate (`correction-pipeline.js`).
- Hybrid executor: structural fingerprints (`hybrid-executor/replay/*`).

## Viabilidade: replay de nó

| Nó | Viável hoje | Bloqueadores |
|----|-------------|---------------|
| executor | Sim (`replay --from executor`) | Estado projeto drift vs dry-run overlay; governance. |
| review | Sim | LLM; deterministic review subsystem pode aproximar. |
| correction | Sim | LLM + memória. |
| architect | Não via replay-engine | Precisaria novo entrypoint ou replay full. |
| scan | Não via replay-engine | Requer script isolado ou rerun architect com skip. |
| validation_run | Parcial | Re-rodar `runValidationRuntimeAfterTargeting` possível in-process se artefactos íntegros; não exposto como CLI único. |
| knowledge | Parcial | Side effects fora output dir. |

## Viabilidade: replay de subárvore

- Conceitualmente: marcar nó raiz + todos descendentes em modo `stale`, reexecutar topological order.
- **Hoje**: não implementado; correction loop **reexecuta executor → review** mas não generalizado.

## Dependent invalidation

- Não há motor global; **artefacto ausente** ou **manifest inválido** invalida resume (`assessResume` retorna false).
- Para 4.12: invalidação deve seguir arestas `hard` do DAG shadow.

## Side effects que quebram replay

- Mutação direta do repo entre runs sem registo em `executor-changes.json`.
- Alteração de `metadata.json` manual.
- Aprovação governance stale (`governance-continuity`).
- TTL scan cache repovoando scan diferente com mesmo run (menos relevante — runId novo em fluxo normal).

## Deterministic review (ângulo existente)

- Testes e módulos em `scripts/review-runtime/deterministic-review-*.js` — candidatos a **nó review** com perfil `deterministic` em modo futuro.

## Contratos para 4.12

- Unificar vocabulário: `replay_scope: node|subtree|from_checkpoint`.
- Persistir no overlay graph: `last_replay` com `{ node_id, from_step, governance_ok, finished_at }` **sem** alterar `replay-engine` legacy inicialmente.

## Arquivos

- `scripts/runtime/replay/replay-engine.js`
- `scripts/runtime/replay/resume-engine.js`
- `scripts/runtime/replay/checkpoint-manager.js`
- `scripts/runtime/run-runtime.js` (`executeReplayPipeline`)
- `scripts/correction-runtime/correction-pipeline.js` (suppression)
- `scripts/validation-runtime/index.js`
