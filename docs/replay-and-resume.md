# Replay, resume e apply-later

## Apply-later (determinístico)

Depois de uma corrida **dry-run** aprovada pelo review:

1. Confirme drift (`inspect` mostra resumo temporal).
2. `setup-boss apply <runId> --confirm` (ou `SETUP_BOSS_APPLY_CONFIRM=1`).

O motor em `apply-later.js` verifica:

- `pending_apply` e `mode: dry_run` em `metadata.json`.
- Integridade **manifest ↔ executor-changes**.
- Baseline do projecto contra `patch-manifest.json` (hashes pré-apply).

## Replay

`setup-boss replay <runId> [--from=executor|review|correction]` reexecuta uma etapa usando contexto já materializado no diretório da corrida.

- Entra em `REPLAYING` e restaura o estado anterior ao terminar (salvo artefactos actualizados pela etapa).
- **Chama LLM** nas etapas correspondentes — use apenas quando necessário.

### Stress / consistência

- Reexecutar replay múltiplas vezes não deve corromper o manifest se `executor-changes.json` não for alterado.
- Manifest stale deve falhar apply-later por segurança.

## Resume

`setup-boss resume <runId>`:

1. `assessResume` valida artefactos mínimos (executor resultado, scan/arquitecto em disco conforme o caso, manifest íntegro se existir).
2. Continua em `startFlowResume` na próxima fase determinada (`executor`, `review`, `correction`).

### Scan vs pasta da corrida

O resume espera `scan-output.md` **no diretório da corrida** (output dir), não apenas no root do projeto.

### Fluxos combinados

- Recovery pode preceder resume quando executor volta depois de micro-retries.
- Correção macro volta ao executor após instruções persistidas.

## Inspect temporal

`setup-boss inspect` agrega lifecycle, replay disponível, resume disponível e drift via `temporal-status.js`.
