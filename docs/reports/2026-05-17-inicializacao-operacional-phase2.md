# Relatório — Inicialização operacional (Fase 2)

**Data:** 2026-05-17  
**Tipo:** append-only  
**Escopo:** UI da fase **Inicialização** no Mission Control (sem alterar Planejamento, Aprovação, Execução, etc.)

---

## Resumo

Implementada experiência operacional da **Inicialização** reutilizando o contrato UX da Fase 1 (`operationalUx` / `deriveOperationalUxContract`). A coluna central passa a mostrar apenas o rótulo humano **Inicialização**, com estados narrativos, validação real de `.IA`, formulário simples de atividade/prioridade/tags e exibição da SPEC inicial via API de evidência — sem mocks novos e sem expor termos técnicos (`intake`, `architect`, …) nesta superfície.

---

## Arquivos criados

| Arquivo | Função |
|---------|--------|
| `frontend/lib/runtime/operational/initialization-operational-state.ts` | Estados operacionais da Inicialização + `deriveInitializationOperationalStatus` |
| `frontend/lib/runtime/operational/initialization-operational-state.test.ts` | 5 testes unitários |
| `frontend/components/features/initialization/InitializationPhasePanel.tsx` | Painel central da fase |
| `frontend/components/features/initialization/InitialSpecBlock.tsx` | Leitura e pré-visualização de `task-plan-initial.md` |

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `frontend/lib/runtime/operational/index.ts` | Re-export do módulo de estados de inicialização |
| `frontend/hooks/use-orchestration.ts` | Governança também em corrida `intake`/`queue`/`pending` |
| `frontend/components/features/run-detail/RunViewShell.tsx` | Rota central dedicada à Inicialização (nova atividade + run em init) |
| `frontend/components/features/intake/TaskComposer.tsx` | Prop `operationalMode` — oculta headers técnicos |
| `package.json` | Teste `initialization-operational-state.test.ts` no `npm test` |

---

## Integração `.IA`

| Capacidade | Origem reutilizada |
|------------|-------------------|
| Validação pré-corrida | `useProjectGovernance` → `GET /projects/:id/governance` |
| Bloqueio sem `.IA` | `governance.readiness === "blocked"` → `operationalUx.iaValidated === false` |
| Card de onboarding/erros | `GovernanceStatusCard` (compact) no painel bloqueado |
| Sinais pós-corrida | Eventos `knowledge_bootstrap_*`, `governance_ia_ok` / `governance_ia_failed` no contrato Fase 1 |

Nenhum validador paralelo foi criado; `deriveInitializationOperationalStatus` apenas traduz o contrato existente para copy UI.

---

## Estados implementados

| Estado operacional | Rótulo UI |
|--------------------|-----------|
| `awaiting_start` | Aguardando inicialização |
| `validating_ia` | A validar base .IA |
| `ia_found` | Base .IA encontrada |
| `ia_missing` | Contexto IA não encontrado |
| `loading_context` | A carregar contexto do projeto |
| `awaiting_activity` | Aguardar descrição da atividade |
| `generating_spec` | A gerar SPEC inicial |
| `spec_ready` | SPEC inicial pronta |

Checklist lateral no painel; estado actual em destaque no cabeçalho (`role="status"`).

---

## Fluxo operacional implementado

1. **Nova atividade** (`newActivityFlow && !runId`): coluna central = `InitializationPhasePanel` (sem timeline técnica).
2. **Validar `.IA`**: loading + bloqueio com mensagem “Contexto IA não encontrado”.
3. **Input**: `TaskComposer` em `operationalMode` (atividade, prioridade, tags) + `POST /runs` existente.
4. **Corrida em intake**: painel central até `operationalUx.isInitializationPhase === false`.
5. **SPEC inicial**: quando `initialSpecReady`, `InitialSpecBlock` busca `task-plan-initial.md` em `GET /runs/:id/evidence` + conteúdo via `fetchArtifactContent`.

Fases posteriores (clarificação, strategy, execução) continuam no fluxo anterior quando a inicialização termina.

---

## Limitações atuais

- **`skipLlm: true`** no `TaskComposer` — SPEC pode não existir como ficheiro mesmo com `initialSpecReady` derivado por eventos; o bloco informa ausência do artefacto sem mock.
- **Checklist linear** — ramo `ia_missing` não avança na rail; mensagem dedicada.
- **`OperationalUxPanel`** / timeline técnica ficam ocultos durante a Inicialização central; reaparecem ao passar para Montando o plano.
- **Ribbon / ActiveStepBanner** — ainda usam modelo visual legado fora do escopo desta fase.

---

## Gaps backend ainda existentes

1. Sem flag dedicada `initialSpecReady` no `RunSummary` — derivação por eventos/heurística (Fase 1).
2. Sem endpoint de milestone UX (`uxPhase`) no summary.
3. Geração LLM da SPEC desligada por defeito no MC (`skipLlm: true`).
4. “Contexto carregado” continua inferido por eventos, não por campo explícito na API.

---

## Como validar manualmente

### Testes automáticos

```bash
node --experimental-strip-types --test frontend/lib/runtime/operational/initialization-operational-state.test.ts
node --experimental-strip-types --test frontend/lib/runtime/operational/derive-operational-ux-contract.test.ts
```

**Esperado:** 12/12 passando (5 + 7).

### Stack (`npm run dev:stack`)

1. Mission Control → projeto com `.IA` válida → **Nova atividade**.
2. Verificar título **Inicialização** e estados (validação → descrição da atividade).
3. Preencher atividade (≥12 chars), prioridade, tags → iniciar.
4. Com corrida em intake: mensagem “A gerar SPEC inicial”; após evento/artefacto, **SPEC inicial pronta** + conteúdo no bloco central.
5. Projeto sem `.IA`: bloqueio “Contexto IA não encontrado”, sem avanço.
6. Após clarificação: UI regressa ao fluxo anterior (Montando o plano) — sem regressão na timeline de execução.

---

## Critérios de aceite

| Critério | Estado |
|----------|--------|
| UI com etapa “Inicialização” | ✅ |
| `.IA` validada com integração real | ✅ |
| Input atividade / prioridade / tags | ✅ |
| SPEC inicial gerada e exibida (quando artefacto existe) | ✅ |
| Bloqueio sem `.IA` | ✅ |
| Sem labels técnicas na superfície de init | ✅ |
| Sem mocks novos | ✅ |
| Outras fases não alteradas | ✅ |

---

## Referências

- Contrato Fase 1: `docs/reports/2026-05-17-ux-operational-contract-phase1.md`
- Discovery: `docs/reports/2026-05-17-inicializacao-montando-plano-ux-discovery.md`
