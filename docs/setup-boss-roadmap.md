# Setup Boss — Roadmap

## Pipeline em produção

```text
scan → architect → run-context.json
→ executor (PATCH)
→ review
→ [correction → executor → review]*
→ knowledge
```

O comando **`npm run run`** automatiza até **knowledge** quando o review fica **`approved`**. Se o review pedir correção, o ciclo **correction → executor → review** repete até aprovação, **`blocked`**, ou limites (**`MAX_CORRECTIONS`**, **`MAX_TOTAL_STEPS`**) em **`scripts/run.js`**.

---

## Concluído (estado atual do código)

- **`run-context.json`** — gerado pelo architect; inclui task resumida, **`allowed_files`**, critérios de aceite, **`review_focus`**, estado do architect (**`scripts/architect.js`**).
- **Executor por PATCH** — schema com **`operation: patch`**; **`search`** deve ocorrer **exactamente uma vez** no ficheiro alvo; escopo limitado a **`allowed_files`** (**`scripts/executor.js`**).
- **Review JSON-first** — **`review-output.json`**; uso de **run-context** quando válido para prompts mais curtos (**scripts/review.js** e leitura de artefactos).
- **Modelos por etapa** — **`core/llm-client.js`**, variáveis **`ARCHITECT_MODEL`**, **`EXECUTOR_MODEL`**, etc., fallback **`OPENAI_MODEL`**.
- **Tracking** — **`core/llm-usage.js`**; **`metadata.json`** com **`llm_usage`** (por chave de etapa) e **`llm_usage_total`** em **`<projeto>/.IA/outputs/<run>/`**; inclui **`scan`**, **`ensure_ia`**, **`semantic_ia`** quando aplicável ao fluxo.

---

## Próximos passos declarados

### STEP 4 — Optimização agressiva de tokens

- Reduzir texto redundante entre etapas dentro do que o contrato dos artefactos permitir.
- Políticas de truncagem e resumos alinhadas aos consumidores existentes.

### STEP 5 — Fallback inteligente (local/API)

- Caminhos locais determinísticos onde fizer sentido.
- API só onde o ganho compensar custo e complexidade.

### STEP 6 — Executor híbrido (mais determinístico)

- Mais edições guiadas por estrutura (marcadores, slots), mantendo PATCH onde for necessário.
- Parsing mais rígido quando o stack do projeto permitir.

---

## Regras de evolução

- Manter invariantes dos consumidores de artefactos (**`review-output.json`**, **`executor-changes.json`**, etc.) salvo migração explícita.
- Review continua no caminho padrão antes de knowledge com aceitação.
- Não expandir escrita automática para fora do whitelist da corrida (**`allowed_files`**).

---

## Critério de sucesso (contínuo)

- Execução end-to-end até knowledge **sem passo manual de edição** no mesmo run quando não há bloqueio.
- Custos e tokens observáveis por etapa nos artefactos da corrida.
- Menos tokens por run mantendo critérios de aceite atendidos em tasks válidas.
