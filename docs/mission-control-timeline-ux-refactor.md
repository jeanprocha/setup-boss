# Mission Control — refactor UX da timeline (coluna central)

**Data:** 2026-05-15  
**Escopo:** coluna central do shell de missão (feed de execução), não a barra lateral nem o painel inferior oculto.

---

## 1. Auditoria (estado actual)

### 1.1 Composição da coluna central

| Peça | Ficheiro | Função |
|------|----------|--------|
| Região + cabeçalho “Actividade” | `frontend/components/features/run-detail/RunViewShell.tsx` | `section` com `bg-workspace`, header fino |
| Contentor scroll + ritmo vertical | `frontend/components/features/execution-timeline/ExecutionFeed.tsx` | `max-w-3xl`, `space-y-5`, `px-3`, `pb-32` |
| Cartões de passos dinâmicos (milestones / live) | `ExecutionStepBlock` + conteúdo em `RunViewShell` | Lista de instâncias (`buildActivityStepInstances`) |
| Foco operacional resumido | `frontend/components/features/run-detail/OperationalFocusCard.tsx` | Cartão entre intake e cauda |
| Painéis de workflow (clarify / strategy / exec) | `frontend/components/features/run-detail/MissionWorkspacePhase.tsx` | **Fora** da sequência de `ExecutionStepBlock` na ribbon operacional |
| Índice lateral (opcional) | `frontend/components/features/execution-timeline/RightTimelinePanel.tsx` + `ExecutionTimelineNav.tsx` | Navega por `scrollToExecutionAnchor` |
| Evento técnico inline | `frontend/components/features/execution-timeline/ExecutionEventItem.tsx` | Caixa pequena mono |
| Corpo de checkpoint | `frontend/components/features/execution-timeline/OperationalCheckpointBody.tsx` | Texto + `dl` + “Próximo passo” + actor |

**Nota:** `frontend/components/features/run-detail/RuntimeTimeline.tsx` existe (linha vertical + dots por severidade) mas **não há imports** noutros `.tsx` no frontend — não faz parte do fluxo actual do Mission Control.

### 1.2 Modelo de estado visual actual

**`ExecutionStepBlock`** (`ExecutionStepSurfaceStatus`): `pending` | `active` | `done` | `blocked`.

- Diferenças visuais baseadas sobretudo em `border-*` com opacidade baixa, `bg-card` com variações de opacidade e sombra discreta no `active`.
- Hint textual no canto (`StepHint`): “Ativo”, “Concluído”, “Pendente”, “Interrompido”, “Atenção”, “Erro” (via `checkpointSeverity` só quando `active`).
- **Não existe** estado explícito “aguarda utilizador” neste componente.

**`MissionWorkspacePhase`** (`MissionWorkspacePhaseStatus` em `frontend/lib/runtime/mission/mission-workflow-stages.ts`): já inclui `WAITING_USER_ACTION`, `RUNNING`, `BLOCKED`, `FAILED`, etc., com `STATUS_STYLE` e badges — **linguagem visual mais rica** que nos `ExecutionStepBlock`.

**Ganho de produto:** o utilizador vê dois “sistemas de cartão” empilhados (passos dinâmicos vs fases de missão) sem eixo comum nem continuidade visual — reforça a sensação de “lista de blocos” em vez de pipeline.

### 1.3 Tokens e tema

- `frontend/app/globals.css`: variáveis shadcn + **tokens semânticos de runtime** (`--sb-running`, `--sb-warning`, `--sb-failed`, `--sb-success`, `--sb-blocked`, …), `--workspace`, `--sidebar-primary`.
- `frontend/styles/mission-shell.css`: quase vazio (placeholder).
- **Conclusão:** tokens para estados de execução já existem; falta **aplicação consistente** na coluna central e hierarquia tipográfica.

### 1.4 Causa raiz dos problemas relatados

1. **Cartões “grudados”:** `ExecutionFeed` usa `space-y-5` mas `ExecutionStepBlock` e `MissionWorkspacePhase` partilham paleta `card`/`border` com contraste subtil; `done`/`pending` usam opacidade global no cartão, o que reduz contraste sem aumentar separação percetível.
2. **Estado actual pouco evidente:** o “passo activo” vem do scroll spy (`useExecutionScrollSpy`) + `highlightIndex`; visualmente compete com `OperationalFocusCard` e com painéis `MissionWorkspacePhase` que têm o seu próprio `hero`/`muted`.
3. **Interacção humana:** a lógica já existe em `deriveMissionWorkspaceStatuses` (`WAITING_USER_ACTION` para `waiting_answers` / `awaiting_approval`); **não** é propagada de forma uniforme para milestones em `ExecutionStepBlock` nem para `OperationalCheckpointBody` (actor “Você” está no texto, sem tratamento de destaque).
4. **Hierarquia:** títulos ~12–13px, metadata em mono 9–10px; pouca separação tipográfica entre “título de etapa”, “estado”, “corpo” e “CTA”.
5. **“Lista” vs pipeline:** não há conector vertical partilhado entre `ExecutionStepBlock`, `OperationalFocusCard` e `MissionWorkspacePhase`; o índice na direita é independente.

