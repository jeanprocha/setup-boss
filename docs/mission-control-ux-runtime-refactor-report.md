# Mission Control — Relatório de refactor UX (fluxo runtime)

Documento de entrega incremental sobre a reorganização da experiência do **Mission Control** para separar entrada da tarefa, estado operacional, workspace por etapas, timeline resumida e stream técnico secundário, mantendo stack, visual base e compatibilidade com o runtime/SSE actuais.

---

## 1. Problemas encontrados

- **Passos encavalados**: vários blocos pareciam repetidos (intake + marcos de evento + “live phase”) sem hierarquia clara entre etapa activa, concluída e dependente do utilizador.
- **Ruído na timeline**: a timeline consumia os mesmos eventos que o feed técnico, incluindo granularidade fina e ruído útil só para diagnóstico.
- **Stream técnico competindo com o fluxo**: o event stream tinha o mesmo peso visual que o restante conteúdo central.
- **CTA “Iniciar execução”**: após criação da corrida, o formulário podia continuar a parecer “modo edição” com CTA visível (corrigido em `TaskComposer`: modo só-composer apenas antes de existir `runId`).
- **Origem dos eventos pouco legível**: faltava distinção explícita entre eventos com evidência no runtime e marcas `client-audit` / `notArtifactBacked` / inferidos.

---

## 2. Estratégia de UX aplicada

1. **Entrada da tarefa isolada** no topo do fluxo com corrida activa, envelopada na **Etapa 1 · Intake** (`MissionWorkspacePhase`), com `TaskComposer` em modo readonly após existir corrida persistida.
2. **Estado operacional protagonista** via **`OperationalFocusCard`**: título derivado de `resolveOperationalHeadline` + hint de atenção HITL (`deriveAttentionHint`) + último evento escopo corrida.
3. **Workspace central em etapas 2–4**: Clarificação, SPEC/Estratégia e Execução dentro de `MissionWorkspacePhase` com badges **ACTIVE / WAITING / PENDING / COMPLETED / BLOCKED** (`deriveMissionWorkspaceStatuses`).
4. **Timeline operacional filtrada**: `filterOperationalTimelineEvents` antes de `normalizeTimelineItems` — menos spam; texto da timeline clarifica que é resumo filtrado.
5. **Stream técnico secundário**: `RunActivityStream` passou a `<details>` colapsável por defeito, cabeçalho “debug / SSE”, badges de origem por evento (`runtime` | `client` | `inferred`).
6. **Sem mocks nem mascaramento**: não se inventam estados; apenas reorganização visual e filtros documentados na timeline; todos os eventos continuam disponíveis no stream técnico.

---

## 3. Componentes alterados

| Área | Ficheiro | Alteração principal |
|------|-----------|---------------------|
| Shell da corrida | `frontend/components/features/run-detail/RunViewShell.tsx` | Split intake vs cauda de marcos; cartão operacional; fases 2–4; timeline filtrada; helpers `deriveAttentionHint` / `deriveMissionWorkspaceStatuses` |
| Stream | `frontend/components/features/run-detail/RunActivityStream.tsx` | `<details>` colapsável; badges DEBUG/SSE/sync; origem por evento |
| Timeline | `frontend/components/features/run-detail/RuntimeTimeline.tsx` | Subtítulo “resumo operacional / filtrado” |
| Fases | `frontend/components/features/run-detail/MissionWorkspacePhase.tsx` | `stepNum` 1–4; prop opcional `id` para âncoras |
| Composer | `frontend/components/features/intake/TaskComposer.tsx` | Correcção `useRunSummary` (DTO directo, não `.data`) |
| Adaptadores (já existentes / reutilizados) | `frontend/lib/runtime/adapters/timeline-normalize.ts` | `filterOperationalTimelineEvents` |
| | `frontend/lib/runtime/adapters/dynamic-activity-steps.ts` | `resolveOperationalHeadline` |
| | `frontend/components/features/run-detail/OperationalFocusCard.tsx` | Integração no shell (componente já criado na mesma iniciativa) |

---

## 4. Fluxo visual antes / depois

**Antes (resumo)**

- Lista única de `ExecutionStepBlock` com intake misturado com marcos + texto longo na “live phase”.
- Timeline e stream lado a lado com o mesmo nível de detalhe.
- CTA de execução podia sobrepor-se semanticamente ao estado pós-submit.

**Depois (resumo)**

1. **Barra sticky** (acções + banner de orquestração) inalterada na função.
2. **Etapa 1 · Entrada** → composer readonly + estado intake.
3. **Estado operacional** → cartão único com headline e hints HITL.
4. **Marcos** (eventos filtrados pela navegação existente) + linha curta na live phase a remeter ao cartão operacional.
5. **Etapas 2–4** em painéis com estado superficial (badge).
6. **Grelha final**: timeline filtrada | stream técnico colapsável.

