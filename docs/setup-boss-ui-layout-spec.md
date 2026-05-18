# Setup Boss — Main Layout Architecture — Web UI MVP (Fase 5)

Especificação do **shell visual** e da **composição** do ecrã principal (vista Run). Foco em operação, não em estética decorativa.

---

## 1. Objectivos do layout

- Suportar **três ritmos de leitura**: scan rápido (estado), exploração média (timeline/stream), análise profunda (artefactos/consola).
- Manter **runtime sempre perceptível** (nunca zero painéis de estado em vista Run).
- Permitir **expand/collapse** sem perder contexto de projecto/run.

---

## 2. Regiões principais (desktop MVP)

Ordem lógica Z / importância:

| Região | Nome de trabalho | Função |
|--------|------------------|--------|
| A | **AppChrome** | Projecto activo, run activo, estado daemon/API, atalhos |
| B | **ProjectSidebar** | Lista de projectos recentes, runs, favoritos |
| C | **ActivityStream** | Stream de eventos recentes + cartões de gate |
| D | **TimelinePanel** | Eixo de fases / marcos do lifecycle |
| E | **ContextPanel** | Task, critérios, resumo de intake/strategy (read-only inicial) |
| F | **RuntimeConsole** | Logs, stdout relevante, erros expandidos |
| G | **ArtifactsExplorer** | Árvore ou lista filtrada de outputs do run |
| H | **DiagnosticsPanel** | Warnings/errors agregados com filtros |

**Nota**: “Activity Stream” aqui é o **stream operacional**, não feed social.

---

## 3. Composição recomendada (proporções iniciais)

### Vista Run (≥ 1280px)

- **Sidebar (B)**: ~260–320px fixa; colapsável a ícones (~64px).
- **Zona central**: dividida em **superior** e **inferior** opcional (split horizontal).
  - **Superior**: duas colunas — **Timeline (D)** ~35% + **Context (E)** ~35% + margem; OU Timeline em largura total fina + Context à direita — **recomendação estável**:
    - Esquerda **C + D** empilhados: Stream (flex 1) + Timeline (altura fixa ~180–240px ou tabs).
    - Direita **E** (Context): ~320–400px fixa.
- **Inferior (tabs ou split)**: **Artifacts (G)** | **Console (F)** | **Diagnostics (H)** — altura inicial ~28–36% do viewport; redimensionável.

### Proporções numéricas de partida

```text
[B: 280px] | [C+D flex-grow] [E: 360px]
            --------------------------------
            [ G | F | H ]  (altura ~32%, resize)
```

Ajustável em implementação; o documento fixa **prioridade**, não pixels rígidos.

---

## 4. Fluxo operacional (olhos do operador)

1. AppChrome confirma **projecto + run + ligação API**.
2. Sidebar permite saltar entre runs sem perder o run “pinned” como principal.
3. Stream mostra **última actividade**; se há gate, o cartão aparece **no topo fixo** (sticky) dentro de C.
4. Timeline responde: “em que fase estou?”
5. Context responde: “porque estamos aqui?” (task, decisões de clarificação).
6. Painel inferior: artefacto ou log conforme tarefa cognitiva.

---

## 5. Comportamento dos painéis

- **Sidebar**: colapsável; persiste preferência local.
- **ContextPanel**: em ecrãs estreitos, vira **drawer** sobre o stream.
- **RuntimeConsole**: auto-scroll quando “seguir run”; pausa scroll se utilizador subir manualmente.
- **ArtifactsExplorer**: preview inline; abrir em **painel total** (overlay) para JSON grande.
- **DiagnosticsPanel**: filtro por severidade; “ir para stream” sincroniza highlight.

---

## 6. Responsividade mínima

| Largura | Comportamento |
|---------|----------------|
| ≥ 1280px | Layout completo descrito |
| 1024–1279px | Reduzir ContextPanel; Timeline mais compacta |
| 768–1023px | Sidebar colapsada; Context em drawer |
| &lt; 768px | **MVP honesto**: uma coluna com **tabs** (Estado \| Stream \| Artefactos \| Mais). Não fingir paridade desktop. |

O MVP **deve** funcionar em tablet largo; telefone é **best-effort** (leitura, não operação completa).

---

## 7. Expansão / retracção

- Splitters com **limites mínimos** (evitar painéis inúteis de 20px).
- **Double-click** na barra do splitter para reset ao default.
- Estado dos splits: `localStorage` por `projectId` (opcional).

---

## 8. Foco visual

- **Sempre visível**: run state badge, fase, ligação API.
- **Sticky no stream**: aprovações pendentes e falhas bloqueantes.
- **Nunca cobrir** o estado global com modais excepto confirmações destrutivas (ex.: rollback se perigoso).

---

## 9. Anti-padrões

- Chat a ocupar &gt; 50% do viewport na vista Run.
- Timeline apenas decorativa sem ligação a dados reais.
- Consola como única superfície (esconde artefactos e gates).

---

## Documentos relacionados

- `setup-boss-runtime-ux.md`
- `setup-boss-component-map.md`
- `setup-boss-design-system.md`

---

## Estado

```text
Discovery — Fase 5 — Main Layout Architecture (documento-base).
```
