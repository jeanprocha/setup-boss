# Setup Boss — Lista oficial de agents

## Objetivo

Registrar agents do Setup Boss, responsabilidades e relação com o pipeline e os artefatos em disco.

---

## Agents ativos (prompts em `agents/`)

| Agent | Ficheiro | Responsabilidade única |
|-------|----------|-------------------------|
| Project Scan | `project-scan.md` | Relatório técnico inicial do projeto (stack, estrutura, riscos). Usado pelo fluxo de scan. |
| Architect | `architect.md` | Plano antes de tocar em ficheiros; saída validada em Markdown com secções obrigatórias; alimenta **run-context.json**. |
| Executor | `executor.md` | Aplicar alterações autorizadas via **PATCH** (`search`/`replace`) só em paths permitidos. |
| Reviewer | `reviewer.md` | Validar entrega contra task/nível de aceite; saída JSON + relatório Markdown. |
| Correction | `correction.md` | Instruções objetivas para o próximo executor após review reprovado. |
| Knowledge | `knowledge.md` | Atualização concisa de knowledge reutilizável (não é log da corrida). |

---

## Agent auxiliar (fora do ciclo `run` principal)

| Uso | Ficheiro | Nota |
|-----|----------|------|
| Bootstrap / `.IA` por IA | `project-profile.md` | Usado por `ensure-ia.js` em modos que chamam LLM (ex.: `--full`, enriquecimento semântico após run aprovado). Não é uma etapa nomeada igual às do `run.js`. |

---

## Legado

| Ficheiro | Nota |
|----------|------|
| `cursor-template.md` | Legado de modelo para execução manual; o pipeline atual usa **executor** automático (PATCH). |

---

## Pipeline oficial e artefatos

```text
scan → architect → run-context.json
→ executor (PATCH)
→ review
→ [correction → executor → review]*
→ knowledge
```

- **run-context.json** não é um agent; é **JSON** gerado pelo script **architect** a partir da task e do output do architect.
- Cada agent acima corresponde a um script que monta o prompt e chama o modelo via `core/llm-client.js` (modelo por etapa).
