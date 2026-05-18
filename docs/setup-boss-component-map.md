# Setup Boss — Component Map — Web UI MVP (Fase 5)

Mapa **inicial** de componentes: responsabilidades, ownership e limites. Evita overengineering — **não** lista átomos de biblioteca (cada `Button`).

---

## 1. Camadas lógicas

```text
pages/ views
 └── shells (AppShell, RunViewShell)
      └── regions (Sidebar, SplitWorkspace, BottomPanel)
           └── feature components (lista abaixo)
                └── primitives (design system)
```

---

## 2. Mapa de componentes

### 2.1 ProjectSidebar

- **Responsabilidade**: navegação entre projectos e lista de runs; estado de selecção.
- **Ownership**: dados de project registry + lista de runs (API/filesystem).
- **Boundary**: não renderiza conteúdo de run; só metadados e estado agregado (badge).
- **Composição**: `ProjectList` → `RunList` → `RunListItem`.

### 2.2 RunList

- **Responsabilidade**: ordenação (recente primeiro), filtros simples (fase, estado).
- **Boundary**: sem lógica de parsing de artefactos.

### 2.3 ActivityStream

- **Responsabilidade**: feed de eventos recentes + cartões embebidos (gates).
- **Ownership**: stream derivado de eventos + mensagens normalizadas da API.
- **Boundary**: não substitui Timeline; não edita artefactos.
- **Composição**: `StreamItem` × N, `StickyGateBanner`.

### 2.4 RuntimeCard

- **Responsabilidade**: cartão genérico para um “momento” do runtime (fase, subtask, operação).
- **Ownership**: props tipadas (`kind`, `title`, `timestamp`, `severity`, `links[]`).
- **Boundary**: apresentação; sem fetch.

### 2.5 SubtaskCard

- **Responsabilidade**: estado de subtask, progresso, link para artefactos filhos.
- **Composição**: `StatusBadge`, actions contextuais (ex.: “ver patch”).

### 2.6 ReviewCard

- **Responsabilidade**: estado de review, resumo do veredito, CTA para detalhe.
- **Boundary**: leitura no MVP; escrita quando API expuser aprovação.

### 2.7 ApprovalCard

- **Responsabilidade**: **HITL** — formulário mínimo + risco visual se acção for sensível.
- **Ownership**: mutations via Runtime API (Fase 5).
- **Boundary**: validação client-side só para UX; autoridade no servidor/local API.

### 2.8 ArtifactViewer

- **Responsabilidade**: preview JSON/Markdown/text; download; path completo.
- **Composição**: `MonacoJsonViewer` (opcional/fase incremental) ou viewer simples no MVP inicial.
- **Boundary**: leitura; edição **fora** do MVP salvo texto simples.

### 2.9 TimelinePanel

- **Responsabilidade**: marcos do lifecycle; clicável para saltar a contexto/stream.
- **Ownership**: dados agregados do run (manifests + eventos).

### 2.10 RuntimeConsole

- **Responsabilidade**: logs contínuos, tail, nível de log, copy/export.
- **Boundary**: não duplicar Diagnostics estruturados (cross-link).

### 2.11 DiagnosticsPanel

- **Responsabilidade**: lista filtrável de problemas; link para ficheiro/linha se disponível.
- **Ownership**: agregador no cliente + fonte API `diagnostics`.

### 2.12 AppChrome (barra superior)

- **Responsabilidade**: projecto, run, estado API, acções globais (refresh, settings).
- **Ownership**: estado de conectividade + navegação.

### 2.13 ContextPanel

- **Responsabilidade**: resumo da task, critérios, decisões de clarificação (read-only inicial).
- **Ownership**: leitura de artefactos de intake/strategy.

### 2.14 RunViewShell

- **Responsabilidade**: orquestra splits, routing interno da vista run, **queries** principais.
- **Boundary**: único sítio onde TanStack Query concentra chaves de `runId`.

### 2.15 IntegrityStrip / IntegrityCard (nome flexível)

- **Responsabilidade**: resumo de relatório de integridade; link para relatório completo.

---

## 3. Data flow (resumo)

- **RunViewShell** obtém: `runSummary`, `events`, `artifactsIndex`, `diagnostics`, `integrity`.
- Componentes de apresentação recebem **DTOs estáveis** da camada `api/` ou `lib/adapters/`.
- **Nenhum** componente de folha faz `fetch` directo excepto casos experimentais a refactorar.

---

## 4. Anti-padrões

- “God component” que conhece intake + execute + rollback.
- Duplicar parsers de JSON que já existem no runtime Node — preferir **API que devolve DTO**.

---

## Documentos relacionados

- `setup-boss-ui-layout-spec.md`
- `setup-boss-ui-tech-stack.md`
- `setup-boss-mvp-ui-roadmap.md`

---

## Estado

```text
Discovery — Fase 5 — Component Map (documento-base).
```
