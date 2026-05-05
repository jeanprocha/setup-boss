# Setup Boss — Decisions

## Decisão: Pipeline estruturado (v2.0.0)

Ordem oficial das etapas:

```text
scan → architect → run-context.json
→ executor (PATCH)
→ review
→ [correction → executor → review]*
→ knowledge
```

- **correction** não corre em toda a execução: entra quando o **review** indica ciclo corretivo (**`rejected`** com **`requires_correction`**, conforme consumo em **`scripts/run.js`**).
- A decisão oficial do **review** para automação é sempre **`review-output.json`** (ver decisão “Review JSON-first”).

Ramificações a partir do **review**:

- **`status: approved`** → **knowledge** → fim do fluxo feliz.
- **`status: rejected`** com caminho de correção → **correction** → **executor** → novo **review** — até **`approved`**, **`blocked`**, ou limites (**`MAX_CORRECTIONS`**, **`MAX_TOTAL_STEPS`**).
- **`status: blocked`** → parar; não seguir o loop típico de correction até o bloqueio ser resolvido fora do pipeline ou a task/definição mudar.

**Motivo:** previsibilidade, auditoria em artefactos e redução de ambiguidade vs. texto livre.

---

## Decisão: run-context como base do sistema

- **`run-context.json`** é gerado pelo **architect** e persiste **`allowed_files`**, resumo da task, critérios, foco de review e metadados de execução (**`scripts/architect.js`**, função `buildRunContext`).
- Etapas posteriores (**executor**, **review**, **correction**, **knowledge**) **preferem** este ficheiro para reduzir tokens e evitar colar prompts completos legados quando o ficheiro é válido.

**Motivo:** custo, consistência e substituição de “prompts gigantes” por contrato estável.

---

## Decisão: Executor por PATCH (validação em código)

- Resposta estruturada com **`changes[]`** onde cada item tem **`operation: "patch"`**, **`path`**, **`search`**, **`replace`**, **`reason`**.
- **`search`** deve ser **único** no ficheiro alvo; caso contrário a aplicação falha com erro explícito (**`scripts/executor.js`**).
- Escopo limitado a **`allowed_files`** derivados do **`run-context`** (ou fallback legado a partir da secção “Arquivos prováveis” do architect se não houver lista utilizável).
- Não é o modo atual do sistema tratar “reescrever ficheiro inteiro” como operação válida do executor.

**Motivo:** alterações em disco controladas e auditáveis.

---

## Decisão: Separação sistema vs projeto

- **setup-boss** (este repositório) = sistema e scripts.
- **`.setup-boss/`** no projeto alvo = contexto técnico local (scan, knowledge).
- **`.IA/`** no projeto alvo = memória semântica e **`outputs/<run-id>/`** por corrida.

**Motivo:** separação de responsabilidades e histórico por projeto.

---

## Decisão: Knowledge por projeto

Cada projeto mantém o seu **`.setup-boss/knowledge-base.md`** (append na etapa **knowledge** quando aplicável).

**Motivo:** aprendizado contextualizado ao stack e convenções do repo alvo.

---

## Decisão: Loop de correção

**correction** gera **`correction-instructions.md`** para a volta seguinte; o **executor** aplica **PATCH**; o **review** reavalia com base em **`review-output.json`**.

**Motivo:** rastreio num único **`outputs/<run-id>/`** e menos improviso fora do pipeline.

---

## Decisão: Review JSON-first

A decisão operacional do review para o orquestrador é:

**`review-output.json`**

Exemplo ilustrativo de forma (campos exactos devem corresponder ao schema esperado pelo **`scripts/review.js`**):

```json
{
  "status": "approved",
  "acceptance_level": "development",
  "blocking_issues": [],
  "warnings": [],
  "requires_correction": false,
  "summary": "Task validada com sucesso.",
  "markdown_report": "..."
}
```

**Motivo:** decisão determinística; Markdown adjunto é legível para humanos, não substitui o JSON para automação.

---

## Decisão: Métricas LLM por corrida

- **`metadata.json`** agrega **`llm_usage`** (por etapa) e **`llm_usage_total`**, via **`core/llm-usage.js`** e gravações por script quando há **`outputDir`** coerente.
- Custo estimado depende de envs de preço opcionais por modelo.

**Motivo:** observabilidade de tokens e custo entre corridas e etapas.
