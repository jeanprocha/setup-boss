# Relatório — Fallback local de clarificação (`skipLlm` + `needs_context`)

## 1. Causa raiz

- O fluxo Mission Control envia `skipLlm: true` no `POST /runs`.
- O classificador de intake trata LLM skipped como `classification: needs_context`.
- A primeira invocação passiva de `executeClarification` apenas **inicializava** `phase2` (`clarification_initialized`), gravava `clarification-session.json` e **saía** sem chamar `persistQuestionGeneration`.
- Com `skipLlm: true`, uma segunda passagem de `generateClarificationQuestions` gravava `clarification-questions.json` com **lista vazia** (`source.mode: skip-llm`), mantendo `questionsCount: 0`.
- A UI derivava `waiting_clarification_questions` com zero perguntas persistidas — estado operacional sem saída (sem mock, sem avanço para executor, sem SPEC).

## 2. Regra nova implementada

### 2.1 Primeira passagem passiva (Mission Control / `executeClarification` após intake)

Quando, após o **primeiro init** de clarificação no mesmo ciclo:

- `skipLlm === true`, e
- `intake-classification.json` tem `classification === "needs_context"`,

o runtime corre um **fallback determinístico local** (sem LLM) que:

1. Valida o payload com `validateClarificationQuestions` (contrato existente).
2. Grava `clarification-questions.json` com `source: "local_fallback"`, `reason: "skip_llm_needs_context_without_questions"`, `heuristic: true` e cinco perguntas `free_text` **blocking**.
3. Atualiza `clarification-session.json` e `run-context.json` para `phase2.status: questions_generated`, `current_round: 1`.
4. Se a escrita falhar, marca `phase2.local_fallback_failed` / `phase2.local_fallback_error` e regista `runtime.clarification_fallback.failed`.

Implementação: `scripts/runtime/clarification/clarification-runtime.js` (pós-init) + `local-fallback-questions.js`.

### 2.2 Geração via `generateClarificationQuestions` com `--skip-llm`

Em `question-generator.js`, se `skipLlm` e classificação `needs_context`, o mesmo documento de fallback é gravado **em vez** do JSON vazio histórico (`questions: []`). Assim, um fluxo em dois passos (init sem skip, depois `clarify --skip-llm`) também deixa de ficar com zero perguntas.

**Não** altera: aprovação, execução automática, ou geração de SPEC/refinement.

## 3. Artefactos criados ou alterados

| Ficheiro | Papel |
|----------|--------|
| `scripts/runtime/clarification/local-fallback-questions.js` | Helper: documento, persistência session/run-context |
| `scripts/runtime/clarification/local-fallback-questions.test.js` | Testes do helper |
| `scripts/runtime/clarification/clarification-runtime.js` | Hook pós-init; logs; anotação de falha |
| `scripts/daemon/lib/run-intake-api.js` | Evento `clarification_questions_generated` quando há perguntas |
| `scripts/daemon/lib/run-clarification.js` | Bundle API: `localFallbackGenerationFailed` / `localFallbackGenerationDetail` |
| `frontend/.../clarification-adapters.ts` | Mapeamento dos campos opcionais da sessão |
| `frontend/.../clarification-types.ts` | Tipos opcionais |
| `frontend/.../ClarificationPanel.tsx` | Mensagem explícita se a geração local falhou |
| `frontend/.../map-event.ts`, `runtime-labels.ts` | Evento SSE `clarification_questions_generated` |
| `scripts/runtime/clarification/question-generator.js` | `skipLlm` + `needs_context` grava fallback local (ex.: 2.º passo CLI) |
| `docs/clarification-skip-llm-fallback-report.md` | Este relatório |

## 4. Eventos e logs

**Evento runtime:** `clarification_questions_generated`  
Payload (entre outros): `runId`, `jobId`, `projectId`, `projectRoot`, `questionsCount`, `phase2Status`, `source`, `reason`.

**Log em `logs/runtime.log`:**

- `runtime.clarification_fallback.started`
- `runtime.clarification_fallback.questions_written`
- `runtime.emit.clarification_questions_generated` (via `logEmit` ao persistir o evento)
- Em falha: `runtime.clarification_fallback.failed`

## 5. Comportamento antes / depois

| Aspecto | Antes | Depois |
|--------|--------|--------|
| `phase2Status` após run create (skip LLM + needs_context) | `clarification_initialized` | `questions_generated` |
| `questionsCount` | `0` | `5` |
| `uiState` (dispatch meta) | `waiting_clarification_questions` | `waiting_clarification_answers` |
| `clarification-questions.json` | Ausente ou vazio (skip-llm) | Presente, contrato válido, `source: local_fallback` |
| Evento após clarify | `clarification_initialized` (0 perguntas) | `clarification_questions_generated` |

## 6. Validações executadas

Comandos recomendados (PowerShell / repo root):

```powershell
node --test scripts/daemon/lib/runtime-events.test.js
node --test scripts/runtime/clarification/local-fallback-questions.test.js
node --test scripts/runtime/clarification/clarification-runtime.test.js
node --test scripts/daemon/lib/run-intake-api.test.js
```

*(Executar localmente após checkout; resultados dependem do ambiente.)*

## 7. Limitações restantes

- Perguntas são **genéricas** (heurística), não substituem clarificação orientada por LLM ou por `task-discovery.md` / `task-plan-initial.md`.
- O hook pós-init (Mission Control) cobre sobretudo a **primeira** passagem com `skipLlm`; o ramo em `question-generator.js` cobre também **`clarify --skip-llm`** quando a classificação continua `needs_context`.
- `jobId` não está disponível dentro de `executeClarification`; logs do fallback usam `jobId: null` no runtime.

## 8. Próximos passos sugeridos

- Política de produto: permitir `skipLlm: false` na Mission Control quando houver chave LLM, para perguntas contextualizadas.
- Métricas: contar quantas runs usam `source: local_fallback` vs LLM.
- Opcional: unificar `persistQuestionGeneration` e fallback num único caminho de escrita de `phase2` para menos duplicação.
