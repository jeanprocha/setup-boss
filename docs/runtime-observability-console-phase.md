# Runtime observability — console phase

Fase de refatoração do painel **Observabilidade → Logs do runtime** no Mission Control.

## Objetivo

Leitura operacional estilo `console.log` estruturado:

- Linha humana: `PASSO — explicação curta` + relógio + expandir
- Detalhe técnico opcional em JSON formatado
- UI desacoplada do formato bruto do daemon/SSE

## Modelo `RuntimeLogEntryViewModel`

Camada em `frontend/lib/runtime/observability/runtime-log-entry-view-model.ts`.

| Campo | Descrição |
|-------|-----------|
| `id` | Identificador estável para React key / dedupe |
| `level` | `success` \| `info` \| `warn` \| `error` \| `debug` \| `waiting` |
| `displayLevel` | Rótulo de filtro (`SUCCESS`, `ERROR`, …) |
| `category` | Categoria de filtro (`strategy`, `git`, `daemon`, …) |
| `stepTitle` | Nome curto do passo (humanizado) |
| `shortMessage` | Explicação curta na linha principal |
| `timestamp` / `clockLabel` | ISO + `HH:mm:ss` |
| `details` | JSON formatado + aviso de truncagem |
| `rawEvent` | Evento original (`RuntimeEventDto`, daemon ou UI) |
| `expandable` | Se a linha tem painel `[+]` |
| `uiTier` | `important` \| `progress` \| `technical` \| `noise` (herdado) |
| `icon` | Ícone visual derivado de nível/categoria |
| `groupedCount` | Repetições agrupadas (ruído/técnico) |

### Pipeline

```
RuntimeEventDto / DaemonLog / UI diagnostic
  → normalizeRuntimeLogForUi (tier, payload omitido)
  → buildRuntimeLogEntryFrom*
  → groupRepeatedRuntimeLogEntries
  → RuntimeConsoleLogRow (estado expand local)
```

## Abas Observabilidade

- **Removida:** Timeline operacional (sub-aba)
- **Mantidas:** Execução técnica, Logs do runtime

A derivação `derive-run-operational-timeline` permanece no código para possível reutilização; só deixou de ser exposta nesta sub-aba.

## UX

- Expansão por linha (`useState` no row memoizado) — não re-renderiza a lista inteira
- Auto-scroll só quando a lista **cresce**
- Payload grande: resumo `Payload técnico grande (N KB)` até expandir
- Prioridade visual: erros/avisos/sucesso com borda; `noise`/`technical` com opacidade reduzida

### Toolbar compacta (uma linha)

```text
[Copiar] [Limpar] [Busca........................] [Filtros]
```

- Sem chips inline de nível ou categoria
- Níveis `SUCCESS` / `INFO` / `WARN` / `ERROR` / `DEBUG` sempre activos na UI
- Botão **Filtros** abre painel com checkboxes por categoria
- Selecção de categorias persistida em `localStorage` (`setup-boss.runtime-logs.categories`)

## Ficheiros principais

- `frontend/lib/runtime/observability/runtime-log-entry-view-model.ts`
- `frontend/lib/runtime/observability/runtime-logs-category-filter-storage.ts`
- `frontend/components/features/observability/RuntimeConsoleLogRow.tsx`
- `frontend/components/features/observability/RuntimeLogsToolbar.tsx`
- `frontend/components/features/observability/RuntimeObservabilityLogs.tsx`
- `frontend/components/features/execution-timeline/RightTimelinePanel.tsx`

## Fora de escopo (esta fase)

- Terminal real, streaming token-a-token, WebSocket novo, persistência nova
- Redesign global do Mission Control
