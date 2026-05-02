# Setup Boss — Decisions

## Decisão: Pipeline estruturado

Etapas oficiais dos papéis na ordem conceitual do fluxo:

```text
scan → architect → cursor → review → correction → knowledge
```

A etapa **correction** não roda em toda execução: entra apenas quando o review indica ciclo corretivo. A decisão oficial do review é sempre **`review-output.json`** (ver decisão seguinte sobre JSON).

Ramificações a partir do resultado do Review:

- **`review` com `status: approved`** → executar **knowledge** → encerramento da run (happy path).
- **`review` com `status: rejected`** (tipicamente com `requires_correction: true`) → **correction** → executor técnico (ex.: Cursor) → nova entrada em **`cursor-output.md`** → **review** de novo — loop até aprovação, bloqueio ou limites configurados (`MAX_CORRECTIONS`, `MAX_TOTAL_STEPS`).
- **`review` com `status: blocked`** → parar e reportar; não iniciar looping de correction até destravar definição, ambiente ou task.

Motivo das etapas em ordem: previsibilidade, auditoria e controle ponta-a-ponta.

---

## Decisão: Separação sistema vs projeto

- setup-boss = sistema
- .setup-boss = contexto do projeto

Motivo:
evitar mistura de responsabilidades

---

## Decisão: Knowledge por projeto

Cada projeto mantém seu próprio:

.setup-boss/knowledge-base.md

Motivo:
aprendizado contextualizado

---

## Decisão: Loop de correção

Review reprova com caminho de correção → **correction** gera novo prompt → retorno ao executor técnico (ex.: Cursor) → novo **review**.

Motivo:
reduzir intervenção improvisada e manter problema/solução rastreados no mesmo `outputs/<run-id>/`.

---

## Decisão: Aprovação baseada em JSON estruturado

A decisão oficial do Review vem de:

review-output.json

Formato base:

{
  "status": "approved",
  "acceptance_level": "development",
  "blocking_issues": [],
  "warnings": [],
  "requires_correction": false,
  "summary": "Task validada com sucesso.",
  "markdown_report": "..."
}

Motivo:
evitar parsing frágil de Markdown e tornar o pipeline determinístico.

Regra:
Markdown pode existir como explicação humana, mas nunca como fonte de decisão.
