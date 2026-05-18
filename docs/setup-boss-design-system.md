# Setup Boss — Design System Foundation — Web UI MVP (Fase 5)

Base visual **mínima** para comunicar **estado operacional** com consistência. Não é um design system enterprise completo; é fundação para evitar UI genérica e “chat look”.

---

## 1. Identidade visual

- **Tom**: precisão industrial + calma (mission control, não marketing).
- **Superfícies**: fundo neutro escuro **ou** claro com contraste alto para texto de diagnóstico — **escolher um tema por defeito** na implementação; MVP: **dark** favorece leitura longa de logs.
- **Acento**: uma cor primária fria (ciano/azul) para acções seguras; cor quente só para destrutivo/alerta.

---

## 2. Estados operacionais (semântica antes de “emoção”)

Estados do runtime na UI (mapeamento sugerido — alinhar labels ao contrato real do motor):

| Estado | Significado para o operador |
|--------|-----------------------------|
| `running` | Motor activo; pode haver subtileza (subtask). |
| `waiting_approval` | **HITL** — acção humana obrigatória antes de prosseguir. |
| `blocked` | Não avança por validação, política ou dependência. |
| `failed` | Parou com erro recuperável ou não. |
| `retrying` | Nova tentativa automática em curso ou agendada. |
| `correcting` | Loop de correcção em progresso. |
| `rollback` | Operação de reversão em curso ou concluída (usar `rollback_done` se necessário). |
| `recovered` | Sistema voltou a estado consistente após incidente. |
| `success` | Run / fase concluída com sucesso. |
| `warning` | Concluído ou activo com riscos não bloqueantes. |

**“Estados emocionais”** traduzem-se em **cor + ícone + label curto**, não em copy longa.

---

## 3. Cores semânticas (sugestão)

Valores exactos ficam para implementação (tokens); relações:

| Token semântico | Uso |
|-----------------|-----|
| `status-running` | Azul/ciano, animação subtil |
| `status-waiting` | Âmbar/dourado |
| `status-blocked` | Roxo ou cinza forte (distinct de failed) |
| `status-failed` | Vermelho |
| `status-retrying` | Âmbar + ícone de ciclo |
| `status-correcting` | Magenta ou laranja técnico |
| `status-rollback` | Vermelho escuro / bordo |
| `status-recovered` | Verde azulado |
| `status-success` | Verde |
| `status-warning` | Amarelo |

Garantir **contraste WCAG AA** em textos sobre fundos de status.

---

## 4. Status badges

- Forma: **pill** ou **badge** com ícone + texto **máx. 2 palavras**.
- `running`: ícone de spinner **muito** subtil (evitar distração).
- `waiting_approval`: ícone de mão/pausa — **mais saliente** que `running`.

---

## 5. Tipografia

- **UI**: sans system ou Inter — legível em tamanhos pequenos (12–13px para meta).
- **Mono**: JetBrains Mono / Consolas para **paths, IDs de run, JSON**, consola.
- **Escala**: 12 / 14 / 16 / 20 / 24 com line-height generoso em diagnósticos.

---

## 6. Espaçamento e grelha

- Base **4px**; blocos principais múltiplos de 8.
- **Density toggle** (compacto vs confortável) — útil para power users em Diagnostics/Console.

---

## 7. Elevação e superfícies

- Níveis: `floor` (fundo), `raised` (cards), `overlay` (modais), `sticky` (barras).
- Sombras **contidas**; separação preferida por **borda 1px** com baixa opacidade em dark mode.

---

## 8. Motion e transições

- **Transições**: 150–200ms para painéis; **ease-out**.
- **Entrada de eventos no stream**: fade-in curto; evitar bounce.
- **Estado running**: nunca animar áreas grandes inteiras (só badge/linha).

---

## 9. Iconografia

- Estilo: **outline** consistente (Lucide ou equivalente).
- Ícones por domínio: run, subtask, artifact, timeline, diagnostics, approval, rollback, integrity.
- Não misturar estilos filled/outline sem razão.

---

## 10. Componentes primitivos (fundação)

- Button (primary / secondary / destructive / ghost).
- Badge / StatusDot.
- Card (elevated, com header de meta).
- Tabs / Segmented control (para Console | Artifacts | Diagnostics).
- ScrollArea com sticky headers.
- Skeleton loaders alinhados a cards (não spinners globais apenas).

---

## 11. Acessibilidade

- Foco visível em teclado; ordem de tab nos gates antes de acções secundárias.
- Não comunicar estado **apenas** por cor (ícone ou texto incluso).

---

## Documentos relacionados

- `setup-boss-runtime-ux.md`
- `setup-boss-ui-layout-spec.md`
- `setup-boss-component-map.md`

---

## Estado

```text
Discovery — Fase 5 — Design System Foundation (documento-base).
```