### 1.5 Impacto

- **Utilizador:** mais tempo a localizar onde agir e onde está o runtime.
- **Engenharia:** qualquer refactor visual limpo deve **unificar** sem duplicar regras de negócio — preferir uma camada de “presentação de passo” alimentada pelos mesmos derivadores (`mission-workflow-stages`, `dynamic-activity-steps`, checkpoints).

---

## 2. Princípios visuais (alvo)

1. **Hierarquia primeiro:** título > estado > acção > metadata técnica (sempre mais fraca ou colapsável).
2. **Um eixo, uma história:** um rail vertical com nós alinhados a todos os blocos da coluna central (passos + foco + fases).
3. **Estado antes de decoração:** cor reforça; ícone, borda lateral e texto redundante garantem leitura sem só cor.
4. **Respiração:** aumentar separação **entre** cartões (gutter) sem só aumentar padding interno; sombra e raio consistentes com tokens existentes.
5. **Sem cyberpunk:** um único accent por modo (activo vs aguarda humano vs erro); glow máximo leve e só no foco actual.

---

## 3. Modelo de hierarquia (proposto)

| Camada | Conteúdo | Tratamento sugerido |
|--------|-----------|---------------------|
| **A — Identidade do passo** | Número de pipeline + título curto | `text-sm` semibold, tracking ligeiro |
| **B — Estado** | COMPLETED / ACTIVE / … | Badge compacto + ícone (check, pulse, user, alert) |
| **C — Narrativa** | Headline / descrição operacional | `text-[13px]` corpo, cor `foreground` |
| **D — Acção** | CTA, formulários, aprovação | Zona com fundo `accent` ou borda `WAITING_USER_ACTION` |
| **E — Metadata** | timestamps, IDs, tipo de evento | Mono `text-[10px]`, `muted`, opcionalmente `details/summary` |

---

## 4. Estados visuais padronizados (mapa único)

Alinhar a UI à mesma enum conceitual (pode mapear internamente desde `MissionWorkspacePhaseStatus` + derivados do summary):

| Estado | Leitura | Tratamento sugerido |
|--------|---------|---------------------|
| **COMPLETED** | Passo fechado | Fundo ligeiramente esbatido, borda neutra, ícone check; sem CTA |
| **ACTIVE / RUNNING** | Máquina a trabalhar | Accent `sidebar-primary` ou `sb-running`; barra lateral 3px; sombra curta |
| **WAITING_USER_ACTION** | Precisa de si | Accent distinto (ex.: cyan/âmbar já usados em `MissionWorkspacePhase`); badge “Sua resposta” / “Aprovação necessária”; ícone `UserRound` |
| **WAITING** | Bloqueado externamente / fila | Neutro com hint; não confundir com utilizador |
| **BLOCKED** | Warning operacional | `sb-warning` + padrão não só cor (ícone triângulo) |
| **FAILED** | Erro | `sb-failed`, borda mais forte, região de retry visível |
| **PENDING / UPCOMING** | Ainda não alcançado | Opacidade reduzida **só** no bloco, não no texto crítico; ou lista colapsada |

**Implementação sugerida:** introduzir um tipo `ExecutionTimelineSurfaceStatus` (ou reutilizar `MissionWorkspacePhaseStatus`) e mapear em **um** primitive de cartão (`TimelineStepCard`) usado tanto por milestones quanto por wrappers das fases, evitando divergência `ExecutionStepBlock` vs `MissionWorkspacePhase`.

---

## 5. Sistema de cartão activo (foco da execução)

**Critério de verdade:** o mesmo índice que alimenta `ExecutionTimelineNav` / `scrollHighlighted` deve pintar **exactamente um** nó como “foco”.

- Barra lateral esquerda no rail + `ring` / `shadow` muito leve no cartão.
- Opcional: animação `pulse` na **bolha do nó** (1.5–2s, opacidade mínima) — não no cartão inteiro.
- `OperationalFocusCard` pode ser fundido como **nó “Estado operacional”** dentro do rail (em vez de cartão flutuante sem índice), para o olho seguir uma sequência única.

---

## 6. Sistema “aguarda utilizador”

**Fontes de verdade já existentes:**

- `deriveMissionWorkspaceStatuses` — fases clarify/strategy/exec.
- `RuntimeCheckpointPresentation.actor === "user"` em checkpoints (`OperationalCheckpointBody`).

**UX desejada:**

- Badge persistente: “Aguardando ação” / copy específica por tipo (respostas, aprovação, iniciar estratégia).
- Zona de acção com contraste moderado (não banner agressivo).
- Se o passo activo for `WAITING_USER_ACTION`, prioridade visual **acima** de `ACTIVE` puro (dois níveis de accent: humano > máquina).

---

