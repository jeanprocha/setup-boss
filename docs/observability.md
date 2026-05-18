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

## Artefactos por corrida (`<projeto>/docs/.IA/outputs/<run-id>/`; legado: `<projeto>/.IA/outputs/<run-id>/`)

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
| `ia-diagnostics.json` | Quando o fluxo pede modo diagnóstico da **pasta semântica** (`docs/.IA`; legado `.IA` na raiz) no output da corrida. |
| **`prompt-sizes.json`** | Quando presente: totais de caracteres por etapa e por bloco do prompt (útil para comparar impacto de cortes no scan). |

---

## Prompt-sizes (`prompt-sizes.json`)

- Ficheiro opcional na pasta da corrida; quando gravado, resume **`total_prompt_chars`** / blocos por etapa (**scan**, **architect**, **executor**, etc.).
- Se **cache de scan** for usado nessa corrida, **`prompt-sizes.json`** pode **não incluir** uma entrada **`scan`** — o scan não voltou a correr, logo não há medição nova dessa etapa na mesma run.
- Para **medir o scan real** (payload enviado ao modelo de scan na mesma corrida), force scan fresco: **`FORCE_SCAN=1`** antes de `npm run run …` (PowerShell: **`$env:FORCE_SCAN='1'`**), ou **`node scripts/run.js … --force-scan`** (ver **`docs/README.md`** — *Scan fresco*).
- Ao subir **`EXECUTOR_CONTEXT_SNIPPET_SIZE`** (tasks em ficheiros grandes), **`executor.total_prompt_chars`** em **`prompt-sizes.json`** tende a **aumentar** — use esse ficheiro para **comparar o impacto** entre uma run com valor por defeito e outra com snippet maior. Trate o aumento de contexto como **pontual** para runs que precisam dele; evite mantê-lo alto como padrão permanente para todas as corridas.

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
4. Para comparar tamanhos de prompt entre corridas, usar **`prompt-sizes.json`** quando existir; lembrar que falta de entrada **`scan`** costuma indicar **scan servido por cache** — forçar scan fresco para medição real (ver secção **Prompt-sizes** acima).

---

## Hybrid executor (Fase 4.9.x — encerrada / estável)

- **Lifecycle completo** (fases, flags, artefactos, fallback, governança, replay shadow, troubleshooting): **[`docs/hybrid-runtime-lifecycle.md`](./hybrid-runtime-lifecycle.md)**.
- **Rollout, checklist operacional, rollback e limitações MVP:** **[`docs/hybrid-runtime-release-readiness.md`](./hybrid-runtime-release-readiness.md)**.
- Com **`HYBRID_RUNTIME_OBSERVABILITY_ENABLED`**, o output da corrida pode incluir **`hybrid-runtime-summary.json`** (telemetria agregada do hybrid executor + validação do bundle de artefactos híbridos); este documento cobre o resto dos artefactos Setup Boss (`run-log.json`, `metadata.json`, `prompt-sizes.json`, etc.).

---

## Validation runtime (Fase 4.10.x — encerrada / estável em shadow)

Com **`SETUP_BOSS_PLAN_MODE=shadow`**, a pasta da corrida pode incluir:

| Artefacto | Função |
|-----------|--------|
| `validation-targets.json` | Alvos, dependency hints, `impact_expansion` |
| `validation-manifest.json` | Refs e telemetria de targeting |
| `validation-propagation-manifest.json` | Candidatos semânticos (shadow) |
| `dependency-graph.json` | Grafo local MVP |
| `validation-plan.json` | Comandos resolvidos + metadados graph-aware (read-only p/ executor) |
| `validation-results.json` / `validation-cache.json` / `validation-runtime-summary.json` | Execução, cache, resumo |
| `plan-artifacts.json` | Manifest consolidado (refs acima quando existem) |

**Fecho e checklist:** **[`docs/validation-runtime-phase410-release-readiness.md`](./validation-runtime-phase410-release-readiness.md)**. **Inspect:** `inspect-plan`, `inspect-validation-runtime`.

---

## Deterministic review (Fase 4.11.x — encerrada / estável em modo observacional)

Quando o motor de review determinístico está activo (`SETUP_BOSS_REVIEW_ENGINE` ≠ `off`), a pasta da corrida pode incluir:

| Artefacto | Função |
|-----------|--------|
| `deterministic-review.json` | Evidências + `risk_summary` + `gate` (snapshots à gravação) |
| `review-diff.json` | Diff entre duas runs (**opt-in**, via `inspect-review --diff … --write-diff`) |
| `review-baseline-summary.json` | Regressão vs baseline em ficheiro (**opt-in** via env baseline) |

**Fecho, modelo de gates, CI e checklist:** **[`docs/deterministic-review-phase411-release-readiness.md`](./deterministic-review-phase411-release-readiness.md)**. **Inspect:** `inspect-review` (incl. `--json`, `--compact`, `--diff`).
