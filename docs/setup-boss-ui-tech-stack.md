# Setup Boss — UI Technical Stack — Web UI MVP (Fase 5)

Stack **oficial sugerida** para o MVP, com critérios e organização. Ajustável por decisão registada em `context/decisions.md` quando implementação começar.

---

## 1. Stack principal (recomendação)

| Camada | Escolha | Motivo |
|--------|---------|--------|
| Framework | **Next.js** (App Router) | Routing, API routes locais, evolução futura sem mudar mental model |
| Linguagem | **TypeScript** | Contratos UI ↔ API estáveis |
| Estilos | **Tailwind CSS** | Velocidade + consistência com design tokens |
| Componentes | **shadcn/ui** (Radix) | Acessibilidade, composição, ownership do código no repo |
| Estado servidor/cache | **TanStack Query** | Runs, artefactos, polling/SSE, invalidação por `runId` |
| Estado cliente UI | **Zustand** (mínimo) | Sidebar, splits, theme, prefs locais — evitar Redux |
| Motion | **Framer Motion** (opcional / fase 2 UX) | Transições de painéis; usar com parcimónia |
| JSON / texto grande | **Monaco** (fase incremental) | Só quando viewer simples não chegar |
| Terminal / logs ricos | **xterm.js** (fase incremental) | Opcional se consola for verdadeira TTY; MVP pode ser `<pre>` + tail |
| Transporte tempo real | **SSE** primário; **WebSocket** se necessário para duplex | Ver secção 3 |

---

## 2. Integração com o runtime existente

- O repositório já inclui **Local Runtime API** HTTP em `127.0.0.1` (`scripts/daemon/runtime-api.js`, Fase 3.2).
- A UI MVP deve **consumir e estender** este contrato (novos endpoints ou agregadores), não reinventar processo em silo.
- **BFF opcional**: rotas Next.js (`app/api/...`) como proxy para simplificar CORS/cookies e normalizar DTOs — ainda assim **local-only**.

---

## 3. Runtime API Strategy (transporte + contratos)

### 3.1 Transporte (UI)

#### Leitura

- **GET** para snapshots: lista de runs, resumo, índice de artefactos, diagnostics.
- **SSE** (`text/event-stream`) para **eventos do run** e heartbeat — menos overhead que polling puro quando daemon activo.
- **Polling** como fallback quando daemon offline (ler estado do disco periodicamente com backoff).

#### Escrita / acções

- **POST** síncrono para comandos: start phase, submit approval, trigger retry (conforme suporte).
- Resposta: `{ jobId, accepted, reason }` alinhado a padrões já presentes na fila/daemon.

#### WebSocket

- **Não obrigatório no MVP**; reavaliar se duplex baixa latência for necessário para múltiplas subscrições pesadas.

### 3.2 Contratos principais (read models sugeridos)

Nomes ilustrativos — alinhar à implementação em `runtime-api.js` e extensões:

| Contrato | Método | Conteúdo mínimo |
|----------|--------|------------------|
| `GET /health` | GET | `ok`, versão API, modo (`daemon` \| `degraded`) |
| `GET /projects` | GET | lista de project roots / ids registados |
| `GET /projects/:id/runs` | GET | `runId`, `updatedAt`, `phase`, `status`, labels |
| `GET /runs/:runId/summary` | GET | agregado: fase, estado, contadores, pendingApprovals |
| `GET /runs/:runId/events` | GET (cursor opcional) ou SSE | eventos ordenados, `severity`, `correlationId` |
| `GET /runs/:runId/artifacts` | GET | árvore ou lista flat com `mime`, `size`, `relativePath` |
| `GET /runs/:runId/artifacts/*` | GET | conteúdo (com limites de tamanho + truncamento) |
| `GET /runs/:runId/diagnostics` | GET | lista estruturada de problemas |
| `GET /runs/:runId/integrity` | GET | último relatório ou estado “não executado” |
| `POST /runs/:runId/actions` | POST | corpo tipado: `{ type, payload }` (approve, retry, cancel, …) |

