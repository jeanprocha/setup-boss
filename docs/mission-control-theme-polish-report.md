# Mission Control — relatório de polimento de tema (claro / escuro)

Data: 2026-05-15  
Âmbito: refinamento visual via tokens e superfícies, sem redesign estrutural nem troca de design system.

---

## 1. Problemas visuais identificados

| Área | Sintoma | Causa provável |
|------|---------|----------------|
| Centro da actividade | Bloco cinza/azulado contínuo, cartões “somem” | `RunViewShell` usava fundo **hardcoded** `oklch(0.12 … / 0.35)`, adequado a overlay escuro mas aplicado em **todos** os temas |
| Hierarquia light | Pouco contraste entre página, painel e cartões | `--background`, `--muted`, `--secondary` e `--card` demasiado próximos; `--muted-foreground` pouco distante do texto principal |
| Sidebar vs centro | Pouca separação percetível | Diferença de luminância reduzida entre `--sidebar` e área central anterior |
| Cartões / passos | Superfície “chapada”, sombras fracas | Passos usavam `bg-background/10–30` sobre fundo já turvo; `Card` com `ring-foreground/10` pouco legível no claro |
| Badges / estados | Textos tipo `text-amber-100` / `text-cyan-100` no tema claro | Cores pensadas para fundo escuro, ilegíveis em superfícies claras |
| Scroll | Aspecto técnico | Thumb do `ScrollArea` igual a `bg-border`; scrollbars nativos sem tratamento suave |
| Tema escuro | Preto dominante e acento azul muito saturado | `--background` ~0.145 neutro; `--sidebar-primary` altamente cromático |

---

## 2. Estratégia aplicada

1. **Tokens primeiro**: introduzir `--workspace` para o canvas central; separar luminância entre `--background` (chrome/app), `--workspace` (coluna principal), `--sidebar`, `--card`, `--muted`.
2. **Eliminar o overlay escuro fixo** no centro; substituir por `bg-workspace` derivado dos tokens.
3. **Elevar cartões e passos** com `bg-card`, sombras mínimas (`0 1px 2–3px`), anéis derivados de `border` em vez de `foreground/10`.
4. **Estado activo** no índice da execução e nos passos: barra inset à esquerda com `color-mix` sobre `--sidebar-primary` + anel suave (sem glow agressivo).
5. **Badges semânticos**: pares `text-*-950` (light) + `dark:text-*-100` onde havia apenas tons claros.
6. **Scrollbar**: `scrollbar-color` + `scrollbar-width: thin` na camada base; thumbs dos scroll areas com opacidade sobre `muted-foreground`.

---

## 3. Tokens alterados (`frontend/app/globals.css`)

| Token | Light (resumo) | Dark (resumo) |
|-------|----------------|---------------|
| `--workspace` | **Novo** — `oklch(0.988 0.004 95)` | `oklch(0.195 0.016 260)` |
| `--background` | Quase branco quente `0.995` | ~`0.175` (menos preto puro) |
| `--foreground` | Mais saturado leve (~260 hue) | Texto ~`0.94` |
| `--card` | Branco puro | Camada acima do workspace |
| `--muted` / `--accent` | Mais separados do card | Camadas distintas |
| `--muted-foreground` | ~`0.48` para hierarquia legível | ~`0.68` |
| `--border` / `--input` | Ligeiramente mais definidos | Opacidade ~11–14% |
| `--ring` | Azul-acinzentado moderado | Idem, menos neutro “cinza morto” |
| `--sidebar` | Cinza muito claro vs workspace | Camada própria vs `--workspace` |
| `--sidebar-primary` | Azul contido (~0.38 C) | Saturação reduzida vs valor anterior |
| `--sidebar-primary-foreground` | Claro sobre acento (light) | **Corrigido** para texto claro (~`0.98`) sobre acento |
| Tokens `--sb-*` | Bordas / cartões runtime alinhados ao novo contraste | Superfícies ligeiramente mais claras |

**Tailwind**: `--color-workspace` exposto em `@theme inline` → classe `bg-workspace`.

---

## 4. Componentes ajustados

