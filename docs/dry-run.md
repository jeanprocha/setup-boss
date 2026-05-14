# Dry-run — overlay, preview e apply

## Semântica

Em `--dry-run` (ou `SETUP_BOSS_DRY_RUN=1`), o executor pode aplicar patches em modo seguro no modelo virtual e gravar:

- **`virtual-project-overlay.json`** — mapa UTF-8 das alterações virtuais.
- **`patch-preview.md`** / **`patch-preview-summary.json`** — resumo humano e estruturado.
- **`patch-manifest.json`** — hashes baseline dos ficheiros no disco antes do apply físico, fingerprint de `executor-changes.json`, operações ordenadas.

## Fluxo recomendado (cenário B)

1. Correr pipeline com `--dry-run`.
2. `setup-boss inspect latest` — rever métricas, governança e drift se aplicável.
3. Quando aprovado: `setup-boss apply <runId> --confirm`.

## Governança + dry-run

Perfis **STRICT** / **ENTERPRISE** podem **mandar** dry-run para classes de risco. Consultar `evaluateRuntimeGovernance` e `preflight-summary.md` gerados na corrida.

## Validação

- `validate-run-artifacts.js` verifica presença coerente de manifest/changes/context quando `pending_apply` está activo.
- Opção `--report-json=<ficheiro>` grava um relatório JSON **sem depender da stdout** (útil em CI ou quando há wrappers no terminal).

## Limitações

Dry-run não substitui testes do projecto alvo; apenas garante que o patch reproduzível está documentado e aplicável mais tarde sem LLM.
