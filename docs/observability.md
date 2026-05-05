# Setup Boss — Observabilidade

## Pipeline

```text
scan → architect → run-context.json
→ executor (PATCH)
→ review
→ [correction → executor → review]*
→ knowledge
```

---

## Artefactos por corrida (`<projeto>/.IA/outputs/<run-id>/`)

| Artefacto | Função |
|-----------|--------|
| `run-log.json` | Passos da corrida, durações, ficheiros gerados, cache de scan, avisos/erros. |
| `metadata.json` | Dados do projeto, paths da task, agentes, **`llm_usage`**, **`llm_usage_total`**. |
| `run-context.json` | **Fonte de verdade compacta** para executor, review, correction e knowledge quando válido (task resumida, **`allowed_files`**, critérios, foco de review). |
| `scan-input.md` / `scan-output.md` | Prompt e resultado do scan quando integrados ao output da corrida. |
| `architect-input.md` / `architect-output.md` | Entrada/saída do architect. |
| `executor-input.md`, `executor-output.md`, `executor-result.json`, `executor-changes.json` | Evidência do **executor** (PATCH aplicado ou bloqueado). |
| **`review-output.json`**, `review-output.md` | Decisão estruturada (**fonte de decisão do review**) + relatório legível. |
| `correction-instructions.md` | Instruções para a próxima volta do **executor**. |
| `knowledge-update.md` | Bloco gerado na etapa knowledge (também append em **`.setup-boss/knowledge-base.md`** no projeto). |
| `ia-diagnostics.json` | Quando o fluxo pede modo diagnóstico da **`.IA`** no output da corrida. |

---

## Uso de LLM (`metadata.json`)

- **`llm_usage`** — objeto indexado por **chave de etapa** (ex.: `scan`, `architect`, `executor`, `review`, `correction`, `knowledge`, `ensure_ia`, `semantic_ia`). Cada entrada inclui modelo usado, contagens de tokens (**`input_tokens`**, **`output_tokens`**, **`total_tokens`**) quando a API informa, e **`estimated_cost_usd`** quando há preços configurados em env.
- **`llm_usage_total`** — soma agregada dos tokens e dos custos **onde há valor numérico** por etapa (ver implementação em **`core/llm-usage.js`**).

### Custo estimado

- Derivado de envs opcionais no formato **`{MODELO_NORMALIZADO}_INPUT_USD_PER_1M`** e **`_OUTPUT_USD_PER_1M`** (ver **`.env.example`** e **`modelPricingEnvPrefix`** em **`core/llm-usage.js`**).
- Se as taxas não estiverem definidas ou o modelo não mapear: **`estimated_cost_usd`** pode ser **`null`** — os tokens podem ser zero ou vindos da API.

### Limitações

- Depende de **`response.usage`** (ou equivalente) devolvido pela API; se vazio, os contadores podem ficar em zero e o custo em **`null`**.
- O architect **preserva** **`llm_usage`** já existente ao gravar **`metadata.json`** final (ex.: uso do scan gravado antes), conforme **`loadPreservedLlmUsage`** em **`scripts/architect.js`**.

---

## Logs no terminal

- Mensagens por script (`[SCAN]`, `[ARCHITECT]`, `[EXECUTOR]`, etc.).
- Após chamadas instrumentadas em **`core/llm-client.js`**: linhas compactas com modelo e tokens/custo por etapa (quando disponível).

---

## Passos no `run-log.json`

- Cada entrada em **`steps`** pode incluir referência a uso de LLM quando o passo corresponde a uma etapa instrumentada e o log foi atualizado.

---

## Boas práticas para diagnóstico

1. Confirmar **`review-output.json`** para o estado da corrida.
2. Comparar **`executor-changes.json`** com o disco no **`projectRoot`** de **`metadata.json`**.
3. Inspecionar **`llm_usage`** / **`llm_usage_total`** para ordem de grandeza de custo/tokens entre corridas (com paridade de modelo e preços nas envs).
