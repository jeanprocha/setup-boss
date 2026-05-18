# Mission Control — painel de observabilidade runtime

## Objectivo

Área operacional **read-only** no painel direito do Mission Control (terceiro separador **Observabilidade**), com duas sub-vistas:

1. **Execução técnica** — cartões com estado derivado da Runtime API, fila, SSE e amostra de eventos.
2. **Logs runtime** — linhas unificadas a partir de **eventos reais** (`GET /events` + buffer SSE no cliente) e **tail sanitizado** de `logs/runtime.log` (`GET /runs/:runKey/runtime-observability`).

Não é terminal interactivo; não há shell nem consola embebida.

## Arquitectura (MVP)

### Frontend

- `RightTimelinePanel.tsx` — separadores superiores: **Execução** | **Arquivos do chat** | **Observabilidade**; dentro de Observabilidade, sub-separadores **Execução técnica** | **Logs runtime**.
- `RuntimeObservabilityTechnical.tsx` — consome hooks existentes (`useRunSummary`, `useRunEvents`, `useRunOperational`, `useOrchestration`, `useRunEvidence`, stores SSE/ligação) + `useRunObservabilityBundle` para fila/output basename e refresco periódico.
- `RuntimeObservabilityLogs.tsx` — merge ordenado (máx. 500 linhas) entre eventos da corrida e entradas `daemonLogEntries`; filtros por nível/categoria; busca; pausa de auto-scroll; copiar; limpar vista (oculta IDs já visíveis, novos eventos continuam a aparecer); expansão de metadata JSON.
- `use-run-observability-bundle.ts` — `react-query` com `refetchInterval` quando o runtime está alcançável.
- `runtime-log-category.ts` — heurística simples `type`/`channel` → categoria de filtro.

### Backend (daemon / Runtime API)

- `GET /events?...&runKey=<jobId|runId>` — filtra linhas em `.setup-boss/daemon/events.jsonl` onde `jobId` ou `runId` coincide com `runKey` (além dos filtros existentes `jobId`, `projectId`, `after`, `limit`).
- `GET /runs/:runKey/runtime-observability` — resposta JSON:
  - `outputDirBasename` — só basename do directório de output (sem path absoluto).
  - `queueJob` — campos mínimos da fila (`id`, `status`, `runId`, `projectId`, timestamps, `retryable`, `attempts`, `errorMessage` truncado). Sem `projectRoot` completo.
  - `daemonLogEntries` — blocos recentes de `logs/runtime.log` cuja secção flatten contém `runId=` ou `jobId=` alinhados à corrida; texto sanitizado (prefixo do repo → `[repo]`, tokens comuns mascarados).

Implementação: `scripts/daemon/lib/run-observability-bundle.js`, alterações em `runtime-api.js` e `runtime-events.js`.

### Proxy Next

- `app/api/runtime/[[...segments]]/route.ts` — timeout GET alargado a **20s** para `runs/*/runtime-observability` (leitura de tail maior).

## Fluxo de dados (tempo real)

- **Eventos / timeline**: continuam a vir de `useRunEvents` (polling `GET /events` por `projectId` + merge com SSE via `runtime-event-bus` e `runtime-live-events-store`). A lista de logs reutiliza este fluxo — **sem mock**.
- **Ficheiro de log**: polling dedicado ao bundle de observabilidade; complementa os eventos estruturados com linhas do logger Node (`runtimeLogger`).

## Segurança

- `runKey` no path é validado no servidor (`..`, `/`, `\` rejeitados).
- Respostas não expõem paths absolutos do repo; sanitização no tail de log.
- Mensagens de erro de job truncadas; sem stack traces completos adicionais além do que o logger já escreve (tail filtrado por corrida).

## Limitações (MVP)

- Lista de logs **limitada** (500 linhas após merge) para memória e render.
- **Sem virtualização** de lista; aceitável para volumes MVP.
- Filtro de categorias mapeia `daemon` → bucket **runtime**.
- Timestamp em falta em algumas linhas do ficheiro usa o instante da última resposta do bundle como fallback de ordenação.

## Performance

- Refetch do bundle a ~16s; invalidações globais do runtime (SSE) também refrescam queries activas.
- Auto-scroll pode ser pausado para inspecção manual.

## Próximos passos (fora do MVP)

- Virtualização (`@tanstack/react-virtual` ou equivalente) se o volume crescer.
- Endpoint incremental `after`/`cursor` para logs de ficheiro.
- Métricas agregadas (contadores por fase) no bundle.
- Testes E2E de UI (Playwright) para filtros e reconexão SSE ao mudar de corrida.

## Testes automáticos

- `scripts/daemon/lib/runtime-events.test.js` — cobertura do filtro `runKey`.
- `scripts/daemon/lib/run-observability-bundle.test.js` — sanitização, match de blocos, parse do tail.
