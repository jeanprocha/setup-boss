# Setup Boss — Evolução do projeto

## Objetivo

Registar a evolução real do sistema por fase, **sem descrever comportamento que não exista no código**.

---

## Fase 1 — MVP (histórico)

- **Architect** e plano textual
- Alterações no repo **fora do orquestrador** (sem executor integrado)
- **Sem** executor automático no pipeline

---

## Fase 2 — Semi-automação

- **Review** com decisão em **`review-output.json`**
- Loop **correction** com instruções para a volta seguinte
- **`run-log.json`** e limites (**`MAX_CORRECTIONS`**, **`MAX_TOTAL_STEPS`**)
- Cache de scan (**`ENABLE_SCAN_CACHE`**)
- Knowledge estruturado por projeto (**`.setup-boss/knowledge-base.md`**)

Pipeline típico **antes** do executor integrado:

```text
scan → architect → (alterações fora do executor, histórico) → review → correction → …
```

---

## Fase 3 — Executor local (**v2.0.0**, estado atual)

Inclui o comportamento **atual** do repositório:

- **Executor automático** com resposta estruturada **PATCH** (`operation: patch`): **`search`** com uma única ocorrência no ficheiro, **`replace`**; validação e escrita em **`scripts/executor.js`**
- **`run-context.json`** gerado pelo **architect** (`buildRunContext` em **`scripts/architect.js`**) com **`allowed_files`**, resumo da task, critérios e foco de review
- **Pipeline completo** orquestrado por **`npm run run`**:

```text
scan → architect → run-context.json
→ executor (PATCH)
→ review
→ [correction → executor → review]*
→ knowledge
```

- **Review** com uso preferencial de **`run-context.json`** quando válido, reduzindo dependência de colar task/scan/architect completos
- Memória **`.IA`** e knowledge no projeto alvo
- **Modelos por etapa** (`core/llm-client.js`)
- **Métricas**: **`core/llm-usage.js`**; **`metadata.json`** com **`llm_usage`** e **`llm_usage_total`**; inclui etapas auxiliares (**`ensure_ia`**, **`semantic_ia`**) quando disparadas no fluxo

---

## Fase 4 — Executor híbrido e validação mais forte

- Mais caminhos determinísticos onde o projeto permitir
- Parsing estruturado onde couber
- Validação opcional (build/test) com infraestrutura disponível

---

## Fase 5 — Sistema autónomo (aspiracional)

- Propostas com gates humanos organizacionais
- Execução contínua com salvaguardas

---

## Estado atual

```text
Fase 3 concluída nas funcionalidades principais (v2.0.0):
run-context, PATCH, métricas LLM (llm_usage), redução de contexto entre etapas.
Próximo foco: roadmap STEP 4–6.
```
