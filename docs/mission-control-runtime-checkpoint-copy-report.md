# Relatório — Checkpoints operacionais na Mission Control (UX)

## 1. Problema UX

- Os marcos do fluxo principal repetiam rótulos genéricos (“Job enfileirado”, “Intake concluído”, …) herdados do catálogo técnico de eventos.
- O utilizador não via **o que mudou**, **porque importa**, **o que vem a seguir** nem **se precisa de agir**, numa só leitura.
- O corpo do card era essencialmente a mensagem técnica do `map-event`, formato “log”.
- Existia risco de **misturar eventos** de contextos diferentes se `runId`/`jobId` não estivessem alinhados com o resumo da corrida seleccionada.

## 2. Regra nova dos checkpoints

Cada marco no **fluxo principal** (cards dentro de `ExecutionStepBlock` para eventos `milestone`) deve:

1. Responder, em linguagem clara: o que aconteceu, porquê importa, o que foi produzido/validado.
2. Mostrar **detalhes** em pares etiqueta/valor (sem jargão no título).
3. Indicar **próximo passo** operacional.
4. Indicar **responsável**: Sistema / Você / Execução automática.
5. Expor **severidade** coerente (info, sucesso, aviso, erro) para o canto do card (“Ativo”, “Atenção”, “Erro”, …).

O **stream técnico** (`RunActivityStream`, timeline) mantém o formato anterior; não se removeu diagnóstico.

## 3. Helper e componentes criados ou alterados

| Peça | Função |
|------|--------|
| `frontend/lib/runtime/adapters/runtime-checkpoint-copy.ts` | **`formatRuntimeCheckpoint(ev, ctx)`** — copy central PT e fallback seguro |
| `frontend/components/features/execution-timeline/OperationalCheckpointBody.tsx` | Layout do card operacional (descrição, detalhes, próximo passo, responsável, rodapé técnico) |
| `frontend/components/features/execution-timeline/ExecutionStepBlock.tsx` | Cantos “Ativo / Atenção / Erro”, tipografia menos “log” |
| `frontend/lib/runtime/adapters/dynamic-activity-steps.ts` | Usa o helper para **título** do passo; **dedupe** de `job_enqueued`, `run_created`, `intake_completed`; `checkpoint` em `ActivityStepInstance` |
| `frontend/components/features/run-detail/RunViewShell.tsx` | Passa `projectLabel`; renderiza `OperationalCheckpointBody` + linha técnica `hora · tipo` |
| `frontend/lib/api/runtime-types.ts` | `payload?: Record<string, unknown> \| null` em `RuntimeEventDto` |
| `frontend/lib/runtime/adapters/map-event.ts` | Preenche `payload` a partir de `data` da API |
| `frontend/lib/runtime/adapters/run-event-filter.ts` | Se existir `summary.runId`, **exclui** eventos cujo `runId` não coincide (reduz mistura entre corridas) |
| Auditors (`*audit-store.ts`) | `payload` mínimo (`kind`, `phase`, etc.) para o helper |

Nenhuma alteração ao **pipeline** Node/daemon.

## 4. Eventos mapeados (prioridade)

Com texto dedicado (ou ramo específico antes do fallback):

- `job_enqueued`
- `run_created`
- `intake_completed`
- `clarification_initialized` (ramos `questionsCount === 0` vs `> 0`)
- `clarification_questions_generated`
- `answers_submitted` / clarificação HITL
- `refinement_generated`, `approval_requested`, `approved`, `rejected`, `refinement_requested`
- `execution_started`, `retry_started`, `execution_completed`
- `review_started`, `review_rejected`, `review_completed`
- `correction_started`, `correction_completed`
- `run_failed`, `job_failed`, `execution_failed` (e padrão `*_failed`)
- `strategy_started` / `subtasks_planned`
- Tipos `intake_*` (auditoria cliente)

Eventos futuros ou não listados caem no **fallback**: descrição a partir da mensagem existente + linha “Evento (detalhe)” sem assumir mock.

## 5. Antes / depois (resumo de copy)

| Antes (título aproximado) | Depois (exemplo) |
|---------------------------|------------------|
| Job enfileirado | **Pedido recebido** + fila local + etapa seguinte |
| Corrida criada | **Corrida criada** + espaço isolado + análise da entrada |
| Intake concluído | **Entrada analisada** + classificação humana + próximo passo conforme `needs_context` |
| Clarificação inicializada (0 perguntas) | **Clarificação aguardando perguntas** + aviso explícito |
| Perguntas geradas | **Perguntas prontas** + contagem + origem quando disponível |

Títulos evitam “job”, “enqueue”, “payload”, “phase2” no título principal; termos técnicos ficam na **linha de rodapé** (`hh:mm:ss · tipo_do_evento`).

## 6. Validações

- `cd frontend && npx tsc --noEmit` — **OK** após as alterações.
- Smoke manual sugerido: criar atividade, percorrer clarificação/execução, confirmar cards legíveis; confirmar que o bloco “Timeline resumida e stream técnico” ainda mostra eventos completos; trocar de corrida na sidebar e verificar que o fluxo principal não “puxa” eventos de `runId` diferente do resumo actual.

## 7. Limitações restantes

- Conteúdo rico (ex. “modo skip LLM”) depende de campos presentes no **payload** do daemon; `job_enqueued` pode não trazer `skipLlm` até o backend expor no `data` do evento.
- Alguns tipos pedidos no briefing (`task_plan_initial_created`, `approval_approved` como nome canónico) **podem não existir** na API — o fallback cobre esses casos sem mentir.
- Dedupe limitado a três tipos “singleton” por corrida; outros duplicados raros continuam visíveis (preferível a esconder falhas).

## 8. Próximos passos

- Opcional: enriquecer `data` de `job_enqueued` / `run_created` no daemon com `skipLlm` e rótulo de projecto amigável **sem** mudar a semântica do pipeline.
- Testes unitários isolados para `formatRuntimeCheckpoint` e `eventBelongsToRunSelection` (casos `runId` cruzado).
- Harmonisar rótulos da barra lateral de passos com `checkpoint.title` (já usado como `title` do `ActivityStepInstance`).

---

**Resposta única ao pedido de UX:** os checkpoints operacionais passam a ser produzidos por **`formatRuntimeCheckpoint`** e apresentados por **`OperationalCheckpointBody`**, com filtro de run mais estrito e dedupe mínimo, **sem** remover o stream técnico nem alterar o runtime.
