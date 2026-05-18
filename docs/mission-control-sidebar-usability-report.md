# Mission Control — relatório de usabilidade da sidebar (projectos / actividades)

Data: 2026-05-15

## 1. Problemas corrigidos

- **Nome de projecto ilegível** (ex.: prefixos `bitbucket-org-…`): passa a exibir nome amigável derivado do cadastro + regras de prefixo, com detalhe técnico no tooltip.
- **Nome de atividade pouco útil** (ex.: runId truncado): título amigável vindo do daemon (`activityTitle`) e regras de fallback (slug da task, data/hora em pt-PT).
- **Largura fixa da sidebar**: redimensionamento horizontal com persistência em `localStorage`, limites 240–520px, reset com duplo clique no separador.
- **Remover da lista sem apagar artefactos**: acção **Arquivar** (POST `/runs/:id/archive`), persistência em `.setup-boss/run-archive.json` + campos opcionais `archived` / `archivedAt` no ficheiro de índice da run quando existe `.setup-boss/runs/<runId>.json`.
- **Filtro “Mostrar arquivadas”**: lista principal continua sem arquivadas; com o toggle, inclui jobs arquivados (estilo secundário) via `GET /projects/:id?includeArchived=1`.

## 2. Ficheiros alterados

| Área | Ficheiros |
|------|-----------|
| Daemon / API | `scripts/daemon/runtime-api.js`, `scripts/daemon/lib/run-archive.js` (novo), `scripts/daemon/lib/runtime-events.js` |
| Frontend — UI | `frontend/components/regions/ProjectActivitySidebar.tsx` |
| Frontend — helpers | `frontend/lib/runtime/format-display.ts` (novo), `frontend/hooks/use-sidebar-width.ts` (novo) |
| Frontend — dados | `frontend/lib/api/runtime-types.ts`, `frontend/lib/api/runtime-api.ts`, `frontend/lib/api/query-keys.ts`, `frontend/lib/runtime/adapters/map-project.ts`, `frontend/lib/runtime/adapters/map-job.ts`, `frontend/hooks/use-runs.ts` |
| Compilação `tsc` (correções mínimas) | `frontend/lib/runtime/clarification/clarification-adapters.ts`, `frontend/lib/runtime/adapters/runtime-checkpoint-copy.ts`, `frontend/components/features/execution-timeline/OperationalCheckpointBody.tsx` |

## 3. Regra de nome amigável do projecto

Implementação: `formatProjectDisplayName` em `frontend/lib/runtime/format-display.ts` aplicada em `mapApiProjectToSummary`.

- Preferir `displayName` do runtime **após** remover prefixos conhecidos (`bitbucket-org-<org>-`, `github-com-…`, `github-…`, etc.).
- Se não houver nome útil, usar basename de `projectRoot` com a mesma limpeza.
- Tooltip completo: `technicalSummary` com `displayName`, `projectRoot` e `projectId`.

## 4. Regra de nome amigável da atividade

1. **Servidor** (`deriveActivityTitle` + campo `activityTitle` em `summarizeJob`): metadata (`displayTitle`, `taskTitle`, `summary`, …) → texto até ~60 caracteres; senão slug derivado do ficheiro de task (`YYYYMMDD-HHmmss-slug.md` → texto legível); fallback com data/hora pt e trecho do slug.
2. **Cliente**: `mapApiJobToRunSummary` usa `activityTitle` como `label` quando presente; `formatRunDisplayTitle` para exibição consistente.
3. **Tooltip**: primeira linha = título amigável; segunda = `run/job` com identificadores técnicos.

## 5. Comportamento do resize

- Chave de armazenamento: `setup-boss-sidebar-width` (localStorage).
- Limites: min 240px, max 520px, padrão 300px.
- Barra vertical à direita (`cursor: col-resize`); duplo clique repõe a largura por defeito.
- `sidebarCompact` (toggle existente no chrome) mantém-se: em modo compacto não há resize (largura rail ~56px).

## 6. Comportamento do arquivo

- **Endpoint**: `POST /runs/<jobId|runId>/archive` (resolvido na fila actual).
- **Persistência**: `run-archive.json` com chaves `job:<id>` e `run:<runId>`; merge não destructivo em `.setup-boss/runs/<runId>.json` quando o índice existe.
- **Evento**: tipo `run_archived` em `events.jsonl` (SSE/eventos) e linha `runtime.run_archived` em `logs/runtime.log`.
- **UI**: menu “⋯” → Arquivar + `confirm()`; invalidação das queries de runtime; remoção da selecção se coincidir com a chave arquivada.

## 7. Validações executadas

- `cd frontend` → `npx tsc --noEmit` — **OK** (após pequenos fixes de tipos / sintaxe listados na secção 2).
- `node --check scripts/daemon/runtime-api.js` — **OK**.

## 8. Limitações restantes

- “Ver arquivadas” completo (página dedicada, ordenação, desfazer arquivo) não foi implementado — só toggle na sidebar e listagem condicional.
- Contagens de fila / bundles detalhados (`scheduledJobs`, etc.) não filtram arquivadas — apenas `recentJobs` da UI principal.
- Jobs sem `runId` usam apenas chave `job:` no arquivo; seleccione sempre a mesma chave que `setRun` (`runId ?? jobId`) para evitar ambiguidades.

## 9. Próximos passos

- Desarquivar / restaurar e filtros permanentes no índice.
- Endpoint opcional `GET /runs/archived` read-only para auditoria.
- Componente de menu partilhado (Dropdown) se mais acções forem necessárias.

## Referência de smoke manual (operador)

1. Abrir Mission Control → projecto mostra nome curto (ex.: `wiser-bot-front`).
2. Actividades com título legível (não só runId truncado).
3. Arrastar sidebar, recarregar → largura mantida.
4. Arquivar uma actividade → desaparece da lista sem `includeArchived`; artefactos permanecem no disco; `runtime.log` com `runtime.run_archived`.
