# Relatório — Submit de respostas de clarificação com fallback local do refine (`skipLlm`)

## 1. Causa raiz

O `refineTaskPlan` (`scripts/runtime/clarification/plan-refiner.js`) exigia sempre os ficheiros `task-plan-initial.md` e `task-discovery.md` antes de validar respostas e gerar `task-plan-refined.md`.

Com **`skipLlm: true`** no intake (`scripts/runtime/intake/intake-runtime.js`), a fase LLM de intake é **ignorada** (`runTaskIntakeLlmPhase` → `skipped`): não são escritos `task-discovery.md` nem `task-plan-initial.md`. A Mission Control envia `skipLlm: true` por defeito.

O fluxo **fallback local de perguntas** (`needs_context` + `local-fallback-questions.js`) passou a preencher `clarification-questions.json`, permitindo à UI mostrar perguntas e gravar `clarification-answers.json` ao submeter. Na segunda chamada (`refine: true`), o refine continuava a falhar com **`CLARIFY_REFINE_PLAN_INITIAL_MISSING`** / mensagem técnica **«Artefacto em falta para refine: task-plan-initial.md»**, criando um *dead-end* operacional.

## 2. Por que `task-plan-initial.md` faltava

Por desenho do intake com LLM desativado: só há escrita de `task-discovery.md` e `task-plan-initial.md` quando `llmPhase.status === "completed"` (`intake-runtime.js`). Em modo skipped, esses artefactos não são produzidos; apenas continuam disponíveis `intake-classification.json`, `intake-discovery-analysis.json`, `metadata.json`, `run-context.json`, etc.

## 3. Regra nova para `skipLlm=true` no refine

Em **`refineTaskPlan`**, quando **`skipLlm === true`** e falta **`task-plan-initial.md`** ou **`task-discovery.md`**:

1. Regista-se `runtime.refine.missing_initial_plan` e `runtime.refine.local_initial_plan_started`.
2. Chama-se **`ensureSkipLlmRefineMarkdownArtifacts`** (`scripts/runtime/clarification/local-fallback-refine-inputs.js`), que **sem LLM**:
   - gera `task-discovery.md` mínimo (marcador `---TASK_DISCOVERY---`, extracto JSON de `intake-discovery-analysis.json` quando existir, texto da tarefa via `metadata.intake_task_preview`);
   - gera `task-plan-initial.md` com a estrutura pedida (Contexto, Objetivo, Escopo inicial, Arquivos/telas, Fora de escopo, Critério de sucesso, Observações), derivando conteúdo das respostas mapeadas aos IDs `local_fallback_q1` … `local_fallback_q5` quando aplicável.
3. Meta HTML nos markdowns indica `source: "local_fallback"` e `skip_llm: true`.
4. Em seguida o fluxo **existente** de refine determinístico (`skipLlm` em `plan-refiner.js`) produz `task-plan-refined.md`.

Se **`skipLlm !== true`** e faltam esses markdowns, o refine **falha** com código **`CLARIFY_REFINE_PLAN_INITIAL_MISSING`** ou **`CLARIFY_REFINE_DISCOVERY_MISSING`** e mensagem **legível** (não expõe o nome do ficheiro como erro principal).

## 4. Artefactos gerados após submeter respostas (fluxo feliz skip LLM)

- `clarification-answers.json` (já existia).
- `task-plan-initial.md` e `task-discovery.md` quando gerados pelo fallback (novos neste cenário).
- `task-plan-refined.md` (refine determinístico já existente).
- `run-context.json` / `clarification-session.json` atualizados pelo pipeline existente em `persistPlanRefinedPhase` / `clarification-runtime.js`.
- `approval-state.json` **não** é criado nesta etapa — o utilizador continua a aprovar manualmente na UI (sem avanço automático para executor).

## 5. Eventos e logs adicionados

### `logs/runtime.log` (via `scripts/runtime/logger.js`)

