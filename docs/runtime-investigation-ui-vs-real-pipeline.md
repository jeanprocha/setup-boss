# Investigação: runtime visual vs pipeline real (Mission Control)

Documento de **discovery apenas** — sem alterações de código nem de comportamento.

---

## 1. Resumo executivo

- A timeline pode mostrar progresso completo de intake/clarificação **sem prova em disco no caminho que foi pesquisado**, por três razões principais:
  1. **Local errado no filesystem:** artefactos de corrida **não** vivem em `SETUP_BOSS_DATA_DIR` nem numa pasta genérica `C:\setup-boss-data`. O destino canónico é **`<projectRoot>/docs/.IA/outputs/<runId>/`** (ou legado **`<projectRoot>/.IA/outputs/<runId>/`**). O daemon usa `SETUP_BOSS_DATA_DIR` só para **estado do daemon** (fila, locks, `events.jsonl`, etc.), não para outputs de intake.
  2. **UI mistura eventos reais (SSE/API) com linhas sintéticas:** após `POST /runs` bem-sucedido, o cliente executa `seedIntakeAuditForRun`, que **injeta mensagens fixas** (“artifacts phase1 disponíveis”, “perguntas disponíveis”) **sem ler disco** — logo a timeline pode afirmar mais do que existe como ficheiros.
  3. **`skipLlm: true` no submit da Mission Control:** o `TaskComposer` envia sempre `metadata.skipLlm: true`. O backend em `createRunFromTask` trata `skipLlm` como **predefinição ligada** (`metadata.skipLlm !== false`). Com LLM em skipped, **não** se esperam `task-discovery.md` / `task-plan-initial.md`; a primeira passagem passiva de clarificação só inicializa sessão (`clarification-session.json`) e **não** gera `clarification-questions.json` (perguntas vêm noutro ramo, após init).

- **Nomes de ficheiros:** não existe `task-plan.md` neste pipeline MVP — usam-se **`task-plan-initial.md`** / **`task-plan-refined.md`**. `approval-state.json` só aparece no fluxo de aprovação.

---

## 2. Fluxo real atual (texto)

### 2.1 Submit end-to-end

1. **Cliente:** `TaskComposer` → `useCreateRun` → `createRunFromTask` (`frontend/lib/runtime/intake/intake-actions.ts`) → `POST /api/runtime/runs` (proxy Next) → daemon HTTP `POST /runs`.
2. **Payload:** corpo JSON com `projectId`, `task`, `metadata` (inclui **`skipLlm: true`** definido no composer).
3. **Daemon:** `runtime-api.js` handler → `createRunFromTask` (`scripts/daemon/lib/run-intake-api.js`).
4. **Pipeline síncrona no pedido:**
   - `executeIntake` (`scripts/runtime/intake/intake-runtime.js`): cria pasta de output sob **IA do projeto**, escreve JSONs de intake + **`run-context.json`** (LLM opcional; com skip, fase LLM = `skipped`).
   - `executeClarification` (`scripts/runtime/clarification/clarification-runtime.js`): primeiro modo passivo → ramo de **init** grava **`clarification-session.json`** e actualiza **`run-context.json`** com `phase2.status = clarification_initialized`, **retorna** — **não** corre `persistQuestionGeneration` na mesma invocação.
   - `enqueueJob` (`scripts/daemon/lib/queue-store.js`): persiste job na fila; **`emitRuntimeEvent({ type: "job_enqueued", ... })`**.
   - `emitRuntimeEvent` para `run_created`, `intake_completed`, `clarification_initialized` (best-effort; erros engolidos em `try/catch` vazio).
5. **Resposta HTTP 201** com `runId`, `jobId`, `initialState`, etc.
6. **Cliente `onSuccess`:** `seedIntakeAuditForRun` acrescenta entradas locais convertidas em pseudo-eventos `intake_*`.
7. **SSE:** `MissionRuntimeRoot` mantém `useRuntimeSse`; `useRunEvents` faz merge de eventos do daemon + audits locais.

### 2.2 Fluxograma textual

```
[TaskComposer] --POST /runs--> [runtime-api createRunFromTask]
       |                              |
       |                              v
       |                    executeIntake (disk: docs/.IA/outputs/<runId>/)
       |                              |
       |                              v
       |                    executeClarification passivo (session + phase2 init)
       |                              |
       |                              v
       |                    enqueueJob -> job_enqueued (events.jsonl)
       |                              |
       |                              v
       |                    emitRuntimeEvent: run_created, intake_completed,
       |                               clarification_initialized (se clarify.ok)
       |                              |
       v                              v
[seedIntakeAuditForRun]       HTTP 201 { runId, jobId, ... }
       |
       v
[useRunEvents merge: SSE + intake/clarify/exec/strategy audits]
```

---

