# Setup Boss — AI Session Bootstrap

## Objetivo

Dar contexto mínimo para uma IA trabalhar num novo chat sobre o Setup Boss.

Este ficheiro **não** é uma task. Não ordena implementação.

---

## O que é

Orquestrador de execução sobre um **projeto alvo** com:

- **Scan** — contexto técnico do projeto; pode usar cache (**`ENABLE_SCAN_CACHE`**).
- **Architect** — plano, enforcement e geração de **`run-context.json`** (resumo da task, critérios de aceite, **`allowed_files`**, foco de review).
- **Executor** — alterações por **PATCH** no schema atual: **`operation: patch`**, **`search`** (uma ocorrência no ficheiro), **`replace`**; apenas paths em **`allowed_files`**; validação em **`scripts/executor.js`** (não reescreve ficheiro inteiro pela resposta do modelo).
- **Review** — **`review-output.json`**; quando **`run-context.json`** é válido e utilizado, os prompts evitam colar task/scan/architect completos.
- **Correction** — instruções curtas para a próxima volta do **executor**.
- **Knowledge** — apenas após **`approved`**; atualiza knowledge local e pode acionar enriquecimento em **`docs/.IA/`** (legado: **`.IA/`** na raiz).

**Telemetria**: cada corrida pode registar em **`<projeto>/docs/.IA/outputs/<run-id>/metadata.json`** (legado: **`<projeto>/.IA/outputs/<run-id>/metadata.json`**) os campos **`llm_usage`** e **`llm_usage_total`** (ver **`core/llm-usage.js`**). Modelos por variáveis **`_*_MODEL`**, fallback **`OPENAI_MODEL`**. O índice **`setup-boss/.setup-boss/runs/<run-id>.json`** liga o run id à pasta de output no projeto alvo.

---

## Pipeline atual

```text
scan → architect → run-context.json
→ executor (PATCH)
→ review
→ [correction → executor → review]*
→ knowledge (se approved)
```

O loop e os limites vêm de **`scripts/run.js`** (`MAX_CORRECTIONS`, `MAX_TOTAL_STEPS`). **`blocked`** no review não segue o mesmo caminho que **`rejected`** com **`requires_correction`**.

---

## Estado atual (código)

- **v2.0.0**: executor por PATCH e **run-context** operacionais.
- **Redução de contexto**: snippets/truncagens no executor; review com foco em evidência de PATCH e **`review-output.json`** quando há run-context.
- **Determinístico onde o código impõe**: validação de paths, **`allowed_files`**, aplicação de PATCH (unicidade de **`search`**), schemas JSON nas etapas que os consomem.

---

## Evolução prevista (alto nível)

Ver **`docs/setup-boss-roadmap.md`** (STEP 4–6: tokens, fallback local/API, executor híbrido).

---

## Como trabalhar neste repo

- Não assumir ficheiros que não foram abertos ou citados.
- Não implementar sem uma atividade explícita do utilizador.
- Para mudanças no sistema, validar comportamento nos **scripts** e **core**, não só neste bootstrap.

---

## Instrução ao novo chat

Depois de ler os docs indicados pelo utilizador, confirmar entendimento em poucas frases e perguntar qual **atividade** segue.
