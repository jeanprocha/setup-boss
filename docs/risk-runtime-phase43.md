# Risk runtime — Fase 4.3

Motor de decisão **risk-aware** em modo **report / observabilidade**. Não bloqueia o executor, não faz rollback e não impõe sandbox ou HITL.

## Variáveis de ambiente

| Variável | Valores | Comportamento |
|----------|---------|----------------|
| `SETUP_BOSS_RISK_ENGINE` | `off` (default), `telemetry`, `active` | `off` desliga o pipeline de risco. `telemetry` calcula, persiste `risk-analysis.json` e `risk-runtime-manifest.json`, actualiza `plan-artifacts.json` e best-effort `metadata.json`. `active` faz o mesmo e acrescenta `execution.risk_orchestration_recommendations` em `metadata.json`. |

Ajuste fino opcional: `SETUP_BOSS_RISK_TIER_*_MIN`, `SETUP_BOSS_RISK_WEIGHT_*` (ver `scripts/risk-runtime/policies/risk-policies.js`).

## Artefactos

- **`risk-analysis.json`**: contrato principal (score, tier, factors, signals, recommendations, `review_hints`, escalações suaves).
- **`risk-runtime-manifest.json`**: agregado com `propagation`, refs, `telemetry_embedded` (eventos `risk_*` da telemetria in-process da corrida).

## Integração no pipeline

Após **Validation Runtime** e ainda dentro do passo do executor (`scripts/runtime/orchestration.js`), chama-se `runRiskAnalysisAfterValidation` (`scripts/risk-runtime/index.js`). Falhas são engolidas.

## CLI

```bash
npm run setup-boss -- inspect-risk-analysis [latest|runId|índice] [--json]
```

`inspect-plan` e `inspect-validation-runtime` incluem bloco JSON `risk` / cruzamento com validação quando os ficheiros existem.

## Telemetria (eventos)

- `risk_analysis_started` / `risk_analysis_completed`
- `risk_factor_generated`
- `risk_escalation_triggered`
- `risk_policy_applied`
- `risk_propagation_completed`

Emitidos via `telemetry.emit` do contexto da corrida (em memória); cópia truncada em `risk-runtime-manifest.json`.

## Extensibilidade

Novos fatores: adicionar avaliador em `scripts/risk-runtime/factors/` e registar em `factors/index.js`. Políticas e pesos: `risk-policies.js`. Propagação: camadas em `propagation/risk-propagation.js`.

## Compatibilidade

Com `SETUP_BOSS_RISK_ENGINE` omitido ou `off`, o comportamento é idêntico ao pré-4.3; nenhum ficheiro obrigatório é adicionado ao replay.
