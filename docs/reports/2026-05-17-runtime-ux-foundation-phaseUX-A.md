# Relatório — Runtime UX Foundation Phase UX-A

**Data:** 2026-05-17  
**Tipo:** append-only (execução Cursor)  
**Escopo:** Fundação semântica UX operacional do Mission Control

---

## Resumo

Implementada a camada semântica pura no frontend: normalização de eventos (`RuntimeUxEvent`), derivação de estado UX (`RunUxState`), hook `useRunUxState` e testes unitários. Nenhuma alteração em runtime backend, SSE, workspace orchestration, executor ou UI visual existente.

---

## Arquivos criados

| Arquivo |
|---------|
| `frontend/lib/runtime/ux/runtime-ux-types.ts` |
| `frontend/lib/runtime/ux/normalize-runtime-event.ts` |
| `frontend/lib/runtime/ux/derive-run-ux-state.ts` |
| `frontend/lib/runtime/ux/normalize-runtime-event.test.ts` |
| `frontend/lib/runtime/ux/derive-run-ux-state.test.ts` |
| `frontend/hooks/use-run-ux-state.ts` |
| `docs/runtime-ux-foundation-phaseUX-A.md` |
| `docs/reports/2026-05-17-runtime-ux-foundation-phaseUX-A.md` |

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `package.json` | Inclusão dos dois testes UX-A no script `npm test` |
| `frontend/tsconfig.json` | `allowImportingTsExtensions: true` (imports `.ts` em testes node) |

---

## Decisões

1. **Normalização só no frontend (V1)** — zero mudanças em `emitRuntimeEvent` ou SSE; compatível com discovery UX-A.
2. **`workspace` → `activeStep: execution`** — `RunUxActiveStep` não inclui workspace; eventos de workspace correlacionam com orquestração/execução.
3. **Stall a 90s** — conforme spec; timer de 5s no hook para re-derivar `isStalled` sem polling de API.
4. **Eventos `system`/`unknown`** — normalizados mas não definem `activeStep`; último evento operacional prevalece.
5. **`strategy_completed` com `skipped: true`** — mensagem humana explícita (“sem decomposição adicional”).
6. **Hook não exportado na UI** — preparação para UX-B; timeline e observabilidade intactas.

---

## Limitações

- `completedSteps` baseado em `phase === completed` por kind — não modela DAG nem subtasks.
- Stall não distingue LLM vs filesystem vs HITL (mensagem genérica).
- `execution_started` duplicado no backend continua possível; dedupe não aplicado nesta fase.
- Hook depende de `useRunEvents` (poll + SSE + audits) — mesmas lacunas de `projectId` nulo.
- Testes usam imports relativos com sufixo `.ts` (padrão do repo para `node --test`).

---

## Validações executadas

```bash
node --experimental-strip-types --test frontend/lib/runtime/ux/normalize-runtime-event.test.ts frontend/lib/runtime/ux/derive-run-ux-state.test.ts
```

**Resultado:** 20/20 testes passaram (2 suites).

```bash
cd frontend && npx tsc --noEmit
```

**Resultado:** sem erros em `lib/runtime/ux/*` nem `hooks/use-run-ux-state.ts` (erros pré-existentes noutros ficheiros fora do escopo).

---

## Próximos passos (UX-B)

1. `ActiveStepBanner` com `useRunUxState`
2. Integrar `isStalled` e `hasHumanAction` na shell do run
3. Opcional: expor `normalizeRuntimeUxEvents` em devtools/diagnostics
4. V2 backend: campo `semantic` em `emitRuntimeEvent` (fora do escopo UX-A)

---

## Log de execução

- Discovery prévia: `docs/reports/2026-05-17-ux-operacional-mission-control-discovery.md`
- Implementação UX-A concluída em 2026-05-17
