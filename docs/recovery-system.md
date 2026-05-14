# Recovery — retries e recuperação

## Objectivos

Transformar falhas transitórias do executor/provider em **ações recuperáveis** com limites explícitos de orçamento e telemetria persistente.

## Componentes principais

- **Classificação**: `failure-classifier.js` — distingue falhas de rede vs JSON malformado vs bloqueios de patch (“search not found”).
- **Orçamentos**: `retry-budget.js` — consumo por canal (`executor_micro_retry`, `provider_retry`, etc.).
- **Backoff**: `backoff.js` — espaçamento entre tentativas.
- **Loop**: `executor-recovery-loop.js` — integra retries antes de declarar falha macro.
- **Artefactos**: `recovery-artifacts.js` — histórico em `recovery-log.json`, diagnósticos opcionais em texto.

## Estados no lifecycle

Transições típicas (quando activas):

- `EXECUTING` → `RECOVERING` → `RECOVERED` ou `RECOVERY_FAILED` / `RETRY_EXHAUSTED`.

Estados finais de exhaustion devem aparecer no inspect temporal.

## Cenário C (executor failure → recovery → success)

Requer corrida real com LLM ou ambiente controlado; a suite base cobre **classificação e budgets** em `scripts/tests/e2e/e2e-runner.js` + `recovery.test.js`.

## Boas práticas operacionais

1. Após falhas recuperadas, verificar `recovery-log.json` e `executor-result.json`.
2. Se corruption persistente de JSON do modelo — guardar evidências antes de replay.
3. Retry exhaustion não deve ser silenciosamente sobrescrito por replay sem nova decisão humana.