*(Diagrama mental: Composer → Estado → Marcos → Painéis → Resumo + Debug)*

---

## 5. Mudanças no comportamento do CTA

- **`TaskComposer`**: `composeOnly = newActivityFlow && !runId` — botão **Iniciar execução** apenas quando ainda não há corrida persistida seleccionada.
- Após submit / selecção de run com `runId`: campos passam a readonly, mostram badges de fase/estado e acção **Nova tarefa** (reset do fluxo).
- **`RunViewShell`** no modo corrida activa não volta a mostrar `TaskSubmissionCard` no bloco intake (evita sensação de “ainda a criar corrida”).

---

## 6. Como os estados funcionam agora

- **`OperationalFocusCard`**: reflecte `RunSummaryDto.state`, `phase`, headline (`resolveOperationalHeadline`) e último evento do hook `useRunOperational`.
- **`deriveMissionWorkspaceStatuses`**: combina `mapRawPhaseToLifecycleId(summary.phase)`, bundles de clarificação/estratégia e `execution.lifecyclePhase` para etiquetas **ACTIVE / WAITING / PENDING / COMPLETED / BLOCKED** por etapa.
- **`deriveAttentionHint`**: mensagens curtas quando há dependência explícita do utilizador (respostas SPEC, aprovação SPEC, revisão de estratégia, `waiting_approval` na execução).
- Estados inválidos ou falhas não são escondidos: **BLOCKED** / badges de severidade mantêm-se visíveis nos painéis e no stream completo.

---

## 7. Timeline vs event stream

| Aspecto | Timeline (`RuntimeTimeline`) | Stream (`RunActivityStream`) |
|---------|------------------------------|------------------------------|
| Fonte | `normalizeTimelineItems(filterOperationalTimelineEvents(events))` | `events` completos (ordenados reverso) |
| Objetivo | Resumo operacional humano | Diagnóstico técnico |
| UI | Sempre visível na grelha | `<details>` **fechado por defeito** |
| Filtros | Remove `notArtifactBacked`, corta ruído (`scheduler_tick`, etc.), intake excepto `intake_completed` | Sem filtros — lista integral |
| Rótulos | Subtítulo explica filtro | Badges `runtime` / `client` / `inferred` + tipo SSE |

SSE permanece a alimentar a mesma query/stream; apenas a **prioridade visual** mudou.

---

## 8. Screenshots

Não foram anexadas capturas automáticas neste relatório (ambiente de desenvolvimento sem pipeline de screenshot). **Recomendação**: capturar manualmente três momentos — (1) só composer antes da corrida, (2) clarificação à espera de respostas, (3) execução com stream técnico expandido.

---

## 9. Limitações restantes

- **Dupla moldura**: intake está dentro de `ExecutionStepBlock` e de `MissionWorkspacePhase` — pode haver ligeira redundância visual (aceite como melhoria incremental).
- **Heurísticas de fase**: `deriveMissionWorkspaceStatuses` é baseada em regras declarativas; corridas com fases atípicas podem mostrar **PENDING** onde um operador esperaria **ACTIVE** até haver bundle/query actualizada.
- **Timeline filtrada**: eventos úteis mas “barulhentos” podem continuar de fora do filtro — rever lista em `filterOperationalTimelineEvents` com base a dados reais de produção.
- **`details` nativo**: comportamento de teclado/acessibilidade depende do browser; não há animação custom.

---

## 10. Próximos passos recomendados

1. **Validação com utilizadores**: validar se o stream colapsado por defeito é encontrado (vs memorizar último estado `localStorage`).
2. **Afinar filtro da timeline** por tipo de evento real mais frequente no vosso daemon (lista branca em vez de exclusões).
3. **Opcional**: extrair `deriveMissionWorkspaceStatuses` para módulo testável unitariamente com fixtures de `RunSummaryDto`.
4. **Opcional**: ligar badge da Etapa 1 a um estado “ACTIVE” durante ingestão inicial se o backend expuser sub-estado de intake explícito.

---

*Data do relatório: 2026-05-15 · Escopo: refactor UX incremental; sem alteração de stack nem de contratos de API.*

---

## 11. Limpeza UI subsequente (2026-05-15)

Remoção de cards redundantes, simplificação da barra de controlos do runtime e CTA duplicados — ver documento dedicado: [`docs/mission-control-ui-cleanup-report.md`](mission-control-ui-cleanup-report.md).