## 3. Fluxo esperado (mental modelo operador)

- Pesquisar artefactos no **directório do projecto registado** (`projectRoot` na API/registry), tipicamente **`.../docs/.IA/outputs/<runId>/`**.
- Esperar `run-context.json` após intake bem-sucedido.
- Esperar `clarification-session.json` após primeira clarificação passiva com init.
- **Não** esperar `clarification-questions.json` imediatamente após só o init — só após geração de perguntas (`persistQuestionGeneration`).
- Com **`skipLlm: true`**, não esperar markdowns `task-discovery.md` / `task-plan-initial.md` até se mudar política de metadata ou cliente.

---

## 4. Diferenças (esperado vs observado)

| Aspecto | Esperado pelo operador | Comportamento actual |
|--------|-------------------------|----------------------|
| Pasta de artifacts | Um único “data dir” global | Por **projectRoot** + convenção **docs/.IA/outputs** |
| Nomes | `task-plan.md` | **`task-plan-initial.md` / `task-plan-refined.md`** |
| Perguntas após “Clarificação inicializada” | Ficheiro já existe | Init só cria sessão; **perguntas noutro passo** |
| Timeline vs disco | Reflector fiável dos ficheiros | **Audit client-side** pode **antecipar** mensagens |
| LLM | Liga por defeito no produto | Mission Control envia **skip LLM** |

---

## 5. Eventos: origem, artifact real?, mock?

Legenda: **FS** = verificação em disco no cliente; **Daemon** = `events.jsonl` + SSE.

| Evento / tipo | Origem (ficheiro → função) | Condição | Depende de artifact real? | Mock / sintético? |
|---------------|----------------------------|----------|---------------------------|-------------------|
| `job_enqueued` | `queue-store.js` → `enqueueJob` → `emitRuntimeEvent` | Job criado na fila | Não (persistência de fila) | Não |
| `run_created` | `run-intake-api.js` → `emitRuntimeEvent` | Após intake+clarify+enqueue bem-sucedidos | Indirectamente (pipeline já escreveu) | Não |
| `intake_completed` | Idem | Idem | Idem | Não |
| `clarification_initialized` | Idem | `clarify.ok` | Sessão já gravada no servidor | Não |
| `intake_creating_run` | `intake-audit-store.ts` → `seedIntakeAuditForRun` → `intakeAuditToRuntimeEvent` | Sempre após sucesso do mutation | **Não** | **Sim (cliente)** |
| `intake_intake_running` | Idem (mensagem fixa “artifacts phase1 disponíveis”) | Idem | **Não** | **Sim (cliente)** |
| `intake_clarification_required` | Idem | Se `clarificationRequired` na resposta API | **Não** verifica perguntas em disco | **Sim (cliente)** |

**Nota:** `emitRuntimeEvent` em `run-intake-api.js` está dentro de `try/catch` vazio — falha ao append em `events.jsonl` **não rebenta** o pedido; o cliente ainda recebe 201 e o audit local continua a pintar a timeline.

---

## 6. Onde cada artifact “deveria” nascer (servidor)

| Artifact | Função / módulo | Chamado em `createRunFromTask`? | Com `skipLlm: true` |
|----------|-----------------|----------------------------------|---------------------|
| `run-context.json` | `intake-runtime.js` → `executeIntake` | Sim | Sim (phase1.llm = skipped) |
| `clarification-session.json` | `clarification-runtime.js` → init passivo | Sim (primeira clarify) | Sim |
| `clarification-questions.json` | `question-generator.js` via `persistQuestionGeneration` | **Não** na mesma invocação que só faz init | N/A até segunda operação |
| `task-plan-initial.md` | `executeIntake` após LLM | Só se LLM completa | **Não gerado** |
| `task-plan-refined.md` | `plan-refiner.js` / `--refine` | Não no create run | Não |
| `approval-state.json` | `approval.js` / fluxo approve | Não no create run | Não |

**Índice global:** `core/run-resolver.js` → `writeRunIndex` grava **`<repo setup-boss>/.setup-boss/runs/<runId>.json`** (caminho fixo ao **checkout do setup-boss**, **não** deriva de `SETUP_BOSS_DATA_DIR`). Útil para resolver `runId` → pasta real no projeto.

---

## 7. Daemon / env / flags relevantes

| Variável / flag | Efeito observado |
|-----------------|------------------|
| `SETUP_BOSS_DATA_DIR` | Prefixo do estado do daemon (fila, events, pid). **Não** redirecciona `docs/.IA/outputs`. |
| `SETUP_BOSS_PROJECTS_DIR` | Raiz de clones git geridos (quando aplicável). |
| `metadata.skipLlm` no `POST /runs` | **`true` no Mission Control** → intake LLM skipped; clarify UI também força skip noutras acções. |
| Modo “offline” na lista de runs | Se `connection.reachable === false`, `useRuns` devolve `source: "offline"` e `useRunEvents` mostra sobretudo audits — **sem** SSE do daemon. |

