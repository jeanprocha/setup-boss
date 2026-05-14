# Correction Runtime V2 — Fase 4.5

Motor de **runtime-guided remediation** paralelo ao `correction.js` legado. Não implementa rollback nem enforcement duro.

## Feature flag

| Variável | Valores | Efeito |
|----------|---------|--------|
| `SETUP_BOSS_CORRECTION_ENGINE` | `off` (default) | Comportamento pré-4.5. |
| | `guided` / `telemetry` / `shadow` | Persiste `correction-analysis.json`, manifest, memória, lineage, telemetria; enriquece o prompt do correction. |
| | `active` | Inclui gates de **supressão de retry** antes de consumir nova iteração de correção (`orchestration`). |

Ajustes: `SETUP_BOSS_CORRECTION_SUPPRESS_STREAK`, `SETUP_BOSS_CORRECTION_PRIMING_TARGETS_CAP` (ver `.env.example`).

## Artefactos (por `outputDir` de run)

- `correction-analysis.json` — contrato principal (`correction_analysis_id` derivado de forma determinística dos inputs).
- `correction-memory/correction-memory.json` — streak por assinatura, histórico compacto de retries.
- `correction-lineage.json` — chain de nós (parent, outcome, assinatura).
- `correction-runtime-manifest.json` — índice replay-safe com refs.
- `correction-runtime-telemetry.ndjson` — eventos opcionais (`correction_started`, `failure_classified`, `retry_suppressed`, etc.).

Integração: `plan-artifacts.json` ganha `artifacts.extensions.correction_runtime` e entradas em `generated` quando o merge corre.

## Fluxo

1. Review reprova com `requires_correction`.
2. **`active`**: `evaluateCorrectionRetrySuppressionGate` compara assinatura atual com memória; acima do streak → **partial** sem chamada LLM, com `correction-analysis` gravado.
3. **`guided|active`**: `runCorrection` chama `persistFullCorrectionArtifacts` (classificação, assinatura, remediação dirigida, lineage, telemetria).
4. LLM gera `correction-instructions.md` como antes.

## CLI

`npm run setup-boss -- inspect-correction [runId|latest|índice] [--json]`

Cruzamentos acrescentados em `inspect-review`, `inspect-validation-runtime`, `inspect-risk-analysis`.

## Limitações conhecidas

- Assinaturas dependem de artefactos presentes; reviews **só legado** sem `review-results.json` produzem análise mais pobre (sem quebrar fluxo).
- Escalações e supressões são **sinalização** — sem bloqueio distribuído nem rollback.

## Próximos (Fase 4.6 sugerida)

Enforcement coordenado com governance, HITL opcional, rollback controlado, estratégias de PATCH AST além do fluxo actual.
