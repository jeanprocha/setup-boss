# Phase 2 — Baseline de runtime (congelamento operacional)

Documento de referência para a **Fase 2 estável** (local, single-process). Actualização sugerida quando entrarem daemon/queue/orchestration server (Fase 3+).

## Capabilities

- Pipeline **preflight** (análise, custos heurísticos, governança espelhada em relatório).
- **Dry-run** com overlay virtual, pré-visualização de patch e manifest determinístico.
- **Apply-later** físico só via CLI (`setup-boss apply`) com gates de governança e anti-duplicação.
- **Replay** selectivo (`executor` → `review` → `correction`) usando artefactos persistidos.
- **Resume** com avaliação de segurança (`assessResume`) e continuação por fase.
- **Checkpoints** (`runtime-checkpoints.json`) com hashes de artefactos.
- **Recovery** (retries, orçamentos, classificação de falhas, artefactos `recovery-log.json`, etc.).
- **CLI**: `list`, `status`, `inspect`, `doctor`, `apply`, `replay`, `resume`, `run`.

## Lifecycle

Os valores formais estão em `RUNTIME_LIFECYCLE` (ver `scripts/runtime/replay/lifecycle.js`). Guia narrativo: [docs/runtime-lifecycle.md](docs/runtime-lifecycle.md).

## Artefactos

- Índice global: `.setup-boss/runs/<runId>.json`.
- Saída por corrida: `<projeto>/.IA/outputs/<runId>/` (legado: `outputs/<runId>/`).
- Manifest / drift / overlay: ver [docs/dry-run.md](docs/dry-run.md).

Validação programática:

- `node scripts/validate-run-artifacts.js <runId|dir> [--report-json=caminho]`
- `npm run setup-boss -- doctor [--strict-runs]`

## Governance

Perfis `FAST | NORMAL | STRICT | ENTERPRISE`, merges em `.setup-boss/policy.json`, relatórios `policy-report.json` / `governance-decisions.json`. Detalhe: [docs/governance.md](docs/governance.md).

## Telemetry

Métricas de prompts (`prompt-sizes.json`), uso LLM agregado em `metadata.json` / `run-log.json`, códigos de governança no relatório de preflight.

## Recovery

Retries hierárquicos, budgets, estratégias por classe de falha; estado pode transitarem para `RECOVERY_FAILED` ou `RETRY_EXHAUSTED`. Detalhe: [docs/recovery-system.md](docs/recovery-system.md).

## Limitações conhecidas (Fase 2)

- Sem daemon nem fila: apenas execução invocada pelo operador ou CI.
- Replay/resume que **chama LLM** exige credenciais e não faz parte da suite E2E determinística padrão.
- Runs sem `patch-manifest.json` são tratadas como **legadas / incompletas** nos validadores.
- Índices (`.setup-boss/runs/*.json`) podem apontar para projetos movidos — o **doctor** assinala órfãos.

## Compatibilidade

| Situação | Comportamento esperado |
|----------|-------------------------|
| Índice com pasta ausente | Doctor aviso / erro estrutural; inspect pode omitir entrada dependendo da descoberta. |
| `metadata.json` / JSON corruptos em artefactos | CLI usa `readJsonSafe`; estado aparece como `UNKNOWN`/omitido sem crash (sujeito aos caminhos de código cobertos). |
| Manifest stale vs `executor-changes.json` | `validateLifecycleConsistency` → `STALE_MANIFEST`; apply-later deve falhar. |
| Governança ausente em runs antigas | Warning apenas nas suites que compararem relatórios. |

## Testes & relatório de estabilidade

- `npm run test:e2e` — suite Fase 2.8 (sem LLM).
- Relatório JSON gerado: `.setup-boss/reports/e2e-phase28-last.json`.

Ver também [docs/phase2-freeze-checklist.md](docs/phase2-freeze-checklist.md).
