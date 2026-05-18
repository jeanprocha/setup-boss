# Observabilidade local MVP — uso rápido

Referências: `docs/runtime-investigation-ui-vs-real-pipeline.md`, `docs/local-runtime-observability-plan.md`.

## Onde ficam os logs JSONL

1. **Por corrida (preferencial)** — quando já existe pasta de output:
   - `<projectRoot>/docs/.IA/outputs/<runId>/runtime-trace.jsonl`
   - ou legado `<projectRoot>/.IA/outputs/<runId>/runtime-trace.jsonl`

2. **Fallback (daemon / estado)** — sempre escrito (append-only):
   - `${SETUP_BOSS_DATA_DIR}/traces/runtime-trace.jsonl`
   - Se `SETUP_BOSS_DATA_DIR` não estiver definido: `<repo setup-boss>/.setup-boss/traces/runtime-trace.jsonl`

Cada linha é um objeto JSON completo (JSONL).

## Como encontrar o `outputDir` real

1. Índice global no checkout setup-boss: `.setup-boss/runs/<runId>.json` — campo `output_dir`.
2. Ou comando:
   ```bash
   npm run setup-boss -- inspect-run <runId>
   ```

## `SETUP_BOSS_DATA_DIR` vs outputs da run

| Conceito | Caminho típico |
|----------|------------------|
| Estado do daemon (fila, locks, `events.jsonl`, trace fallback) | `SETUP_BOSS_DATA_DIR` ou `.setup-boss/` |
| Artefactos da corrida (intake/clarify) | `docs/.IA/outputs/<runId>/` **dentro do projecto registado** |

O diretório global tipo `C:\setup-boss-data` **não** substitui a pasta IA do projeto.

## Correlation ID (`requestId`)

- O daemon gera ou aceita `X-Setup-Boss-Request-Id` no `POST /runs`.
- A resposta inclui o mesmo valor no header homónimo.
- Todas as linhas de trace relevantes levam `requestId` quando o fluxo corre dentro do contexto AsyncLocalStorage iniciado na Runtime API.

## CLI `inspect-run`

```bash
npm run setup-boss -- inspect-run <runId>
```

Mostra: `outputDir`, existência de `runtime-trace.jsonl`, lista de artefactos esperados (presentes/ausentes), últimas linhas do trace e último erro.

## Client audit vs artifact-backed (UI)

Eventos derivados de `seedIntakeAuditForRun` são convertidos com:

- `metadata.source`: `"client"`
- `metadata.derivedFrom`: `"client-audit"`
- `metadata.notArtifactBacked`: `true`

Não devem ser tratados como prova de ficheiros em disco. Eventos emitidos pelo daemon aparecem no trace com `sse_event_emitted` e nos SSE habituais.
