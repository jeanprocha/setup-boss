# Setup Boss — Review Runtime (Fase 4.4)

Documentação técnica do **Deterministic Review System** / **Structured Runtime Evaluation Engine**.

## Objectivo

Complementar o review legado (LLM em `scripts/review.js`) com uma camada **determinística**, **replay-safe** e **aware** de plano, reconciliação, validação, risco e invariantes — sem enforcement duro no executor e sem quebrar correção, replay ou daemon.

## Variáveis de ambiente

| Variável | Valores | Comportamento |
|---------|---------|---------------|
| `SETUP_BOSS_REVIEW_ENGINE` | `off` (default) | Apenas fluxo legado: LLM gera `review-output.json`. |
| | `structural` | Motor determinístico apenas; sem heurísticas semânticas estendidas. |
| | `full` | Structural + camada semântica **determinística** (heurísticas sobre artefactos). |
| `SETUP_BOSS_REVIEW_RECON_UNEXPECTED_MAX` | inteiro ≥ 0 (default `0`) | Limiar de `unexpected_changes` na reconciliação antes de violar invariante. |

## Artefactos

| Ficheiro | Descrição |
|----------|-----------|
| `review-results.json` | Contrato principal: scores, camadas, violações, políticas, `correction_hints`. |
| `review-runtime-manifest.json` | Manifesto resumido (scores, contagens, refs replay/telemetria). |
| `review-correction-hints.json` | Dicas preparatórias para Fase 4.5 (sem alterar `correction.js`). |
| `review-output.json` | Compatível com `correction.js`: derivado do resultado agregado + políticas. |
| `plan-artifacts.json` | Extensão `artifacts.extensions.review_runtime` com refs aos ficheiros acima. |

## Arquitectura (`scripts/review-runtime/`)

- `feature-flags.js` — modo do motor.
- `contract/review-contract.js` — forma e validação rudimentar de `review-results`.
- `lib/runtime-snapshot.js` — leitura normalizada de artefactos por `outputDir`.
- `lib/legacy-review-map.js` — `acceptance_level` a partir de `run-context.json`.
- `invariants/*` — invariantes por domínio (reconciliação, validação, lifecycle, artefactos, operações, replay).
- `structural/structural-review-engine.js` — dimensões e score estrutural; invoca invariantes.
- `semantic/semantic-review-layer.js` — sinais semânticos **não gerativos** (âmbito, verbosidade, alinhamento ao run-context).
- `scoring/review-scoring.js` — pesos, penalidades por severidade, confiança.
- `policies/review-policies.js` — limiares e *hints* (`manual_review`, `correction`, escalações).
- `orchestration/review-orchestrator.js` — pipeline: structural → (semantic se `full`) → score → política → persistência.
- `telemetry/review-telemetry.js` — eventos `review.*` via `telemetry.emit`.
- `diagnostics/review-diagnostics.js` — agregação para CLI.

## Telemetria

Eventos emitidos (best-effort): `review.review_started`, `structural_review_completed`, `semantic_review_completed`, `invariant_violation_detected`, `review_score_calculated`, `review_policy_applied`, `review_completed`, `review.review_engine_error`.

## CLI

```bash
npm run setup-boss -- inspect-review [runId|latest|índice] [--json] [--rerun-invariants]
```

Comandos relacionados passam a referenciar `review-results.json` quando existe: `inspect-plan`, `inspect-risk-analysis`, `inspect-validation-runtime`.

## Integração em `review.js`

1. Com `SETUP_BOSS_REVIEW_ENGINE` `structural` ou `full`, corre `runReviewOrchestration` no início do passo (após carregar contexto).
2. Gates **NO-OP** determinísticos mantêm precedência para bloquear NO-OP inválido; NO-OP válido pode ser **rebaixado** se o motor estrutural exigir `rejected`/`blocked`/`partial` com correcção/manual review.
3. Com alterações reais e motor activo, o LLM **não** é invocado; o resultado agregado escreve `review-output.json`.
4. Se o orquestrador falhar internamente, imprime aviso e faz **fallback** para o review legado (LLM).

## Compatibilidade

- `off`: comportamento idêntico ao anterior.
- Falhas no motor não abortam o processo Node do review; fallback LLM quando aplicável.
- `correction.js` continua a consumir `review-output.json` no formato existente.

## Próximos passos (Fase 4.5)

- Consumir `correction_hints` / `review-correction-hints.json` no motor de correcção.
- Enforcement opcional e políticas de HITL continuam fora de escopo desta fase.
