# Relatório — Fix auto-start travado (git_branch_mismatch)

**Data:** 2026-05-17  
**Tipo:** append-only  
**Base:** `docs/reports/2026-05-17-discovery-execucao-travada-apos-branch.md`

---

## Causa raiz

1. **`executionAutoStartInProgress`** activava o banner «A iniciar execução automaticamente…» só com `git_branch_ready`, **sem** verificar `availability.canExecute`.
2. **`useExecutionAutoStart`** já não chamava `POST /execute` quando `canExecute === false` (ex.: `git_branch_mismatch`).
3. O **hint de bloqueio** ficava oculto enquanto `autoStartActive` era true → spinner infinito sem explicação.
4. O **summary** não expunha `currentBranch` quando o gate Git falhava, impedindo mensagem operacional completa na UI.

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `frontend/lib/runtime/execution/execution-auto-start-policy.ts` | `canExecute` em `executionAutoStartInProgress`; `isExecutionAutoStartBlocked` |
| `frontend/lib/runtime/execution/execution-auto-start-block-message.ts` | **Novo** — cópia operacional (mismatch, etc.) |
| `frontend/lib/runtime/execution/execution-auto-start-block-message.test.ts` | **Novo** — 2 testes |
| `frontend/lib/runtime/execution/log-execution-auto-start-observation.ts` | **Novo** — logs UI → «Logs do runtime» |
| `frontend/hooks/use-execution-auto-start.ts` | Logs avaliada/bloqueada/iniciada/falha |
| `frontend/components/features/planning/ExecutionPhasePanel.tsx` | Alerta de bloqueio; spinner só com `canExecute` |
| `frontend/lib/api/runtime-types.ts` | `git.currentBranch` |
| `frontend/lib/runtime/adapters/map-run-git-summary.ts` | Mapeia `currentBranch` |
| `frontend/lib/runtime/observability/filter-runtime-log-operational.ts` | Categoria `execution` + eventos `execution_auto` |
| `frontend/lib/runtime/observability/runtime-log-entry-view-model.ts` | Título «Execução» para logs da categoria |
| `frontend/components/features/observability/RuntimeObservabilityLogs.tsx` | Filtra logs UI por `runId` |
| `frontend/lib/runtime/ux/normalize-runtime-event.ts` | `execution_start_blocked` |
| `core/map-run-git-for-ui.js` | Expõe `currentBranch` no envelope |
| `scripts/daemon/lib/run-git-ui-envelope.js` | Preenche `currentBranch` quando gate falha |
| `scripts/daemon/lib/run-git-ui-envelope.test.js` | Teste mismatch + `currentBranch` |
| `scripts/daemon/runtime-api.js` | `execution_start_blocked` + `runtimeLogger.warn` no POST rejeitado |
| `package.json` | Teste `execution-auto-start-block-message` |

---

## Como o bloqueio operacional aparece agora

Quando `git_branch_ready` mas `canExecute === false` (`git_branch_mismatch`):

- **Não** aparece «A iniciar execução automaticamente…».
- Aparece caixa âmbar com:
  - Título: «Branch Git não coincide»
  - Corpo com branch esperada, branch actual e acção necessária (sem códigos internos).
- **Logs do runtime** (vista operacional): entradas «Execução automática avaliada» / «Execução automática bloqueada» com motivo e branches no detalhe JSON.

Outros bloqueios (`git_branch_required`, etc.) usam o mesmo padrão com cópia genérica ou específica.

---

## Eventos operacionais adicionados

### UI → Logs do runtime (categoria `execution`)

| Evento interno | Mensagem resumida |
|----------------|-------------------|
| `execution_auto_evaluated` | Execução automática avaliada |
| `execution_auto_blocked` | Execução automática bloqueada (+ motivo) |
| `execution_auto_started` | Execução automática iniciada (antes do POST) |
| `execution_auto_failed` | Falha ao iniciar execução |

### Backend (quando POST `/execute` é rejeitado)

| Evento SSE | Log daemon |
|------------|------------|
| `execution_start_blocked` | `execution_start_blocked` (warn) |

### Já existentes (inalterados)

| Evento | Quando |
|--------|--------|
| `execution_triggered` | POST /execute OK → job enfileirado |
| `execution_started` | Worker/orchestration |

Detalhes técnicos completos continuam na aba **Execução técnica** / vista **full** dos logs.

---

## Como validar manualmente

1. Reproduzir mismatch: branch preparada A, HEAD em branch B (ou usar corrida `20260517-105727-…` se ainda aplicável).
2. Abrir fase **Execução** após versionamento.
3. **Verificar:** sem spinner infinito; caixa com branches esperada/actual.
4. **Observabilidade → Logs do runtime:** linhas «Execução automática avaliada» e «bloqueada» com `git_branch_mismatch`.
5. **Rede:** nenhum `POST /execute` enquanto bloqueado; fila sem `run_execute`.
6. Alinhar branch (`git checkout <activityBranch>`) ou repetir versionamento → banner de auto-start + um POST /execute + `execution_triggered`.
7. Testes:  
   `node --test frontend/lib/runtime/execution/execution-auto-start-policy.test.ts frontend/lib/runtime/execution/execution-auto-start-block-message.test.ts scripts/daemon/lib/run-git-ui-envelope.test.js`

---

## Limitações atuais (fora de escopo)

- **Sem** retry automático nem auto-checkout da branch correcta.
- **Sem** correcção idempotente no `prepareRunGitBranch` quando HEAD ≠ `activityBranch`.
- Logs de auto-start na UI são **client-side** (store de diagnóstico); eventos SSE de bloqueio no servidor só quando o cliente chega a chamar POST /execute.
- `currentBranch` só vem no envelope Git quando o gate de execução falha (não em todos os estados).

---

## Critérios de aceite

| Critério | Estado |
|----------|--------|
| Spinner infinito desaparece | OK |
| Bloqueio real visível na UI | OK |
| Auto-start só com `canExecute === true` | OK |
| Logs operacionais com motivo | OK |
| Worker sem job quando bloqueado | OK (comportamento preservado) |
| Sem mocks novos | OK |
