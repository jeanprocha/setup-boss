# Setup Boss — Visão de evolução

## Objetivo

Descrição por fases da maturidade do produto, alinhada ao estado do repositório **v2.0.0**.

---

## Fase 1 — MVP

- Plano (**architect**)
- Task e critérios como entrada explícita
- **Alterações no disco feitas fora do pipeline automático** (sem executor integrado)

---

## Fase 2 — Semi-automação

- **Review** orientado a JSON (**`review-output.json`**)
- Loop **correction**
- Logs de corrida e limites configuráveis
- Transição preparada para execução automática no disco (**ainda sem executor PATCH como está hoje**)

---

## Fase 3 — Executor local (**concluída · v2.0.0**)

- **Executor automático**: alterações no disco via **PATCH** (`operation: patch`, **`search`** único, **`replace`**), só **`allowed_files`**, validação em código
- **`run-context.json`** como fonte de verdade compacta entre etapas (**redução de contexto**, menos prompts gigantes)
- **Review** alinhado ao estado persistido e a artefactos compactos quando **`run-context`** é válido
- **Knowledge** persistente no projeto alvo
- **Orquestração com controlo de custo**: modelos por etapa (`core/llm-client.js`) e **`llm_usage`** / **`llm_usage_total`** em **`metadata.json`**
- Histórico por corrida em **`<projeto>/.IA/outputs/<run-id>/`**

---

## Fase 4 — Assistência estrutural maior

- Executor **híbrido** (mais determinístico onde couber + IA onde falta estrutura)
- Parsing mais rígido (HTML/outros) quando o stack permitir
- Validação opcional por build/teste quando existir infraestrutura

---

## Fase 5 — Autonomia aspiracional

- Propostas da IA com gates humanos claros

---

## Estado atual

```text
Fase 3 — Executor por PATCH, run-context, métricas LLM (v2.0.0).
```

O sistema posiciona-se como **orquestrador com controlo de custo e escopo**, não como uma cadeia genérica de prompts sem artefactos nem limites.

---

## Próximo foco documentado

```text
Roadmap STEP 4–6 — optimização de tokens, fallback local/API, executor híbrido.
```
