# Runtime UX Foundation — Phase UX-A

## Objetivo

Camada semântica central no frontend que transforma eventos técnicos do runtime em estados UX determinísticos, sem alterar backend, executor, pipeline ou UI existente.

## Módulos

| Módulo | Caminho | Responsabilidade |
|--------|---------|------------------|
| Tipos | `frontend/lib/runtime/ux/runtime-ux-types.ts` | `RuntimeUxEvent`, `RunUxState`, constantes |
| Normalização | `frontend/lib/runtime/ux/normalize-runtime-event.ts` | `normalizeRuntimeEvent`, `normalizeRuntimeUxEvents` |
| Derivação | `frontend/lib/runtime/ux/derive-run-ux-state.ts` | `deriveRunUxState` |
| Hook | `frontend/hooks/use-run-ux-state.ts` | Integração mínima com `useRunEvents` |

## Fluxo de dados

```
ApiRuntimeEventRow / RuntimeEventDto / WorkspaceRunSsePayload
        ↓ normalizeRuntimeEvent
   RuntimeUxEvent[]
        ↓ deriveRunUxState
      RunUxState
        ↓ useRunUxState (hook)
   consumidores futuros (UX-B+)
```

## Contratos

### RuntimeUxEvent

- `kind`: domínio operacional (intake, clarification, plan, approval, git, strategy, execution, review, correction, knowledge, workspace, system, unknown)
- `phase`: started | running | waiting | completed | failed | info
- `title` / `message`: texto humano PT-BR
- `raw`: payload original preservado para debug

### RunUxState

- `activeStep`: etapa dominante atual
- `status`: running | waiting_user_action | completed | failed
- `headline` / `detail`: texto para banner (UX-B)
- `isStalled`: true se > 90s sem progresso relevante (exceto waiting_user_action)
- `completedSteps`: etapas com checkpoint `completed`

## Regras de stall

- Threshold: `RUN_UX_STALL_MS` = 90_000
- Conta apenas eventos com `kind` operacional e `phase` ≠ `info`
- Não aplica quando `status === waiting_user_action`

## Integração

`useRunUxState(projectId, selectedRunId)` — não substitui componentes existentes.

## Testes

```bash
node --experimental-strip-types --test frontend/lib/runtime/ux/normalize-runtime-event.test.ts frontend/lib/runtime/ux/derive-run-ux-state.test.ts
```

## Próxima fase (UX-B)

- `ActiveStepBanner` consumindo `useRunUxState`
- Sem remover timeline/observabilidade atuais