- **`runtime.clarification_answers.submit_received`** — início da mutação com respostas (`runId`, `jobId`, `projectId` se fornecidos, `outputDir`, `answersCount`).
- **`runtime.clarification_answers.written`** — após persistência bem-sucedida das respostas.
- **`runtime.refine.started`** — antes da segunda chamada `executeClarification` com `refine: true` após submissão.
- **`runtime.refine.missing_initial_plan`** — em `plan-refiner`, quando faltam markdowns de intake e `skipLlm` permite stub.
- **`runtime.refine.local_initial_plan_started`** / **`runtime.refine.local_initial_plan_written`** — geração local dos stubs.
- **`runtime.refine.completed`** — no fim bem-sucedido do refine em `plan-refiner` (inclui caminhos e modo).
- **`runtime.refine.failed`** — falha na cadeia de refine após submissão (com `emitRuntimeEvent` `refinement_failed`).

### Eventos persistidos (`emitRuntimeEvent`)

Em `scripts/daemon/lib/run-clarification.js` / uso pela API:

- `clarification_answers_submitted`
- `task_plan_initial_created` (quando o stub escreve `task-plan-initial.md`)
- `task_plan_refined_created` quando `phase2` fica em `plan_refined`
- `approval_requested` quando o snapshot indica `awaiting_approval`
- `refinement_failed` quando o refine após respostas falha

A API continua também a emitir `clarification_answers` (legado) em `runtime-api.js`.

### Payload HTTP

A mutação bem-sucedida pode devolver `message` amigável **«Respostas salvas e plano inicial gerado.»** quando o stub inicial foi escrito (`refineSideEffects.localInitialPlanWritten`).

## 6. Comportamento antes / depois

| Aspeto | Antes | Depois |
|--------|--------|--------|
| Intake `skipLlm` + perguntas fallback + submit respostas | Falha no refine por falta de `task-plan-initial.md` (e `task-discovery.md`) | Stubs locais + refine determinístico + SPEC refinada |
| Mensagem de erro ao utilizador | Texto técnico com nome do artefacto | Mensagem orientada à acção quando LLM não está em skip |
| UI após sucesso | Só estado/refetch | Faixa de sucesso com a mensagem devolvida pela API quando aplicável |

## 7. Validações executadas

Obrigatório:

```powershell
node --test scripts/daemon/lib/runtime-events.test.js
```

Adicionalmente nesta alteração:

```powershell
node --test scripts/runtime/clarification/plan-refiner.test.js scripts/daemon/lib/run-clarification.test.js
```

- Novo teste em `plan-refiner.test.js`: refine `skip-llm` **sem** `task-plan-initial.md` / `task-discovery.md`.
- Novo teste em `run-clarification.test.js`: mutação `answers` + refine **sem** markdowns de intake LLM, com `persistLocalFallbackClarificationQuestions`.

## 8. Limitações restantes

- O `task-plan-initial.md` local é **heurístico**; não substitui planeamento gerado por LLM.
- O extracto em `task-discovery.md` pode ser **longo mas truncado** (limite ~2800 caracteres no JSON serializado).
- Modo **`skipLlm: false`** sem markdowns de intake continua a falhar até existir intake LLM completo ou política explícita de fallback (fora do âmbito pedido).
- `jobId` / `projectId` nos logs dependem da resolução do job na API; chamadas só com `runId` podem deixá-los a `null`.

## 9. Próximos passos sugeridos

- Opcional: incluir `task-plan-initial.md` / `task-discovery.md` na lista `phase2.artifacts` quando criados pelo fallback (auditoria de artefactos).
- Opcional: alinhar texto de `buildDeterministicRefinedMarkdown` com a nova estrutura do plano inicial local (hoje ainda menciona extracto genérico do plano inicial).
- Produto: expor toggle `skipLlm` na Mission Control quando houver chave LLM, para reduzir dependência do fallback.

## Ficheiros tocados (implementação)

- `scripts/runtime/clarification/local-fallback-refine-inputs.js` (novo)
- `scripts/runtime/clarification/plan-refiner.js`
- `scripts/runtime/clarification/clarification-runtime.js` (`refineSideEffects`, `baseSuccessCore`)
- `scripts/daemon/lib/run-clarification.js` (logs, eventos, mensagem, `jobId`/`projectId`)
- `scripts/daemon/runtime-api.js` (passagem `jobId` / `projectId`)
- `frontend/components/features/clarification/ClarificationPanel.tsx` (mensagem de sucesso não técnica)
- Testes: `plan-refiner.test.js`, `run-clarification.test.js`