Não foi encontrado um “runtime fake” dedicado no daemon para este fluxo: **o pipeline de ficheiros corre no handler HTTP**; o que há é **política de skip LLM** + **narração client-side**.

---

## 8. Falhas silenciosas (pontos de atenção)

- `run-intake-api.js`: `catch {}` à volta de `emitRuntimeEvent` — eventos omitidos sem erro visível ao cliente.
- `runtime-events.js`: `emitRuntimeEvent` retorna `null` se append falhar — sem propagação.
- `queue-store.js`: vários `catch (_) { /* */ }` em caminhos auxiliares (project upsert).
- Estes padrões **não impedem** escrita de artifacts em intake/clarify bem-sucedidos; afectam sobretudo **observabilidade** de eventos.

---

## 9. UI: fonte de verdade

- **Estado de negócio persistido:** disco no **projectRoot** (IA outputs) + job na fila do daemon + índice `.setup-boss/runs` no repo setup-boss.
- **Timeline:** merge de **SSE/API** (`useRuntimeEvents`) com **stores de audit** (`intake-audit-store`, etc.). Os tipos `intake_*` vindos do audit **não** são prova de artifacts.
- **Clarificação detalhada:** API `/runs/:id/clarification` e reads no servidor; mocks existem em `frontend/lib/mocks/*` para desenvolvimento offline, mas o fluxo Mission Control descrito usa API real quando reachable.

---

## 10. Root cause provável (para o sintoma relatado)

1. **Procura no disco no caminho errado** (`C:\setup-boss-data` vs **`registration.projectRoot/docs/.IA/outputs/<runId>`**).
2. **Expectativa de ficheiros que o primeiro passo não gera** (`clarification-questions.json`, `task-plan.md`, `approval-state.json`).
3. **Mensagens da timeline que não validam filesystem** (`seedIntakeAuditForRun`).
4. **`skipLlm: true` fixo no UI** → ausência esperada de markdowns de intake LLM.

O runtime **não** está totalmente “mockado” no backend para este caminho: há execução real de `executeIntake` / `executeClarification`. A **narração visual** é que pode estar **desalinhada** e **incompleta** relativamente aos nomes/caminhos esperados pelo operador.

---

## 11. Correções futuras (priorizadas — apenas lista)

1. **Documentação operacional:** comando/paths para localizar outputs (projectRoot + runId + índice `.setup-boss/runs`).
2. **Alinhar texto do audit client-side** com o que foi realmente garantido (ex.: não dizer “perguntas disponíveis” sem GET clarification ou sem verificação).
3. **Rever política `skipLlm`:** default explícito no produto (`false` quando há API key?) ou toggle na UI.
4. **Opcional:** segunda chamada ou passo explícito para `persistQuestionGeneration` no fluxo Mission Control se o produto exige `clarification-questions.json` já na criação.
5. **Observabilidade:** deixar de engolidar erros de `emitRuntimeEvent` em silêncio (futuro).
6. **Consistência `SETUP_BOSS_DATA_DIR` vs índice `runs`:** hoje o índice está fixo ao checkout — avaliar se deve seguir o mesmo prefixo que o daemon para operações com DATA_DIR isolado.

---

## 12. Riscos arquiteturais

- **Dupla noção de “estado setup-boss”:** daemon configurável via `SETUP_BOSS_DATA_DIR` vs índice de corridas em `.setup-boss/runs` fixo ao repo — risco de confusão em ambientes isolados.
- **Timeline como UX sem invariantes:** merge de eventos reais + sintéticos sem um modelo declarado de “o que implica IO completo”.
- **Skip LLM implícito:** várias camadas assumem skip (`TaskComposer`, `run-intake-api` default), o que é óptimo para testes mas **fraco** como produto “full pipeline”.
- **Contrato de nomes:** operadores que buscam `task-plan.md` nunca encontram ficheiros — contract drift entre docs mental e código.

---

## Referências rápidas de código

- Submit UI + `skipLlm: true`: `frontend/components/features/intake/TaskComposer.tsx`
- Audit sintético: `frontend/stores/intake-audit-store.ts`, `frontend/hooks/use-create-run.ts`
- Merge timeline: `frontend/hooks/use-run-events.ts`
- Proxy Next → daemon: `frontend/app/api/runtime/[[...segments]]/route.ts`
- Orquestração create run: `scripts/daemon/lib/run-intake-api.js`
- Resolução de pasta IA: `scripts/shared/ia-path-resolver.js`
- Índice run → output: `core/run-resolver.js` (`writeRunIndex`, `resolveOutputDir`)