## 7. Regras de espaçamento (proposto)

- **Entre passos do pipeline:** `gap` vertical 24–32px (`space-y-6` / `space-y-8`) no contentor do rail, não só no cartão.
- **Padding interno do cartão:** mínimo `p-4` no desktop; manter `p-3.5` só em `muted`.
- **Rail:** coluna fixa ~20–24px à esquerda do `max-w-3xl` com linha `1px` + nós `size-2.5`–`3`; alinhar ao header de cada cartão.

---

## 8. Arquitectura da timeline (componental)

```
ExecutionFeed
  └── ExecutionTimelineRail (novo)
        ├── rail spine + connectors
        └── children: ordered nodes
              ├── TimelineStepNode + OperationalFocusNode (opcional fundido)
              ├── TimelineStepNode + ExecutionStepBlock content
              └── MissionWorkspacePhase (refactor para usar mesma casca ou slot)
```

**`RightTimelinePanel`:** mantém-se como índice; o rail central deve **reflectir os mesmos anchors** (`data-exec-anchor`, `id`) para consistência ao clicar.

**Microinteracções:** `transition` em `border-color`, `box-shadow`, `background-color` (já parcialmente em `ExecutionStepBlock`); hover só em elementos clicáveis; skeletons na carga de `RunViewShell` já parcialmente cobertos por `LoadingState`.

---

## 9. Acessibilidade

- Estados distinguíveis por **texto + ícone + padrão de borda** (não só cor).
- Verificar contraste de `WAITING_USER_ACTION` e `muted` em dark mode (`globals.css` dark).
- `aria-current="step"` no nó focado do rail quando corresponder ao passo activo.

---

## 10. Responsividade

- `ExecutionFeed` já limita largura (`max-w-3xl`); validar com `RightTimelinePanel` aberto (flex shrink).
- Rail: em viewports estreitas, reduzir largura da coluna do rail ou colapsar para **apenas** bolhas alinhadas à borda esquerda do cartão.
- Timeline longa: sticky sub-header já existe noutros padrões (`RuntimeTimeline`); considerar sticky mínimo para “Fase / run” no topo do feed.

---

## 11. Plano de implementação sugerido (fases)

1. **Fase A — Casca unificada:** criar `ExecutionTimelineRail` + `TimelineStepNode`; migrar `ExecutionStepBlock` estilos para tokens compartilhados (sem mudar lógica).
2. **Fase B — Estados:** mapear `WAITING_USER_ACTION` e failed/blocked nos milestones; ligar `attentionHint` / actor `user` ao visual.
3. **Fase C — Foco:** sincronizar rail com `scrollHighlighted`; opcional fundir `OperationalFocusCard` como nó.
4. **Fase D — `MissionWorkspacePhase`:** usar a mesma casca visual ou delegar header ao primitive (reduzir “dois mundos”).
5. **Fase E — QA manual:** checklist abaixo + regressão SSE (`useRunEvents` / `runtime-sse-store`).

---

## 12. Checklist de testes

- [ ] Sequência com vários milestones `done` + um `active`
- [ ] `WAITING_USER_ACTION` na clarificação (respostas e aprovação)
- [ ] Handoff dominante estratégia (`needsDominantStrategyCta` + `StrategyStageHero`)
- [ ] `summary.state === "failed"` com `blocked` no passo correcto
- [ ] Checkpoint com `actor: user` vs `runtime`
- [ ] Timeline longa (muitos `ExecutionStepBlock` + painéis)
- [ ] Actualização SSE (`ssePhase` visível no `live_phase`)
- [ ] Troca de `runId` / projecto (re-hidratação sem estado visual fantasma)

---

## 13. Próximos passos

1. Prototipo estático (Figma ou story em isolamento) com **um** rail e três nós: completed / active / waiting_user.
2. Implementar `ExecutionTimelineRail` e migrar `RunViewShell` sem alterar hooks.
3. Extrair mapa “surface status” para ficheiro partilhado (`lib/runtime/mission/` ou `components/features/execution-timeline/`).
4. Avaliar remoção ou integração de `RuntimeTimeline.tsx` (uso ou documentação como legado).
5. Actualizar `docs/setup-boss-ui-layout-spec.md` ou equivalente **só** quando o layout estiver estável (evitar doc drift).

---

## 14. Referências internas

- `frontend/components/features/run-detail/RunViewShell.tsx` — composição da coluna central  
- `frontend/components/features/execution-timeline/ExecutionStepBlock.tsx` — superfície dos passos dinâmicos  
- `frontend/components/features/run-detail/MissionWorkspacePhase.tsx` — painéis de etapa 2–4  
- `frontend/lib/runtime/mission/mission-workflow-stages.ts` — `MissionWorkspacePhaseStatus`, `deriveAttentionHint`  
- `frontend/lib/runtime/adapters/dynamic-activity-steps.ts` — instâncias da timeline  
- `frontend/app/globals.css` — tokens `--sb-*`, tema claro/escuro  
