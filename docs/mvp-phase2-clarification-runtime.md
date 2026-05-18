# MVP Fase 2 — Clarification runtime (pós-intake)

Documentação mínima do encerramento da **Fase 2**: clarificação sobre uma corrida **intake** (`run_type: intake`), até **`ready_for_execution`** ou **`approval_rejected`**, **sem** architect, executor, review nem DAG.

## Objetivo

Completar o handoff humano-in-the-loop após o intake: perguntas opcionais, respostas, refinamento do plano e decisão de aprovação, com artefactos JSON/Markdown auditáveis e estado em **`run-context.json`** (`phase2`).

## Fluxo (resumo)

1. Correr **`npm run intake`** (com ou sem LLM) num projeto; obter pasta de output indexada.
2. **`npm run clarify -- --run <runId|caminho-output>`** — inicializa `phase2` e `clarification-session.json`.
3. Segunda invocação (ou primeira com `--skip-llm` se já inicializado) — gera **`clarification-questions.json`**.
4. Gravar **`clarification-answers.json`** via **`--answers`** ou **`--answer id=valor`** (repetível).
5. **`--refine`** — produz **`task-plan-refined.md`** (LLM ou `--skip-llm` determinístico).
6. **`--approve`** ou **`--reject`** — grava **`approval-state.json`** e estado terminal em `phase2`.

## Comandos

```bash
npm run clarify -- --run <runId-ou-caminho-absoluto-output>
npm run clarify -- --run <runId> --skip-llm
npm run clarify -- --run <runId> --answers respostas.json
npm run clarify -- --run <runId> --answer q1=sim --answer q2=texto
npm run clarify -- --run <runId> --refine --skip-llm
npm run clarify -- --run <runId> --approve --approval-notes "OK para executar"
```

Inspeção (quando indexado): `npm run setup-boss -- inspect <runId>`.

## Flags

| Flag | Efeito |
|------|--------|
| `--skip-llm` | Perguntas vazias determinísticas ou refinamento sem chamada OpenAI (`task-plan-refined.md` sintético válido). |
| `--json` | Stdout só com objeto JSON (`ok`, `runId`, `phase2_status`, `next_action`, `artifacts`, …). |
| `--answers <ficheiro>` | JSON com `{ "answers": [ { "question_id", "value" }, … ] }`. |
| `--answer id=valor` | Resposta única pela CLI (repetir por pergunta). |
| `--refine` | Gera/atualiza `task-plan-refined.md` (não combinar com `--answer`/`--answers` na mesma chamada). |
| `--approve` / `--reject` | Grava `approval-state.json` (não combinar com `--refine` nem respostas na mesma chamada). |
| `--approval-notes "…"` | Notas no artefacto de aprovação. |
| `--overwrite` | Força regravação onde o runtime permite (ex.: novo refine ou nova aprovação). |

## Artefactos gerados (pasta de output do intake)

| Ficheiro | Quando |
|----------|--------|
| `clarification-session.json` | Após a primeira clarificação bem-sucedida; histórico por `rounds`. |
| `clarification-questions.json` | Após geração de perguntas (`questions_generated`). |
| `clarification-answers.json` | Após submissão válida de respostas (`answers_recorded`). |
| `task-plan-refined.md` | Após `--refine` (`plan_refined` ou estados posteriores). |
| `approval-state.json` | Após `--approve` ou `--reject` (`ready_for_execution` / `approval_rejected`). |

Validação leve do conjunto: **`validateClarificationArtifacts(outputDir)`** em `scripts/runtime/clarification/validate-clarification-artifacts.js`.

## Estados `phase2.status`

| Valor | Significado |
|-------|-------------|
| `clarification_initialized` | Sessão criada; ainda sem perguntas. |
| `questions_generated` | `clarification-questions.json` presente. |
| `answers_recorded` | Respostas gravadas. |
| `plan_refined` | `task-plan-refined.md` gravado. |
| `ready_for_execution` | Plano aprovado (`approval-state.json` com `approved`). |
| `approval_rejected` | Plano rejeitado (`rejected`). |

## Limites da Fase 2

- Só corre em outputs **`run_type: intake`** com artefactos intake válidos (`validateIntakeArtifacts`).
- Não executa código nem altera ficheiros do projeto além dos artefactos da corrida.
- Modo `--skip-llm` não substitui juízo humano em tasks complexas.

## O que fica para a Fase 3 (MVP) e além

- **MVP Fase 3 — Strategy runtime** (após `ready_for_execution` + `approved`): preparação e handoff **`strategy/execution-ready-handoff.json`**; ver **`docs/mvp-phase3-execution-strategy-runtime.md`**. Não executa código.
- **Fase 4+ (produto):** encadeamento operacional a **architect / executor** e execução real a partir do handoff, quando a orquestração o definir.
- Daemon, filas e execução remota, quando aplicável ao roadmap.

## Smoke

```bash
npm run smoke:mvp-phase2-clarification
```

Equivale a `node scripts/smoke/mvp-phase2-clarification-smoke.js` (intake com LLM mock in-process, pipeline clarify sem rede).
