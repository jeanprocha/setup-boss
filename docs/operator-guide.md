# Guia do operador

## Fluxo oficial recomendado

```
preflight → dry-run → inspect → apply-later → knowledge enrich
```

1. **preflight** — obrigação implícita no `setup-boss run` antes do pipeline principal (confirmações configuráveis).
2. **dry-run** — activar quando políticas ou risco o exigirem (`--dry-run`).
3. **inspect** — `setup-boss inspect latest` (ou run id) para lifecycle temporal e drift.
4. **apply-later** — `setup-boss apply <runId> --confirm` somente com review aprovada e manifest íntegro.
5. **knowledge enrich** — `npm run knowledge` / scripts conforme o vosso processo pós-aprovação.

Complementos úteis:

- `setup-boss doctor` antes de CI ou após upgrades locais.
- `npm run validate:artifacts -- <runId>` equivalente a `validate-run-artifacts.js`.

## Comandos rápidos

| Objetivo | Comando |
|----------|---------|
| Nova corrida | `npm run setup-boss -- run tasks/task.md ../projeto [--dry-run]` |
| Inspecção | `npm run setup-boss -- inspect latest` |
| Lista cronológica | `npm run setup-boss -- list --limit=20` |
| Diagnóstico repo | `npm run setup-boss -- doctor [--strict-runs]` |
| Validar artefactos | `npm run validate:artifacts -- <runId ou pasta>` |
| Replay etapa | `npm run setup-boss -- replay <runId> --from=executor` |
| Resume | `npm run setup-boss -- resume <runId>` |

## Daemon / Runtime API (Fase 3)

| Objetivo | Comando |
|---------|---------|
| Arrancar daemon | `npm run setup-boss -- daemon start` |
| Estado | `npm run setup-boss -- daemon status` |
| Parar | `npm run setup-boss -- daemon stop` |
| Diagnóstico fila/events | `npm run setup-boss -- doctor [--json] [--fix-safe]` |

Variáveis úteis: `SETUP_BOSS_RUNTIME_API_PORT`, `SETUP_BOSS_MAX_WORKERS`, `SETUP_BOSS_DATA_DIR` (estado isolado). Documentação consolidada: **`docs/phase3-runtime-readiness.md`**.

## Variáveis comuns

- `SETUP_BOSS_CLI_ROOT` — quando o CLI corre fora da raíz do repo setup-boss.
- `OPENAI_API_KEY` — obrigatória para qualquer etapa que invoque LLM.
- `SETUP_BOSS_APPLY_CONFIRM=1` — gate alternativo ao `--confirm` em apply-later.

## Pós-release da Fase 2

Correr `npm run test:e2e` em pipelines internos para regressões determinísticas.
