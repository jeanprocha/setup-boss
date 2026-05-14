# Graph Runtime State — Discovery (base para `execution-graph-runtime.json`)

## Objetivo

Definir **onde o estado vive hoje** e um **esqueleto conceitual** de documento único por run para o DAG overlay (4.12), **sem implementação**.

## Estado hoje (fontes da verdade)

| Concern | Ficheiro / local | Conteúdo relevante |
|---------|------------------|--------------------|
| Identidade run | `runId` de `core/run-resolver.js` (`getRunId`) | Timestamp + slug task. |
| Índice global | `.setup-boss/runs/<runId>.json` | `project_root`, `output_dir`. |
| Pasta canonica | `<project>/.IA/outputs/<runId>/` | Todos artefactos. |
| Log operacional | `run-log.json` | `steps[]`, status, `correction_iterations`, limits. |
| Metadata enriquecida | `metadata.json` | `taskArg`, `projectArg`, `projectRoot`, `execution.*`, `execution_plan`, scan cache info. |
| Checkpoints replay | `runtime-checkpoints.json` | `phase_completed`, hashes artefactos, `replayability`. |
| Transaction overlay | `transaction-runtime.json` | Stages, checkpoints, recovery (Fase 4.6). |
| Governance | `governance-*.json`, policy artefacts | Gates resume/replay. |
| Plano shadow | `execution-plan.json` | `lifecycle_state`, `plan_id`, fingerprints. |
| Validação | `validation-results.json`, manifests | `validation_run_id`, graph fingerprint. |
| Correção | `correction-memory/`, `correction-analysis.json` | Suppression gate, streaks. |

## Retries e falhas

- **Executor micro-retry**: estado em `ctx.state.recovery_summary`, artefactos recovery (ex. diagnosis file), lifecycle `RECOVERING`/`RECOVERED`.
- **Correction loop**: `run-log.json` + `logger.data.correction_iterations`; limite em env + `governanceCorrectionCap` do preflight.
- **Supressão correction**: `evaluateCorrectionRetrySuppressionGate` — lê output dir + telemetry.
- **Resume**: `assessResume(outputDir)` sintetiza `next_phase` — não persiste “cursor” explícito além dos artefactos.

## Runtime identities existentes

- `run_id`: string temporal-slug.
- `plan_id` / `transaction_id`: em execution-plan e transaction-runtime.
- `validation_run_id`: hash derivado (`validation-runtime/index.js`).
- Fingerprints: `plan_content_sha256`, `graph_fingerprint_sha256` (validação), scan cache fingerprint (`scan-cache`).

## Replay contracts (implícitos)

- `replay-engine.js`: só `executor` \| `review` \| `correction`; restaura lifecycle após execução; exige governance continuity.
- `resume-engine.js`: exige integridade manifest/executor-changes; governance gate.
- Checkpoints: lista append-only com hashes de ficheiros (integridade fraca/diagnóstico).

## Esboço conceitual: `execution-graph-runtime.json`

Contrato **futuro** (campos sugeridos para desenho; não normativo até RFC interno):

```json
{
  "schema_version": 1,
  "run_id": "",
  "project_root": "",
  "output_dir": "",
  "compat": {
    "pipeline_mode": "linear_v2",
    "overlay_mode": "off|shadow|advisory"
  },
  "graph": {
    "nodes": [],
    "edges": []
  },
  "scheduler": {
    "cursor_node_id": null,
    "completed_node_ids": [],
    "skipped_node_ids": [],
    "blocked_reason": null
  },
  "fingerprints": {
    "graph_sha256": null,
    "inputs_bundle_sha256": null
  },
  "links": {
    "metadata_json": "metadata.json",
    "runtime_checkpoints": "runtime-checkpoints.json",
    "transaction_runtime": "transaction-runtime.json"
  }
}
```

**Nó (contrato mínimo sugerido):**

- `node_id`, `kind` (enum alinhado a stages), `iteration` (p.ex. correction depth), `status` (`pending|running|success|failed|skipped`), `started_at`, `finished_at`, `artifact_refs[]`, `input_fingerprint`, `output_fingerprint`.

**Integração backward-compatible**

- Gerado apenas em modo overlay; pipeline linear **não** depende do ficheiro.
- `links` aponta para fontes atuais — evitar duplicar payload pesado.

## Lacunas identificadas

- Não existe “cursor” único transversal; estado está **distribuído**.
- `phase_completed` em checkpoints não cobre sub-passos dentro de `runExecutorStep` (validation/risk como nós lógicos).
- Identidade de “subexecução” correction vs “primeira” execução só via contador + artefactos.

## Riscos de persistência

- Duplicação de estado se graph JSON divergir de `metadata.json`.
- Escrita concorrente: daemon + CLI — hoje lock por projeto mitiga parte.

## Arquivos relacionados

- `scripts/runtime/orchestration.js`
- `scripts/runtime/replay/checkpoint-manager.js`
- `scripts/transaction-runtime/checkpoint-engine.js`
- `scripts/logger.js`
- `core/run-resolver.js`
- `scripts/runtime/replay/resume-engine.js`