Versionamento: prefixo `/v1/` na URL ou header `Accept: application/vnd.setupboss.v1+json` — escolher **uma** convenção na primeira implementação.

### 3.3 Leitura de artefactos

- Servir sempre com **path canónico relativo ao output dir do run**; validar no servidor para impedir path traversal.
- Limite de bytes com **416/413** ou resposta JSON `{ truncated: true, maxBytes }`.
- JSON grande: preferir **pretty no cliente**; servidor pode enviar compacto.

### 3.4 Actualização de estados

- **Fonte autoritária**: filesystem + motor; a UI **nunca** assume estado final até `200` da acção ou evento `state_changed` na SSE.
- Concorrência: incluir `etag` ou `revision` no summary para detectar stale writes (opcional no MVP, desejável antes de múltiplos controlos).

### 3.5 Boundaries UI ↔ runtime

| Responsabilidade | Onde fica |
|------------------|-----------|
| Validação de negócio, políticas, writes em disco | Runtime / daemon / scripts |
| Normalização para DTO de UI | Local Runtime API (ou BFF Next) |
| Layout, cache, optimismo leve | UI |
| Parsing de Markdown / diff rico | UI (com dados já autorizados) |

### 3.6 Realtime mínimo viável

- **MVP**: SSE para run activo + polling de baixa frequência para listas.
- **Latência aceitável**: ordem de segundos para estado global; sub-segundo só onde já existir infraestrutura.

---

## 4. Estrutura de pastas (sugestão Next.js)

```text
apps/web/   (ou raiz /web se monorepo futuro)
  app/
    layout.tsx
    (shell)/project/[projectId]/run/[runId]/page.tsx
    api/
      proxy/[...path]/route.ts   # opcional BFF
  components/
    regions/
    features/
    primitives/
  lib/
    api-client.ts
    dto/              # tipos alinhados à Runtime API
    adapters/         # filesystem path helpers só no servidor se necessário
  hooks/
    use-run-events.ts
  stores/
    ui-shell.ts       # zustand
```

*(Caminho `apps/web` é convencional; o repo actual é pacote Node — a decisão de mono vs subpasta fica para a primeira PR de scaffold.)*

---

## 5. Estratégia de estado

- **TanStack Query**: fonte de verdade para **dados de run**; chaves hierárquicas `['project', id, 'run', runId, ...]`.
- **Zustand**: layout, sidebar, prefs de densidade, run “pinned”.
- **Evitar** duplicar em Zustand o que já está no Query cache.

---

## 6. Cache e consistência

- **Stale-while-revalidate** em listas de runs.
- **Invalidação** após POST de acção: `queryClient.invalidateQueries` por run.
- **Optimistic updates** só para prefs de UI — não para gates críticos sem confirmação da API.

---

## 7. Runtime sync (modo misto)

| Modo | Quando |
|------|--------|
| Daemon online | SSE + GET incremental |
| Daemon offline | Polling leve + mensagem “read-only filesystem” |

---

## 8. Streaming na UI

- Stream de eventos ≠ LLM token stream: tratar como **eventos estruturados**.
- Se no futuro houver streaming de modelo na UI, isolar em componente **separado** do **ActivityStream** operacional.

---

## 9. Organização de componentes

- **`regions/`**: sidebar, shells, splits.
- **`features/run/`**: timeline, stream, cards de runtime.
- **`features/artifacts/`**: viewer, tree.
- **`primitives/`**: wrappers shadcn + tokens.

---

## 10. Fora do MVP técnico

- Microfrontends, module federation.
- Auth providers cloud, multi-tenant.
- GraphQL enterprise (REST + SSE suficientes).

---

## Documentos relacionados

- `setup-boss-mvp-ui-roadmap.md`
- `setup-boss-component-map.md`

---

## Estado

```text
Discovery — Fase 5 — UI Technical Stack (documento-base).
```
