# Relatório — Discovery: WorkspaceRun unificado com pipeline Run normal

**Data:** 2026-05-18  
**Tipo:** discovery only (sem alteração de código)

---

## Problema

O WorkspaceRun expunha cedo Git agregado, mini-atividades e **Start**, sem intake/clarificação/plano/OES. Isso gerava UX paralela ao Run normal e erro `workspace_run_no_mini_activities`.

## Situação actual (resumo)

| Camada | Run normal | WorkspaceRun |
|--------|------------|--------------|
| Criação | `POST /runs` | `POST /workspace-runs` + (novo) run de planeamento |
| UI central | `RunViewShell` + 7 fases | `WorkspaceRunViewShell` operacional **ou** RunViewShell em planeamento |
| Execução | Pipeline single-repo | Orquestrador + runs filhas |

Correcções recentes (2026-05-18): create sem minis; `planningRunId` no `globalSpec`; gating Start/Git. **Gap principal:** OES → materialização automática de `miniActivities`.

## Recomendação

**Modelo híbrido (canónico de produto):**

- **WorkspaceRun** = envelope multi-projeto.
- **Fases 1–6** = mesmo pipeline `/runs` (run de coordenação + `globalSpec.projectIds`).
- **Fases 7–10** = minis + git agregado + orquestrador (backend actual).

Não substituir o Run por um runtime novo; não manter dois fluxos visuais de planeamento.

## Roadmap incremental

| Fase | Entrega |
|------|---------|
| **A** | Intake/clarificação/plano unificados (parcialmente feito) |
| **B** | Timeline e `OperationalPhaseStack` com contexto workspace |
| **C** | OES multi-projeto real |
| **D** | Materialização `miniActivities` pós-estratégia |
| **E** | Git agregado só pós-aprovação + minis |
| **F** | Execução sequencial com UX conversacional |
| **G** | Review/correção multi-repo |

## Riscos principais

- Dessincronia `workspaceRunId` ↔ `planningRunId`
- Plano ainda single-repo na planning run com spec multi-projeto
- Regressão do fluxo single-project na sidebar

## Documento completo

`docs/discovery/workspace-run-unified-pipeline-discovery.md`

## Próximo passo sugerido (implementação futura)

Fase **C + D**: job que, após estratégia aprovada na planning run, projecta OES em `WorkspaceRun.miniActivities` e dispara transição UI operacional — sem novo endpoint paralelo, apenas extensão do strategy/materialize existente.
