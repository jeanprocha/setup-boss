# Mission Control — Clarificação conversacional e hierarquia de superfícies

Relatório da iteração de UI/UX (Maio/2026): refinamento visual do shell, workspace central, painel direito, cartões de clarificação e estados operacionais — **sem alterar o fluxo** (perguntas permanecem em lista; não há wizard “uma pergunta por vez”).

---

## 1. Problemas de UX identificados

- **Superfícies planas**: `background`, `workspace`, `sidebar`, `card` e headers com tons demasiado próximos, pouca leitura de “camadas”.
- **Clarificação “formulário”**: múltiplas caixas, badges competindo (`blocking`, `free_text`, estados em uppercase forte), métricas em três mini-cards.
- **Inputs pesados**: `textarea` com aparência de ERP (borda forte, altura fixa maior que o necessário).
- **Estado “sem perguntas”**: tratado visualmente como alerta (âmbar + ícone de aviso), embora seja frequentemente **informação operacional**.
- **Passo activo vs histórico**: blocos de execução e cartões de corrida não diferenciavam suficientemente foco vs recuo.
- **Scroll / cromo**: barras já tinham sido suavizadas em `globals.css`; mantida a direcção “app premium”, com tokens mais coerentes.

---

## 2. Estratégia visual aplicada

- **Tokens primeiro**: separação clara entre canvas da app (`--background`), área de trabalho (`--workspace` branco puro no claro), header da app (`--shell-header`), `sidebar` ligeiramente acinzentada, bordas com alpha baixo.
- **Dark mode em camadas**: evitar preto chapado; `background` < `workspace` < `card`, `sidebar` ligeiramente deslocado do centro.
- **Micro-elevação**: sombras muito subtis com `color-mix` sobre `--foreground` (claro) ou preto suave (escuro), sem “glassmorphism” exagerado.
- **Conversação**: tipografia de pergunta mais forte (13px, `font-medium`), IDs técnicos mais discretos; menos ruído de metadados.

---

## 3. Surface hierarchy criada

| Região | Comportamento |
|--------|----------------|
| **Header (`AppChrome`)** | `bg-shell-header` + blur; separador inferior suave; lê-se como barra de aplicação. |
| **App root** | `bg-background` (off-white claro / cinza profundo escuro). |
| **Coluna central** | Sombra interior à esquerda para separar do rail lateral (`AppShell`). |
| **Workspace (`RunViewShell`)** | `bg-workspace`; subcabeçalho “Actividade” alinhado ao canvas (menos “card cinzento”). |
| **Rail lateral** | `bg-sidebar` com tokens dedicados; sem competir com o branco do centro. |
| **Painel direito** | `RightTimelinePanel` com sombra lateral leve — leitura de painel contextual. |
| **Cartões** | `Surface` com variante `conversation` (anéis/bordas suaves); fases em `MissionWorkspacePhase` com bordas mais leves. |

---

## 4. Melhorias na clarificação

- **Lista preservada**; secções renomeadas para tom mais conversacional: “Em aberto” / “Já respondidas”.
- **Resumo de progresso**: bloco único com barra horizontal + contagens (substitui três tiles).
- **Perguntas**: `Surface variant="conversation"`; badge de tipo removido (o controlo implícito indica o tipo); **blocking** renomeado para **“Obrigatória”** com estilo mais discreto.
- **Estados de pergunta** (`QuestionStatusBadge`): pill suave, menos cyan/neon.
- **Estado runtime “Sem perguntas geradas”** (`ClarificationStateBadge`): tom **informativo** (ícone `Info`, fundo `muted`), não alerta crítico.
- **Bloco “init sem perguntas”** no painel: caixa neutra (`muted` + borda suave) em vez de âmbar agressivo; falha de geração local continua comunicada no texto.
- **Textarea** (`AnswerInput`): altura mínima baixa, **auto-expand** até limite (~280px), foco com anel `sidebar-primary` suave; opções de escolha única alinhadas ao mesmo vocabulário visual.

---

## 5. Mudanças nos tokens (referência)

Ficheiro: `frontend/app/globals.css`.

- **Novo**: `--shell-header` (mapeado em `@theme` como `--color-shell-header` → utilitário Tailwind `bg-shell-header`).
- **Claro**: `--background` mais fresco (~ off-white); `--workspace` `#fff`; `--sidebar` levemente acinzentado; `--border` com transparência; `--input` alinhado a preenchimentos suaves.
- **Escuro**: camadas explicitamente escalonadas; `--sidebar-primary` ligeiramente menos saturado para evitar “neon”.

---

## 6. Before / after (comportamental)

| Aspecto | Antes | Depois |
|---------|--------|--------|
| Métricas clarificação | 3 células com borda | Uma faixa + barra de progresso |
| Badge `free_text` / `blocking` | Ruído explícito | Tipo omitido; blocking discreto (“Obrigatória”) |
| `clarification_empty` | Âmbar + triângulo | Muted + info |
| Passo de timeline inactivo | Semelhante ao activo | Mais opaco / menos peso |
| Cartão de corrida não seleccionado | Peso visual próximo do seleccionado | Opacidade e saturação reduzidas |
| Textarea | `rows={3}` fixo | Auto-altura, mínimo compacto |

---

## 7. Screenshots

Nesta execução **não foram capturadas** imagens automáticas. Validação recomendada: tema claro/escuro, lista de perguntas longa, respostas antigas visíveis, painel direito aberto.

---

## 8. Validações

- **`npx tsc --noEmit`** (pasta `frontend`) — executado na validação final do PR.
- **Smoke manual** (checklist do pedido):
  - Tema claro e escuro.
  - Clarificação com lista completa visível.
  - Responder e reeditar fluxo existente (sem mudança de API).
  - Conforto visual: hierarquia header / lateral / centro / painel direito.
  - Foco no passo activo na timeline e na secção em destaque.

---

## 9. Limitações restantes

- **SectionHeader** partilhado: outras áreas (strategy, execution, etc.) herdam tipografia menos “uppercase enterprise”, mas o padding por defeito (`px-3`) mantém consistência com blocos internos.
- **A11y**: barra de progresso usa `role="progressbar"` com percentagem de **perguntas respondidas**; não representa sub-passos do runtime.
- **Densidade**: actividades com muitos marcos ainda empilham scroll; optimização futura pode envolver colapsar histórico (fora do âmbito deste pedido).

---

## 10. Próximos refinamentos sugeridos

- Token dedicado **`--workspace-elevated`** para ribbons sticky vs corpo.
- Variante **`Surface`** “ghost” para blocos puramente textuais dentro da clarificação.
- Harmonizar **ExecutionPanel** / **StrategyPanel** com o mesmo vocabulário de secções que a clarificação.
- Opcional: **reduced motion** para expansão da textarea (respeitar `prefers-reduced-motion`).

---

## Ficheiros tocados (resumo)

- `frontend/app/globals.css` — tokens + `--shell-header`.
- `frontend/components/regions/AppChrome.tsx`, `AppShell.tsx` — header e separação da coluna central.
- `frontend/components/features/run-detail/RunViewShell.tsx` — subheader e ribbon operacional.
- `frontend/components/primitives/Surface.tsx`, `SectionHeader.tsx`, `RuntimeCard.tsx`.
- `frontend/components/features/clarification/*` — painel, cartão, input, badges de estado.
- `frontend/components/features/run-detail/MissionWorkspacePhase.tsx`.
- `frontend/components/features/execution-timeline/ExecutionStepBlock.tsx`, `ExecutionTimelineNav.tsx`, `RightTimelinePanel.tsx`.
