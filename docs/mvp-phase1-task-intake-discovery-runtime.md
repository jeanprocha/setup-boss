# MVP Fase 1 — Task intake & discovery runtime

Documentação mínima do encerramento da **Fase 1** (intake antes do architect): descoberta, resumo de contexto IA, classificação e manifesto de artefactos.

## Objetivo

Captar a task do utilizador (texto livre ou ficheiro), analisar o contexto IA do projeto (`docs/.IA` ou legado `.IA`), produzir artefactos determinísticos e uma classificação operacional, **sem** executar architect, executor nem review.

## Fluxo (resumo)

1. Resolver projeto e caminho IA (`docs/.IA` preferido; `.IA` na raiz se for o único).
2. Garantir baseline IA mínima quando necessário (`ensureIA`).
3. Análise de discovery (preflight leve) → `intake-discovery-analysis.json`.
4. Fase LLM opcional (`task-intake.md`) → `task-discovery.md` / `task-plan-initial.md` quando concluída com sucesso.
5. Classificador sobre sinais + resultado LLM → `intake-classification.json`.
6. `run-context.json` (contrato da corrida intake) e `intake-manifest.json`.
7. Validação de conjunto de artefactos e registo no **run-index** global (`.setup-boss/runs/<runId>.json`) com `run_type: intake`.

## Comandos

```bash
npm run intake -- --project <dir-projeto> --task "texto da task"
node scripts/intake.js --project <dir> --task caminho/task.md
```

Inspeção de uma corrida intake já indexada:

```bash
npm run setup-boss -- inspect <runId>
```

## Flags

| Flag | Efeito |
|------|--------|
| `--skip-llm` | Não chama a API OpenAI; não gera os markdowns LLM; `phase1.llm.status` = `skipped`. |
| `--json` | Imprime no stdout **apenas** um objeto JSON (resumo: `runId`, `outputDir`, `classification`, `confidence`, `artifacts`, …). |

## Artefactos gerados (pasta de output)

Sob `docs/.IA/outputs/<runId>/` (ou `.IA/outputs/<runId>/` em legado):

| Ficheiro | Descrição breve |
|----------|------------------|
| `metadata.json` | Metadados da corrida (`run_type: intake`, raiz do projeto, pré-visualização da task). |
| `run-context.json` | Contrato único: task, `phase1` (discovery, LLM, classificação, manifest). |
| `intake-context-summary.json` | Resumo do contexto IA usado no prompt. |
| `intake-discovery-analysis.json` | Sinais de discovery e metadados da task (`inline` \| `file`). |
| `intake-classification.json` | Classificação e confiança expostas como artefacto. |
| `intake-manifest.json` | Lista de artefactos esperados vs existentes. |
| `task-discovery.md` / `task-plan-initial.md` | Apenas quando LLM **completed** com saída válida. |
| `intake-llm-error.json` | Opcional, em falhas de contrato/chamada LLM. |

Validação programática do conjunto: `validateIntakeArtifacts(outputDir)` em `scripts/runtime/intake/intake-manifest.js`.

## Classificações (orientação)

O valor em `intake-classification.json` / `run-context.phase1.classification` reflete sinais de IA incompleta, discovery, resultado LLM, etc. (ex.: `needs_context`, `ready_for_clarification`, `blocked`). Não substitui decisão humana de priorização.

## Limites da Fase 1

- Sem loop de clarificação automático.
- Sem estratégia de execução nem encadeamento a architect/executor.
- LLM opcional; com `--skip-llm` não há markdowns de plano/discovery LLM.

## O que fica para a Fase 2 (MVP seguinte)

- Integração operacional pós-intake (ex.: handoff explícito para architect quando o produto o definir).
- Estratégias de execução, gates adicionais e evolução do contrato além do intake.

## Relação com `docs/.IA`

O intake **lê** o pacote de contexto IA (ficheiros numerados, índice) e grava outputs **só** dentro de `…/.IA/outputs/<runId>/`, respeitando o resolver de caminhos. Novos projetos sem pasta IA recebem baseline mínima em `docs/.IA` por defeito.

## Smoke

```bash
npm run smoke:mvp-phase1-intake
```

Equivale a `node scripts/smoke/mvp-phase1-intake-smoke.js` (cenários temporários no disco + limpeza do run-index).
