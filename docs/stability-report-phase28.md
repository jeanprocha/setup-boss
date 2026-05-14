# Relatório de estabilidade — Fase 2.8

## Onde está o relatório máquina

Cada execução de `npm run test:e2e` gera:

`.setup-boss/reports/e2e-phase28-last.json`

Campos principais:

- `ok` — todas as verificações determinísticas passaram.
- `scenarios` — lista nominal dos cenários executados.
- `edge_cases_observed` — falhas capturadas na última corrida (se vazio, nenhuma regressão detectada na suite).

## Pontos fortes (baseline)

- Validação offline de manifest/drift/resume/governance sem custo LLM.
- CLI (`doctor`, `inspect`, `validate-run-artifacts`) orientada a auditoria.
- Continuity tests cobrem apply-later feliz e drift.

## Limitações / gaps conscientes

- Cenários **A** e **C** completos com LLM não fazem parte da suite CI determinística — executar manualmente com credenciais quando necessário.
- Stress massivo (centenas de replays) não está automatizado; avaliar conforme necessidade.

## Histórico de hardening (sumário)

- Validador aceita pastas com `metadata.json` para auditorias fora do resolver estrito.
- Flag `--report-json` evita corrupção da stdout em ambientes instrumentados.
- `doctor` não falha apenas por runs antigas degradadas (modo estrito opt-in).
