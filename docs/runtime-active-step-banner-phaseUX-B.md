# Active Step Banner — Phase UX-B

## Objetivo

Estado operacional dominante no topo da execução do project run, consumindo a fundação semântica UX-A.

## Componentes

| Peça | Caminho |
|------|---------|
| Banner UI | `frontend/components/features/run-detail/ActiveStepBanner.tsx` |
| Resolução visual | `frontend/lib/runtime/ux/resolve-active-step-banner-view.ts` |
| Hook (UX-A) | `frontend/hooks/use-run-ux-state.ts` |
| Integração | `frontend/components/features/run-detail/RunViewShell.tsx` |

## Variantes visuais (prioridade única)

1. `failed` — execução interrompida
2. `completed` — sucesso terminal
3. `waiting_user_action` — ação humana (usa `deriveAttentionHint` quando disponível)
4. `stalled` — >90s sem progresso (não é erro)
5. `running` — progresso ativo

## Posição na UI

```
ProjectRunWorkflowStatusStrip
ActiveStepBanner          ← novo
CentralExecutionTimeline  (intocado)
```

## O que não mudou

- Timeline central e observabilidade
- Painéis clarification / strategy / execution
- Backend runtime e SSE

## Testes

```bash
node --experimental-strip-types --test frontend/lib/runtime/ux/resolve-active-step-banner-view.test.ts
```
