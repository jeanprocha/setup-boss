# Governança `.IA` — UX operacional (Phase 10)

Guia para operadores no Mission Control: onboarding, troubleshooting e ciclo de validação **sem** alterar regras de governance.

## Bootstrap `.IA` {#bootstrap}

1. No **projecto-alvo** (não no repo Setup-Boss), crie `docs/.IA/`.
2. Adicione o seed mínimo SPEC v1.0:
   - `docs/.IA/index.md` com `Version: 1.0`
   - `docs/.IA/system/seed-rules.md`
   - `docs/.IA/system/bootstrap-discovery.md`
   - `docs/.IA/system/bootstrap-create.md`
3. Complete a estrutura governada (domínios + `index-*.md`) — ver `docs/.IA/system/structure-rules.md`.
4. `git add docs/.IA` e commit.
5. No Mission Control: cartão **`.IA` Governance** → **Revalidar**.

## Execution readiness

| Estado | Significado |
|--------|-------------|
| **Ready** | KB validada; pode iniciar execução |
| **Warning** | Execução permitida; rever drift ou content policy |
| **Blocked** | Corrigir violação antes do intake |

## Falhas comuns

| Sintoma | Causa típica | Acção |
|---------|--------------|--------|
| Missing `.IA` | Pasta inexistente | Bootstrap + commit |
| Untracked | Ficheiros locais sem Git | `git add docs/.IA` |
| Invalid seed | Ficheiros seed em falta | Completar seed v1.0 |
| Invalid structure | Domínios/index em falta | Estrutura core SPEC |
| Structural drift | Pastas/ficheiros extra críticos | Remover ou corrigir paths |
| Unsupported version | `Version:` ≠ 1.0 | Corrigir `index.md` |
| Sensitive data | Padrão de segredo na `.IA` | Remover credenciais reais |
| Language warning | Heurística PT/ES | Documentar em inglês (aviso) |

## SPEC suportadas

- **1.0** — única versão suportada pelo runtime actual.

Versões futuras exigem actualização do pipeline; ver `docs/governance/ia-validation-pipeline.md`.

## Ciclo de validação

```
Git → Seed → Version → Structure → Drift → Policy
```

- **Git**: presença, track, ignore, path `docs/.IA`
- **Seed … Policy**: pipeline partilhado (`runIaGovernanceValidationPipeline`)
- Métricas em `validationSnapshot` (duração, ficheiros lidos, timings por stage)

## API operacional

`GET /projects/{projectId}/governance` — validação on-demand (retry no UI).

Resposta inclui: `readiness`, `headline`, `summary`, `timeline`, `reportText`, `validationSnapshot`, `iaValidation` (em falhas).

## Troubleshooting rápido

1. Abrir **Observabilidade** → cartão de governança + timeline.
2. **Copiar relatório** — partilhar com equipa (inclui snapshot e checks).
3. Seguir **ações sugeridas** no diagnóstico pre-run após falha de intake.
4. **Revalidar** após correcções no repo.

## Referências

- [Pipeline de validação](./ia-validation-pipeline.md)
- `docs/.IA/system/bootstrap-create.md` no projecto-alvo
