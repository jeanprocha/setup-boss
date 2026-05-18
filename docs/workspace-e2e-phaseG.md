# Workspace multi-projeto E2E — Fase G (estabilização operacional)

**Data:** 2026-05-17  
**Pré-requisitos:** Fases A–F (workspace, runs, minis, orquestrador, Git agregado, UI Mission Control)

## Objetivo

Validar localmente o fluxo completo multi-projeto e endurecer pontos operacionais (locks, reconcile, recovery no boot) antes de features avançadas.

## Fluxo mínimo validado

1. Criar `Workspace` com vários projetos
2. Criar `WorkspaceRun`
3. Adicionar `miniActivities` em projetos diferentes (com `dependsOn` opcional)
4. `prepare-git` multi-projeto (branch global)
5. `start` → cria runs filhos sequenciais
6. Simular estados do filho: `completed`, `waiting_user_action`, `failed`
7. `resume` / `retry-mini-activity` / `skip-mini-activity`
8. Status agregado e `childRunIds` consistentes
9. Recovery após “restart” (reconcile no boot + persistência em disco)
10. Run legado `Project → Run` sem metadados de workspace

## Smoke obrigatório

```bash
npm run smoke:workspace-e2e-phaseG
```

Valida: persistência, Git agregado, vínculo filho↔mini, `dependsOn`, anti-duplicação em resume/start, retry/skip, reconcile de mini presa, recovery, branch propagada, run legado.

## Estabilizações (Fase G)

| Mecanismo | Ficheiro | Função |
|-----------|----------|--------|
| Lock por `workspaceRunId` | `workspace-run-lock.js` | Evita race em start/resume/retry/skip concorrentes |
| Reconcile | `workspace-run-reconcile.js` | Mini `running` sem `runId`, `childRunIds`, status agregado |
| Boot recovery | `setup-bossd.js` | `reconcileWorkspaceRunsOnBoot` após rehydration |

Códigos de erro novos: `workspace_run_orchestration_busy` (lock não adquirido).

## Testes unitários

```bash
node --test scripts/daemon/lib/workspace-run-reconcile.test.js
node --test scripts/daemon/lib/workspace-run-orchestrator.test.js
```

## Fora de escopo (Fase G)

Execução paralela, SSE, merge automático, PR agregado, DAG avançado, decomposição IA, redesign UI.

## Limitações restantes

- Avanço da sequência ainda depende de chamadas explícitas (`start`/`resume`/retry/skip) — sem worker de poll dedicado
- Reconcile não reexecuta runs filhos órfãos automaticamente
- Lock baseado em PID local (adequado a daemon single-node)

## Próximo passo recomendado

Job daemon `workspace_run_sync` com poll periódico enquanto `status=running`, emitindo eventos para a UI.
