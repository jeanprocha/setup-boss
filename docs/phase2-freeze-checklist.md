# Checklist — “Fase 2 está estável”

Use esta lista antes de declarar o baseline empresarial **local** congelado.

## Execução

- [ ] `npm run test:e2e` passa sem falhas.
- [ ] `node scripts/runtime/replay/continuity.test.js` passa (`npm run test:continuity`).
- [ ] `node scripts/runtime/governance/governance.test.js` passa (`node --test`).
- [ ] `npm run setup-boss -- doctor` retorna exit 0 no repo limpo.

## Lifecycle & artefactos

- [ ] `validate-run-artifacts.js` não reporta erros nas últimas runs “golden”.
- [ ] Nenhuma run produtiva com `STALE_MANIFEST`.
- [ ] Checkpoints (`runtime-checkpoints.json`) válidos (`schema_version: 1`).

## Replay / resume / apply-later

- [ ] Fluxo dry-run → inspect → apply demonstrado num projeto real (cenário B).
- [ ] Apply físico bloqueado quando review ≠ approved (confirmado).
- [ ] Resume compreensível para equipa (`inspect` mostra próximo passo).

## Governance

- [ ] Política activa documentada (`.setup-boss/policy.json` ou defaults conscientemente aceites).
- [ ] Bypass e overrides só com processo interno de auditoria.

## Recovery

- [ ] Operadores sabem interpretar `recovery-log.json` e estados `RETRY_EXHAUSTED`.

## Documentação

- [ ] Links internos deste pacote (`docs/*.md`, `PHASE2_BASELINE.md`) revistos.
- [ ] Relatório JSON `.setup-boss/reports/e2e-phase28-last.json` arquivado para a baseline.

## Limitações aceites

- [ ] Equipa reconhece ausência de daemon/fila/server multi-agent (planeadas para fases futuras).
