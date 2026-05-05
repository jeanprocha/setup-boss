# Setup Boss — Plano

## Pipeline oficial (v2.0.0)

```text
scan → architect → run-context.json
→ executor (PATCH)
→ review
→ [correction → executor → review]*
→ knowledge
```

---

## Fluxo resumido

1. **scan** — capta contexto técnico do projeto alvo (com cache opcional).
2. **architect** — plano, enforcement e escrita de **`run-context.json`** (fonte de verdade compacta: task, **`allowed_files`**, critérios, foco de review).
3. **executor** — aplica alterações por **PATCH** (`search` único por ficheiro, `replace`), só em **`allowed_files`**, validado em código.
4. **review** — decisão em **`review-output.json`**.
5. Se **`rejected`** com correção — **correction** gera instruções → novo **executor** → novo **review** (até `approved`, `blocked` ou limites).
6. **knowledge** — apenas com **`approved`**; atualiza conhecimento local do projeto.

---

## Estado atual

- **Fase 3 concluída**: executor automático, **sem** dependência de edição manual como passo oficial do pipeline.
- **`run-context.json`** reduz contexto entre etapas em relação a prompts monolíticos.
- Loop de correction integrado em **`scripts/run.js`** (`MAX_CORRECTIONS`, `MAX_TOTAL_STEPS`).

---

## Próximas evoluções (roadmap STEP 4–6)

- Optimização mais agressiva de tokens entre etapas.
- Fallback inteligente (local vs API) onde couber.
- Executor híbrico (mais determinístico + PATCH onde necessário).

---

## Riscos conhecidos

- Task mal definida → mais voltas no ciclo correction/executor/review.
- PATCH com **`search`** ambíguo ou inexistente → falha de aplicação registada nos artefactos do executor.
- Métricas **`llm_usage`** dependem da API devolver `usage` por chamada.
