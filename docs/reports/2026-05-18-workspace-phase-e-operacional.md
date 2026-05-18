# Operacional — Fase E

## O que validar em 5 minutos

1. **Nova** atividade no workspace `wiser` (não reutilizar runs antigos sem minis).
2. Task: «Criar exportação PDF dashboard».
3. Aprovar plano → esperar mini-atividades (3 etapas típicas: API, modal, integração).
4. Git agregado visível → Start.

## Se não materializar

- Ver evento `workspace_after_strategy_sync` nos logs do daemon.
- Confirmar `run-context.json` da planning run: bloco `workspace` com `workspaceRunId` e `projectIds`.
- Confirmar API (`proj_3326f20c` ou equivalente) listada em GET `/projects`.

## Comando de regressão rápida

```bash
npm run smoke:workspace-multi-project-phaseE
```