| Ficheiro | Alteração |
|----------|-----------|
| `RunViewShell.tsx` | `bg-workspace`; cabeçalho da secção e ribbon sticky com superfície derivada de `card`; grelha timeline/stream com `bg-card` + sombra mínima |
| `ExecutionStepBlock.tsx` | Superfícies por estado (`card`, sombras leves); activo com barra lateral inset + `ring-sidebar-primary`; hints de estado com cores light/dark |
| `MissionWorkspacePhase.tsx` | Contentor `rounded-xl` + `bg-card`; badges de estado com cores legíveis em ambos os temas |
| `OperationalFocusCard.tsx` | `bg-card`, sombra e anel discretos; hints âmbar legíveis no claro |
| `ExecutionTimelineNav.tsx` | Item activo com barra inset + hover na rail |
| `RightTimelinePanel.tsx` | Título com tracking consistente; fundo com leve transparência/backdrop |
| `RuntimeCard.tsx` | Cartões em `bg-card` com hover/sombra premium leve |
| `AppChrome.tsx` | Sombra do header dependente do tema; badges realtime/degradados legíveis no claro |
| `ExecutionFeed.tsx` | Mais espaço vertical (`space-y-5`, `pt/pb`) |
| `ProjectActivitySidebar.tsx` | Sombra 1px à direita; label “deg” legível no claro |
| `components/ui/card.tsx` | Sombra suave + `ring-border` |
| `components/ui/scroll-area.tsx` | Thumb mais subtil |
| `StatusBadge.tsx` | Estados de espera com texto escuro no light + `dark:` |

---

## 5. Light theme — antes / depois (conceitual)

**Antes**

- Centro: overlay escuro semi-transparente sobre todo o tema → cinza sujo no claro.
- Cartões e passos: pouca diferença face ao fundo; anéis quase invisíveis.
- Badges amarelos/ciano: texto claro sobre fundo claro.

**Depois**

- Centro: `--workspace` claro e estável; chrome `--background` ligeiramente mais “off-white”.
- Cartões: branco puro ou quase, borda e sombra mínima.
- Badges: primeiro plano escuro no light, preservando aparência premium no dark.

---

## 6. Dark theme — antes / depois (conceitual)

**Antes**

- Fundo muito próximo do preto neutro; pouca camada entre sidebar e conteúdo.
- Acento lateral forte (`sidebar-primary` muito cromático).

**Depois**

- `--background` e `--workspace` em cinzas azulados distintos (camadas).
- `--sidebar-primary` com croma mais controlado; foreground do acento corrigido para contraste.
- Sombras nos cartões reforçadas só o suficiente para ler sobre fundo escuro.

---

## 7. Decisões de contraste

- Hierarquia principal: `--foreground` vs `--muted-foreground` com delta maior no light (~0.18 vs ~0.48 L-ish via OKLCH L canal).
- AA: não foi feita auditoria automatizada completa de todas as combinações; foco em remover combinações sabidamente inválidas (texto 100–200 em fundos claros) e em aumentar separação de superfícies.
- Anéis e sombras: preferência por **sombra física baixa** + **borda tokenizada** em vez de glow ou rings em `foreground`.

---

## 8. Screenshots

Não geradas neste ambiente. Sugestão: capturar light/dark com actividade aberta (ribbon + passos + painel Execução + sidebar expandida) e anexar ao repositório interno se necessário.

---

## 9. Validações

| Verificação | Resultado |
|-------------|-----------|
| `npx tsc --noEmit` (pasta `frontend`) | **Passou** (exit 0) |
| Smoke manual | Lista na secção seguinte (para execução humana) |

**Smoke sugerido**

- Alternar tema claro / escuro.
- Navegar sidebar (projecto + actividade).
- Abrir actividade com ribbon operacional; confirmar passos activos e índice à direita.
- Percorrer scroll no centro e nas áreas com `ScrollArea`.
- Ler badges no header e nos cartões durante período prolongado (conforto).

---

## 10. Próximos refinamentos (opcional)

- Auditoria **automática** de contraste (ex. pairing em CI ou Storybook + axe).
- Reduzir ainda mais classes arbitrárias (`shadow-[…]`) movendo sombras para `@theme` como tokens nomeados.
- Harmonizar restantes componentes que ainda usem `text-emerald-200` / âmbar sem par `dark:` (grep global).
- Temas “high contrast” opcional para acessibilidade regulamentada.

---

## Referências de código

- Tokens e scrollbars: `frontend/app/globals.css`
- Correção crítica do fundo central: `frontend/components/features/run-detail/RunViewShell.tsx` (`bg-workspace`)
