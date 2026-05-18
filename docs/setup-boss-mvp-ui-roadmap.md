# Setup Boss — MVP UI Roadmap & Scope — Fase 5

Define **fronteiras do MVP**, **exclusões explícitas** e **plano incremental realista**. Complementa a visão (`setup-boss-ui-vision.md`) com entregas cronológicas.

---

## Parte A — MVP Scope

### A.1 O que **entra** no MVP

- **Shell visual** com selector de projecto e lista de runs.
- **Vista Run** com layout definido em `setup-boss-ui-layout-spec.md` (versão desktop-first).
- **Leitura** do estado do runtime via **Local Runtime API** + fallback filesystem.
- **ActivityStream** mínimo (eventos normalizados).
- **Timeline** de fases baseada em dados reais (agregação simples).
- **ArtifactsExplorer** com preview de ficheiros de texto/JSON.
- **DiagnosticsPanel** e **Integrity** visíveis quando dados existirem.
- **Indicadores de conectividade** (API/daemon) e erros claros.
- **Human-in-the-loop**: superfície para **aprovações pendentes** quando expostas pela API (mesmo que v1 só liste + deep link).
- **Observability**: painel ou secção dedicada a métricas já persistidas (ex.: uso LLM, limites) quando o run exportar isso.

### A.2 O que **não** entra no MVP

- **Multi-user**, colaboração em tempo real, presença.
- **Auth complexa** (OAuth enterprise, RBAC fino) — no máximo token local simples se algum dia exposto, **não** no MVP inicial.
- **Cloud runtime**, execução remota, filas partilhadas.
- **Orquestração distribuída**, workers remotos.
- **DAG visual** do grafo de execução (graph scheduler como desenho interactivo).
- **Scheduler distribuído** ou visão de cluster.
- **Realtime colaborativo** (cursors, comentários live).
- **Multi-agent** como primeira classe na UI (apenas o que o runtime já modela, sem wizard extra).
- **Microfrontends**, plugin marketplace, extensões de terceiros.

### A.3 Cloud / multi-user

**Explícito**: fora do âmbito. Toda a UI assume **máquina local** e **um operador**.

---

## Parte B — Contratos de valor (definição de “pronto”)

O MVP considera-se **validado** quando:

1. Um operador consegue **abrir um projecto**, **seleccionar um run**, ver **fase + estado + últimos eventos** sem CLI.
2. **Artefactos** chave são abertos a partir da UI com path transparente.
3. **Diagnostics / integrity** não estão escondidos — aparecem em região dedicada ou tab.
4. **HITL**: se existir aprovação pendente no modelo de dados, a UI **destaca** e permite completar o fluxo quando a API suportar POST (v1 pode ser read-only + instrução CLI se necessário — documentar como gap temporário **só se inevitável**).

---

## Parte C — Incremental Execution Strategy

Fases pequenas, **ordenadas por risco e valor**. Cada fase deve ser **demonstrável**.

### Fase UI-0 — Shell visual

- Next.js + Tailwind + shadcn base.
- AppChrome + routing placeholder.
- **Entrega**: aplicação abre, tema, layout vazio estável.

### Fase UI-1 — Runtime read-only

- Cliente HTTP para Local Runtime API (`127.0.0.1`); health check.
- Mensagens quando daemon offline.
- **Entrega**: painel “ligação ao runtime” verde/cinza.

### Fase UI-2 — Run visualization

- Lista de runs por projecto; vista run com **estado + fase**.
- Agregação mínima a partir de endpoints ou leitura já existente.
- **Entrega**: operador identifica run e estado sem abrir disco.

### Fase UI-3 — Artifacts

- Árvore/lista de outputs; preview texto/JSON.
- **Entrega**: navegação `docs/.IA/outputs/<run-id>/` via UI.

### Fase UI-4 — Timeline

- Marcos de lifecycle no painel Timeline.
- **Entrega**: narrativa causal legível (lista vertical).

### Fase UI-5 — Execution visibility

- ActivityStream com eventos normalizados (subtask start/end, phase transitions).
- **Entrega**: substitui parcialmente a necessidade de tail manual.

### Fase UI-6 — Runtime controls

- Acções seguras: refresh, cancel/retry **se** API suportar; submit approval.
- **Entrega**: loop HITL fechável na UI.

### Fase UI-7 — Observability

- Secção métricas/diagnostics consolidados; ligação a `prompt-sizes` / logs conforme disponível.
- **Entrega**: “mission control” sentido para custo e saúde.

### Fase UI-8 — Refinement UX

- Densidade, atalhos de teclado, monaco/xterm opcional, polish de motion.
- **Entrega**: conforto operacional; sem mudar arquitectura.

---

## Parte D — Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| API incompleta para todos os DTO | Priorizar read models agregados no servidor Node |
| UI acoplada a paths | DTOs com paths relativos + `file://` policy clara |
| Parecer “chat” | Guardrails de copy + layout em `setup-boss-ui-layout-spec.md` |

---

## Parte E — Documentos oficiais da Fase 5 (índice)

1. `setup-boss-ui-vision.md`
2. `setup-boss-information-architecture.md`
3. `setup-boss-runtime-ux.md`
4. `setup-boss-ui-layout-spec.md`
5. `setup-boss-design-system.md`
6. `setup-boss-component-map.md`
7. `setup-boss-ui-tech-stack.md`
8. `setup-boss-mvp-ui-roadmap.md` (este ficheiro)

---

## Estado

```text
Discovery — Fase 5 — MVP UI Roadmap & Scope (documento-base).
```
