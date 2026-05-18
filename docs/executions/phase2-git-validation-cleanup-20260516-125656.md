# Phase 2 — Git Validation Cleanup

**Execução:** 2026-05-16T12:56:56 (local)  
**Âmbito:** estabilização do contrato Git de `docs/.IA` (MISSING / UNTRACKED / IGNORED), erros estruturados pre-run, observabilidade e UX.

## Objetivo

Corrigir classificação Git da base `.IA`, padronizar payload de erro pre-run, garantir diagnósticos sem run criada e melhorar mensagens no intake/observabilidade — sem expandir para governance/spec/drift.

## Causa raiz

1. Mensagens canónicas inconsistentes entre validador, API e frontend (título vs mensagem curta).
2. Traces `knowledge_bootstrap_failed` incompletos (`suggestedActions`, `title`, erro estruturado) — diagnósticos pre-run perdiam contexto.
3. Fase interna `IGNORED` reutilizava `knowledge_bootstrap_untracked`, confundindo observabilidade.
4. `traceId` nem sempre propagava a partir de `requestId` no canal pre-run.

A lógica UNTRACKED vs IGNORED já usava ficheiros reais (`listDocsIaFilePaths` + `git check-ignore` por ficheiro); o problema reportado era sobretudo contrato/UX/observabilidade.

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `core/validate-project-knowledge-base.js` | Mensagens canónicas; fase `knowledge_bootstrap_ignored`; descrições alinhadas ao spec |
| `core/validate-project-knowledge-base.test.js` | Asserções de mensagem/fase |
| `core/pre-run-error.test.js` | Contrato payload API |
| `scripts/daemon/lib/pre-run-observability.js` | `traceKnowledgeBootstrapFailed`; `traceId` ← `requestId` |
| `scripts/daemon/lib/pre-run-observability.test.js` | Teste de trace com `suggestedActions` |
| `scripts/daemon/lib/run-intake-api.js` | Usa helper de trace enriquecido |
| `scripts/daemon/lib/run-intake-api.test.js` | Mensagem UNTRACKED + `timestamp` |
| `frontend/lib/runtime/intake/pre-run-error.ts` | Títulos/corpos inline por código |
| `frontend/lib/runtime/intake/pre-run-error.test.ts` | Testes de renderização/contrato (Node strip-types) |

## Decisões tomadas

- **MISSING:** `message` = "Base de conhecimento obrigatória não encontrada."; `description` mantém contexto longo.
- **UNTRACKED:** `git ls-files -- docs/.IA` vazio + pasta local existente + nem todos os ficheiros amostrados ignorados → `KNOWLEDGE_BASE_UNTRACKED`.
- **IGNORED:** ficheiros reais sob `docs/.IA` e todos amostrados com `git check-ignore` → `KNOWLEDGE_BASE_IGNORED` (fase interna `knowledge_bootstrap_ignored`).
- **API pre-run:** `{ ok: false, error: enrichPreRunError(...) }` com `phase: validate_docs_ia` para códigos KB (catálogo `core/pre-run-error.js`).
- **Observabilidade:** evento `knowledge_bootstrap_failed` grava `error` estruturado + `metadata.channel: pre_run` + `suggestedActions`.
- **Frontend:** draft preservado em falha (`useCreateRun` não limpa `taskDraft`); ações copiar diagnóstico / observabilidade / tentar novamente já existentes no `TaskComposer`.

## Testes executados

```bash
node --test core/validate-project-knowledge-base.test.js core/pre-run-error.test.js \
  scripts/daemon/lib/pre-run-observability.test.js scripts/daemon/lib/run-intake-api.test.js

node --experimental-strip-types --test frontend/lib/runtime/intake/pre-run-error.test.ts
```

**Resultado:** 29 + 2 testes, todos passaram.

Cobertura: missing, untracked, ignored, payload estruturado, diagnostics pre-run, frontend inline UNTRACKED.

## Limitações

- Validação continua amostra até 24 ficheiros sob `docs/.IA` para classificar IGNORED (suficiente para MVP; diretório vazio sem tracked continua UNTRACKED).
- Teste frontend isolado requer `node --experimental-strip-types` (não integrado no `npm test` raiz).
- Não incluído nesta fase: governance, spec, drift, index, language, secrets, migrations, health score.

## Resultado final

Contrato Git da `.IA` estabilizado com classificação correta, mensagens alinhadas ao spec, erros pre-run estruturados com `phase`/`traceId`/`suggestedActions`, traces e GET `/diagnostics/events` utilizáveis sem run criada, e UX de intake com título/mensagem/ações coerentes para UNTRACKED/MISSING/IGNORED.
