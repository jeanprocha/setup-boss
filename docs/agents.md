
---

# `docs/agents.md`

```md
# Setup Boss — Lista Oficial de Agents

## Objetivo

Registrar a lista oficial de agents do Setup Boss, suas responsabilidades, inputs, outputs e status.

Este arquivo é a fonte oficial para controle de expansão multi-agent.

---

## Agents ativos

| Agent | Arquivo | Status | Responsabilidade única |
|---|---|---|---|
| Project Scan | `agents/project-scan.md` | active | Analisar o projeto e gerar contexto técnico inicial |
| Architect | `agents/architect.md` | active | Planejar a execução da task antes de qualquer código |
| Cursor Template | `agents/cursor-template.md` | active | Orientar a execução técnica no Cursor conforme plano aprovado |
| Reviewer | `agents/reviewer.md` | active | Validar a entrega contra a task e critérios definidos |
| Correction | `agents/correction.md` | active | Gerar instruções de correção a partir do review |
| Knowledge | `agents/knowledge.md` | active | Registrar aprendizados reutilizáveis sem virar log |

---

## Pipeline oficial

```text
scan → architect → cursor → review → correction → knowledge