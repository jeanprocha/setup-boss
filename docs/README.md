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

- **scan**: pode ser omitido quando o cache de scan está válido (`ENABLE_SCAN_CACHE`); o output da corrida pode ainda assim incluir scan copiado em cache. Para **obrigar** um scan real na mesma corrida (métricas / diagnóstico), ver **[Scan fresco](#scan-fresco-diagnóstico--medições-de-prompt)** abaixo.
- **architect**: produz o plano, valida enforcement, escreve **`run-context.json`** e artefactos da corrida no diretório de output.
- **run-context.json**: geração pelo architect; agrega resumo da task, critérios de aceite, **`allowed_files`**, foco de review e metadados de execução — **substitui a necessidade de injetar task/scan/architect completos** nas etapas seguintes quando válido.
- **executor**: resposta estruturada com **`operation: "patch"`** por alteração; cada patch usa **`search`** (trecho que deve ocorrer **exactamente uma vez** no ficheiro) e **`replace`**; não há modo suportado de reescrever o ficheiro inteiro via o schema atual. Escrita no disco só para paths em **`allowed_files`**, com validação em código (`scripts/executor.js`).
- **review**: decisão em **`review-output.json`**; prompts tendem a ser menores quando **`run-context.json`** é utilizável.
- **correction → executor → review**: repete até `approved`, `blocked` ou limites (`MAX_CORRECTIONS`, `MAX_TOTAL_STEPS`) definidos em **`scripts/run.js`**.
- **knowledge**: só após review **`approved`**; atualiza conhecimento local do projeto e pode acionar enriquecimento em **`docs/.IA/`** quando aplicável (legado: **`.IA/`** na raiz).

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
<projeto>/docs/.IA/outputs/<run-id>/
```

No projeto alvo também: **`.setup-boss/`** (scan, knowledge local), **`docs/.IA/`** (memória semântica, problem history, outputs; legado: **`.IA/`** na raiz).

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
| `npm run ensure-ia <caminho-projeto>` | Baseline **`docs/.IA`**; `--full` usa IA |
| `npm run strategy -- --run <runId>` | **MVP Fase 3:** strategy runtime (pós-`ready_for_execution` + `approved`); gera **`strategy/`** e handoff; ver **`docs/mvp-phase3-execution-strategy-runtime.md`** |

Variáveis: ver **`.env.example`** (`OPENAI_API_KEY`, `OPENAI_MODEL`, `*_MODEL` por etapa, preços opcionais por modelo, `MAX_CORRECTIONS`, `MAX_TOTAL_STEPS`, `ENABLE_SCAN_CACHE`).

### Scan fresco (diagnóstico / medições de prompt)

Por defeito, **`npm run run`** pode **usar cache de scan** quando este está válido (`ENABLE_SCAN_CACHE`).

Para **diagnóstico de prompt-sizes** ou para validar **cortes no payload do scan**, force uma corrida com scan executado de verdade:

**PowerShell:**

```powershell
$env:FORCE_SCAN='1'
npm run run tasks/diagnostico-prompt-sizes.md .
```

**Node direto** (evita casos em que o npm não repassa flags como `--force-scan`):

```bash
node scripts/run.js tasks/diagnostico-prompt-sizes.md . --force-scan
```

Em alguns ambientes o **`npm run`** pode **não repassar** correctamente `--force-scan`; use **`FORCE_SCAN=1`** com npm ou invoque **`node scripts/run.js`** como acima.

---

## Modo task complexa

Quando o **executor** bloqueia citando **snippet insuficiente** ou trecho truncado que não cobre o cabeçalho / zona a alterar num ficheiro grande, o limite por defeito do contexto do executor pode ser baixo para esse caso. Pode **aumentar temporariamente** o teto de caracteres por ficheiro permitido com **`EXECUTOR_CONTEXT_SNIPPET_SIZE`** (ver **`.env.example`**).

**PowerShell** (exemplo validado com componente ~19k chars):

```powershell
$env:EXECUTOR_CONTEXT_SNIPPET_SIZE='24000'
npm run run tasks/task-1.md ../agenda-diaria
```

Depois da corrida, pode repor o ambiente:

```powershell
Remove-Item Env:EXECUTOR_CONTEXT_SNIPPET_SIZE
```

Preferível usar valores altos **só na run necessária**: o prompt do executor (e custo/tokens) cresce com o snippet — comparar **`prompt-sizes.json`** entre corridas (ver **`docs/observability.md`**).

---

## Estado atual do sistema (v2.0.0)

- **MVP Fases 1–3 (intake → clarify → strategy):** intake (`npm run intake`), clarificação até **`ready_for_execution`** (`npm run clarify`), strategy runtime **`npm run strategy`** que gera complexity, AI strategy, decomposição, ordenação linear, contexto partilhado, readiness e **`execution-ready-handoff.json`** — **sem executar código** do projeto alvo. Documentação: **`docs/mvp-phase1-task-intake-discovery-runtime.md`**, **`docs/mvp-phase2-clarification-runtime.md`**, **`docs/mvp-phase3-execution-strategy-runtime.md`**.
- Pipeline até **knowledge** com **executor por PATCH** e **run-context** operacional.
- **Modelos por etapa** via **`core/llm-client.js`** (`getModelForStep`), fallback **`OPENAI_MODEL`**.
- **Tracking** em `<projeto>/docs/.IA/outputs/<run>/metadata.json` (legado: `<projeto>/.IA/outputs/<run>/`): **`llm_usage`**, **`llm_usage_total`**; etapas como scan, architect, executor, review, correction, knowledge; chamadas **`ensure_ia`** / **`semantic_ia`** quando o fluxo as dispara.
- **Custo estimado** por etapa apenas se existirem variáveis de preço por modelo (ver `.env.example`).

---

## Garantias (alinhadas ao código)

- Alterações no projeto alvo ficam restritas a **`allowed_files`** e regras de segurança em **`scripts/executor.js`** (sem `..`, `.git/`, `node_modules/` em paths relativos autorizados; ficheiro alvo do PATCH deve existir).
- Cada PATCH exige **`search`** único no conteúdo atual do ficheiro; caso contrário a aplicação falha com erro explícito.
- Documentação não substitui a leitura dos **scripts** para contratos exactos de schema e mensagens de erro.

---

## Hybrid runtime — Fase 4.9 (concluída / estável)

**Estado:** Fase **4.9** oficialmente **encerrada** para uso **controlado**: capacidades **opt-in** por variáveis de ambiente, **fallback textual** garantido quando o caminho estrutural não aplica, relatórios de **governança** e **replay shadow** apenas onde documentado (replay **sem apply real** no MVP).

**Capacidades entregues (resumo):** AST/planning/transform em modo shadow; execução híbrida structural-first (4.9.4); apply estrutural controlado opcional (4.9.5); governança estrutural em JSON (4.9.6); fundação replay / stale / fingerprints (4.9.6.1); replay shadow + continuidade (4.9.7); consolidação e validação de artefactos com observabilidade (4.9.7.1); fecho documental e matriz de release readiness (4.9.8).

**Limitações MVP que permanecem:** sem replay apply real ao filesystem; sem propagação semântica global nem transacção multi-ficheiro unificada; sem workflows de aprovação externos neste runtime.

**Documentação principal (Hybrid Runtime):**

| Documento | Conteúdo |
|-----------|----------|
| **[`docs/hybrid-runtime-lifecycle.md`](./hybrid-runtime-lifecycle.md)** | Ordem das fases, flags, artefactos, fallback, governança, replay shadow, troubleshooting |
| **[`docs/hybrid-runtime-release-readiness.md`](./hybrid-runtime-release-readiness.md)** | Encerramento 4.9, rollout, checklist operacional, rollback |
| **[`docs/validation-runtime-phase410-release-readiness.md`](./validation-runtime-phase410-release-readiness.md)** | Encerramento **4.10**: validation plan, cache, dependency graph, graph-aware metadata, checklist |
| **[`docs/deterministic-review-phase411-release-readiness.md`](./deterministic-review-phase411-release-readiness.md)** | Encerramento **4.11**: deterministic review, risk/gates, diff/baseline, inspect, checklist CI |
| **[`docs/observability.md`](./observability.md)** | Artefactos por corrida, `metadata.json`, `prompt-sizes.json`; ligação ao resumo híbrido quando a flag de observabilidade está ligada |
| **[`docs/git-workflow-operational-runbook.md`](./git-workflow-operational-runbook.md)** | Fluxo Git local: prepare branch, execute gate, commit, push/PR opcionais, smoke, troubleshooting |

Enquadramento histórico da Fase 4: **[`docs/setup-boss-evolution.md`](./setup-boss-evolution.md)**.

**Próximos passos recomendados (produto):** rollout gradual por ambiente (ver release readiness); depois evolução em [**`docs/setup-boss-roadmap.md`**](./setup-boss-roadmap.md) — optimização de tokens (STEP 4), fallback inteligente (STEP 5), continuação da linha híbrido/determinístico (STEP 6), targeting pós-4.11 (STEP 7 / 4.12+).

---

## Próximos passos (roadmap)

Ver **`docs/setup-boss-roadmap.md`** (optimização de tokens, fallback local/API, evolução do executor híbrido). As fases **4.9** a **4.11** estão documentadas como concluídas nos respectivos release readiness; o roadmap descreve trabalho contínuo (**STEP 4–7**, incl. **4.12+**).
