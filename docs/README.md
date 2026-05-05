# Setup Boss

> **v2.0.0** — Orquestrador de execução sobre o **projeto alvo**, com **controlo de custo** (contexto compacto via **run-context**, alterações por **PATCH**, modelos por etapa, métricas **`llm_usage`**).

---

## O que é

O Setup Boss coordena um pipeline de IA sobre uma **task** e um **projeto alvo**. Não é apenas uma sequência de chamadas ao modelo: existe **fonte de verdade persistida** (**`run-context.json`**, estado em disco por corrida), **limites de escopo** (**`allowed_files`**, validação de caminhos) e **telemetria** de tokens e custo estimado por etapa em **`metadata.json`** (`llm_usage`, `llm_usage_total`), quando a API devolve `usage`.

---

## Pipeline oficial

```text
scan → architect → run-context.json
→ executor (PATCH)
→ review
→ [correction → executor → review]*
→ knowledge
```

- **scan**: pode ser omitido quando o cache de scan está válido (`ENABLE_SCAN_CACHE`); o output da corrida pode ainda assim incluir scan copiado em cache.
- **architect**: produz o plano, valida enforcement, escreve **`run-context.json`** e artefactos da corrida no diretório de output.
- **run-context.json**: geração pelo architect; agrega resumo da task, critérios de aceite, **`allowed_files`**, foco de review e metadados de execução — **substitui a necessidade de injetar task/scan/architect completos** nas etapas seguintes quando válido.
- **executor**: resposta estruturada com **`operation: "patch"`** por alteração; cada patch usa **`search`** (trecho que deve ocorrer **exactamente uma vez** no ficheiro) e **`replace`**; não há modo suportado de reescrever o ficheiro inteiro via o schema atual. Escrita no disco só para paths em **`allowed_files`**, com validação em código (`scripts/executor.js`).
- **review**: decisão em **`review-output.json`**; prompts tendem a ser menores quando **`run-context.json`** é utilizável.
- **correction → executor → review**: repete até `approved`, `blocked` ou limites (`MAX_CORRECTIONS`, `MAX_TOTAL_STEPS`) definidos em **`scripts/run.js`**.
- **knowledge**: só após review **`approved`**; atualiza conhecimento local do projeto e pode acionar enriquecimento `.IA` quando aplicável.

---

## Ramificações (review)

| Resultado | Efeito |
|-----------|--------|
| `approved` | Segue para **knowledge**. |
| `rejected` com `requires_correction` | **correction** → **executor** → **review** (iterativo até limites). |
| `blocked` | A corrida termina sem o loop típico de correction. |

Fonte: **`review-output.json`** e **`scripts/run.js`**.

---

## Estrutura (repositório setup-boss)

```text
agents/       prompts dos agents
context/      leitura no scan (visão global do sistema)
core/         llm-client, llm-usage, run-resolver, problem-history, agent-metadata
docs/         documentação operacional
.setup-boss/  cache global (ex.: scan)
scripts/      scan, architect, executor, review, correction, knowledge, run, …
```

Índice de corridas: **`setup-boss/.setup-boss/runs/<run-id>.json`** aponta para a pasta de output no projeto alvo.

Artefactos por corrida no **projeto alvo**:

```text
<projeto>/.IA/outputs/<run-id>/
```

No projeto alvo também: **`.setup-boss/`** (scan, knowledge local), **`.IA/`** (memória semântica, problem history, outputs).

---

## Comandos (npm)

| Comando | Uso |
|---------|-----|
| `npm run run <task.md> <caminho-projeto>` | Fluxo completo orquestrado |
| `npm run scan <caminho-projeto>` | Só scan (`.setup-boss/project-scan.md`) |
| `npm run architect <task.md> <caminho-projeto>` | Architect (scan integrado salvo `--skip-scan`) |
| `npm run executor <runId>` | Executor (resolve pasta via índice ou caminho) |
| `npm run review <runId>` | Review |
| `npm run correction <runId>` | Correction |
| `npm run knowledge <runId>` | Knowledge (requer review approved) |
| `npm run ensure-ia <caminho-projeto>` | Baseline `.IA`; `--full` usa IA |

Variáveis: ver **`.env.example`** (`OPENAI_API_KEY`, `OPENAI_MODEL`, `*_MODEL` por etapa, preços opcionais por modelo, `MAX_CORRECTIONS`, `MAX_TOTAL_STEPS`, `ENABLE_SCAN_CACHE`).

---

## Estado atual do sistema (v2.0.0)

- Pipeline até **knowledge** com **executor por PATCH** e **run-context** operacional.
- **Modelos por etapa** via **`core/llm-client.js`** (`getModelForStep`), fallback **`OPENAI_MODEL`**.
- **Tracking** em `<projeto>/.IA/outputs/<run>/metadata.json`: **`llm_usage`**, **`llm_usage_total`**; etapas como scan, architect, executor, review, correction, knowledge; chamadas **`ensure_ia`** / **`semantic_ia`** quando o fluxo as dispara.
- **Custo estimado** por etapa apenas se existirem variáveis de preço por modelo (ver `.env.example`).

---

## Garantias (alinhadas ao código)

- Alterações no projeto alvo ficam restritas a **`allowed_files`** e regras de segurança em **`scripts/executor.js`** (sem `..`, `.git/`, `node_modules/` em paths relativos autorizados; ficheiro alvo do PATCH deve existir).
- Cada PATCH exige **`search`** único no conteúdo atual do ficheiro; caso contrário a aplicação falha com erro explícito.
- Documentação não substitui a leitura dos **scripts** para contratos exactos de schema e mensagens de erro.

---

## Próximos passos (roadmap)

Ver **`docs/setup-boss-roadmap.md`** (optimização de tokens, fallback local/API, executor híbrido).
