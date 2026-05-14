# Governance — políticas e overrides

## Fontes de verdade

- Merge dinâmico via `loadMergedPolicy` (`scripts/runtime/governance/policy-loader.js`): `.setup-boss/policy.json`, env (`SETUP_BOSS_POLICY_*`), overrides de CLI e bypass explícitos.
- Artefactos por corrida: **`policy-report.json`** (snapshot) e **`governance-decisions.json`** (decisões + auditoria de overrides físicos).

## Perfis

`FAST`, `NORMAL`, `STRICT`, `ENTERPRISE` — valores por defeito em `profiles.js`. **STRICT** exige dry-run para elevados riscos / runtime core / migrações e segurança quando não há bypass.

### Overrides auditados

- `--force-policy-bypass` / `SETUP_BOSS_FORCE_POLICY_BYPASS=1`: permite fluxos contra políticas que normalmente bloqueiam — registados nos relatórios.
- `--disable-governance`: modo equivalente a política desactivada para desenvolvimento; não usar em pipelines formais.

## Dry-run obrigatório (cenário E — STRICT)

Sinais de tarefa e relatório de preflight combinados determinam `mandated_dry_run`. Sem `--dry-run` e sem bypass adequado, o pipeline deve registar decisões **MANDATORY_DRY_RUN** com eventual bloqueio em perfis “hard gate”. Ver suites em `scripts/tests/e2e/e2e-runner.js`.

## Apply físico

`evaluateApplyGovernance` avalia paths tocados contra lista protegida antes de aplicar patches gravados em `executor-changes.json`. O resultado é anexado a `governance-decisions.json` em `physical_apply_audit`.

## Ferramentas

- `setup-boss doctor` — smoke das políticas e estrutura.
- `node scripts/validate-run-artifacts.js` — integridade de artefactos por corrida.
