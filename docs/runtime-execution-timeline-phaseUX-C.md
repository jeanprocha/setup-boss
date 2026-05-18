# Execution Timeline — Phase UX-C

## Objetivo

Timeline humana por checkpoints, derivada da camada semântica UX-A, mostrando concluído / ativo / pendente / waiting / failed.

## Módulos

| Módulo | Caminho |
|--------|---------|
| Derivação | `frontend/lib/runtime/ux/derive-execution-timeline.ts` |
| UI | `frontend/components/features/run-detail/ExecutionTimelineView.tsx` |
| Integração | `RunViewShell` — abaixo do `ActiveStepBanner` |

## Checkpoints (ordem fixa)

1. Intake  
2. Clarificação  
3. Plano  
4. Aprovação  
5. Git  
6. Estratégia  
7. Execução  
8. Revisão  
9. Correção  
10. Conhecimento  
11. Concluído  

## Estados

| Status | Significado |
|--------|-------------|
| `completed` | Etapa terminada (incl. strategy skipped) |
| `active` | Etapa atual em progresso |
| `waiting` | Ação humana pendente |
| `failed` | Falha na etapa |
| `pending` | Ainda não alcançada |
| `skipped` | Omitida explicitamente |

## Entrada / saída

```typescript
deriveExecutionTimeline(events: RuntimeUxEvent[], ux: RunUxState): ExecutionTimeline
```

Sem progresso percentual falso.

## Testes

```bash
node --experimental-strip-types --test frontend/lib/runtime/ux/derive-execution-timeline.test.ts
```
