# Setup Boss — Lista Oficial de Agents

## Objetivo

Registrar a lista oficial de agents do Setup Boss, suas responsabilidades, inputs, outputs e status.

Este arquivo é a fonte oficial para controle de expansão multi-agent.

---

## Agents ativos

| Agent | Arquivo | Status | Responsabilidade única |
|---|---|---|---|
| Project Scan | `agents/project-scan.md` | active | Analisar o projeto e gerar contexto técnico inicial |
| Architect | `agents/architect.md` | active | Planejar a execução da task antes de alterar arquivos |
| Executor | `agents/executor.md` | active | Aplicar mudanças autorizadas aos arquivos reais do projeto alvo |
| Reviewer | `agents/reviewer.md` | active | Validar a entrega contra a task e critérios; priorizar estado real no disco |
| Correction | `agents/correction.md` | active | Gerar instruções de correção a partir do review |
| Knowledge | `agents/knowledge.md` | active | Registrar aprendizados reutilizáveis sem virar log |

---

## Legado (não faz parte do ciclo automático v2)

| Agent | Arquivo | Nota |
|---|---|---|
| Cursor Template | `agents/cursor-template.md` | Era usado quando a execução técnica era manual; o pipeline v2.0.0 usa **`executor`**. |

---

## Pipeline oficial (v2.0.0)

```text
scan → architect → executor → review → correction → executor → knowledge
```
