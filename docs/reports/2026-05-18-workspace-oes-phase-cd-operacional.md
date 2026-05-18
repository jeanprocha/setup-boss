# Operacional — Fases C + D WorkspaceRun

## O que mudou para o utilizador

1. Criar atividade num workspace multi-projeto continua a abrir a **run de planeamento** (clarificação + plano).
2. Ao **aprovar o plano**, a estratégia gera automaticamente etapas por repositório.
3. O painel do workspace passa a mostrar **mini-atividades reais** (agrupadas por projeto), sem criação manual.
4. Só depois disso: **Git agregado** e botão **Start** ficam coerentes.

## Checklist rápido

- [ ] Criar WorkspaceRun com 2+ projetos
- [ ] Completar clarificação e aprovar plano com backend + frontend + integração
- [ ] Confirmar mini-atividades materializadas no workspace
- [ ] Confirmar dependência da etapa de integração
- [ ] Start workspace run → execução sequencial + review granular

## Se algo falhar

- Verificar `run-context.json` da planning run: bloco `workspace.workspaceRunId`.
- Verificar `globalSpec.planningRunId` no WorkspaceRun.
- Logs: evento `workspace_after_strategy_sync` no daemon.
