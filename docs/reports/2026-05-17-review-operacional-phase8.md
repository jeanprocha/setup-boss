# Relatório — Review operacional (Fase 8)

**Data:** 2026-05-17  
**Tipo:** append-only  
**Escopo:** Fase visual **Review** pós-execução concluída, documento consolidado real, HITL confirmar/solicitar ajuste

---

## Resumo

Após **Execução concluída**, a coluna central entra em **Review** com documento derivado de clarificação, bundle de execução e evidências (`review-output.json`, diagnósticos, integridade). CTAs **Confirmar review** e **Solicitar ajuste** usam API real (`operational-review-state.json` + `POST /runs/:id/operational-review/*`). Sem mocks, sem PR/push/finalização.

---

## Arquivos criados

| Arquivo | Função |
|---------|--------|
| `scripts/runtime/operational-review/operational-review-state.js` | Persistência HITL `operational-review-state.json` |
| `scripts/runtime/operational-review/operational-review-state.test.js` | Teste persistência |
| `scripts/daemon/lib/run-operational-review-api.js` | GET session, confirm, request-adjustment |
| `frontend/lib/runtime/operational/operational-review-types.ts` | DTOs |
| `frontend/lib/runtime/operational/build-operational-review-document.ts` | Montagem do documento consolidado |
| `frontend/lib/runtime/operational/review-operational-state.ts` | Visibilidade fase Review |
| `frontend/lib/runtime/operational/review-operational-state.test.ts` | 4 testes |
| `frontend/lib/runtime/operational/operational-review-actions.ts` | Cliente HTTP |
| `frontend/hooks/use-operational-review.ts` | Query sessão HITL |
| `frontend/hooks/use-operational-review-mutations.ts` | Mutations confirm/adjust |
| `frontend/components/features/planning/OperationalReviewDocument.tsx` | Render documento |
| `frontend/components/features/planning/ReviewPhasePanel.tsx` | UI fase Review |

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `scripts/daemon/runtime-api.js` | Rotas operational-review |
| `frontend/lib/runtime/operational/execution-operational-state.ts` | Oculta Execução quando concluída (exceto ajuste) |
| `frontend/lib/runtime/operational/derive-operational-ux-contract.ts` | `uxPhase: review` pós-execução |
| `frontend/components/features/run-detail/RunViewShell.tsx` | `runReviewPhase` + precedência |
| `frontend/lib/api/query-keys.ts` | `operationalReview` |
| `frontend/lib/runtime/operational/index.ts` | Re-exports |
| `package.json` | Testes review no `npm test` |

---

## Dados reais reutilizados

| Fonte | Uso no documento |
|-------|------------------|
| `ClarificationBundle` / `parseRefinedPlanPresentation` | Resumo, critérios de aceite, riscos |
| `ExecutionBundle` | Progresso, subtasks concluídas, blockers |
| `useRunEvidence` / `review-output.json` | Validação automática, `allowed_files` / `changed_files` |
| Artefactos `execution/*` | Ficheiros alterados (heurística paths) |
| `integrity` + `diagnostics` | Validações e testes |
| `GET /runs/:id/operational-review` | Estado HITL (`pending` / `confirmed` / `adjustment_requested`) |

---

## Como o documento de review é montado

`buildOperationalReviewDocument()` agrega:

1. **Resumo** — título da atividade, objectivo do plano, subtasks concluídas ou progresso, `summary` de `review-output.json` quando existir.
2. **Ficheiros alterados** — `review-output.json` (`execution_context.allowed_files`, `changed_files`) ou paths de artefactos de execução.
3. **Critérios de aceite** — lista do plano refinado; estado derivado do progresso real (`met` / `parcial` / `a verificar`).
4. **Validações/testes** — integridade, diagnósticos, `warnings` / `blocking_issues` do review-output.
5. **Pontos de atenção** — riscos do plano + blockers da execução.
6. **Cópia UX** — «Validação automática…», «Ajustes aplicados…» (sem expor deterministic review, correction loop, etc.).

---

## Critérios de aceite na UI

Checklist com ícone por critério e rótulo **Atendido** / **Parcial** / **A verificar** conforme `execution.summary.progress` (sem inventar verificação por critério individual quando o runtime não expõe).

---

## Confirmar review / solicitar ajuste

| Acção | API | Comportamento |
|-------|-----|---------------|
| **Confirmar review** | `POST /runs/:id/operational-review/confirm` | Grava `operational-review-state.json` (`confirmed`), evento `operational_review_confirmed` |
| **Solicitar ajuste** | `POST /runs/:id/operational-review/request-adjustment` | Grava `adjustment_requested` + tenta `triggerRunExecution({ force: true })` para voltar à **Execução** |

Se a reexecução automática falhar, o pedido de ajuste fica registado e a UI mostra aviso para usar **Iniciar execução** manualmente.

**Comentário:** campo texto opcional na confirmação; obrigatório no pedido de ajuste.

---

## Gaps / limitações

1. **Critério a critério** — runtime não expõe pass/fail por critério; estado derivado apenas do progresso global.
2. **Conteúdo de artefactos** — listagem de evidência pode não incluir corpo JSON até fetch de conteúdo; `review-output.json` só entra no documento se estiver no bundle com `content`.
3. **Reexecução após ajuste** — depende de `force: true` no execute; falhas parciais documentadas na UI.
4. **Finalização / PR / push** — fora de âmbito.
5. **Review automático interno** — já ocorreu durante execução; fase 8 é HITL do operador, distinta da aprovação de plano.

---

## Validação manual

```bash
node --experimental-strip-types --test frontend/lib/runtime/operational/review-operational-state.test.ts
node --test scripts/runtime/operational-review/operational-review-state.test.js
```

### Stack (`npm run dev:stack`)

1. Concluir até **Execução concluída** (Fase 7).
2. Coluna central passa a **Review**.
3. Ver resumo, ficheiros (se evidência disponível), checklist de critérios.
4. **Confirmar review** → banner **Review concluído**.
5. (Opcional) Nova corrida: **Solicitar ajuste** com comentário → volta à fase **Execução**.
6. Confirmar ausência de termos técnicos (deterministic, orchestration, DAG, etc.).

---

## Critérios de aceite

| Critério | Estado |
|----------|--------|
| Após execução concluída, UI entra em «Review» | ✅ |
| Resumo real do que foi feito | ✅ |
| Ficheiros alterados reais quando disponíveis | ✅ |
| Checklist de critérios | ✅ |
| Confirmar review | ✅ |
| Solicitar ajuste (com reexecução ou aviso) | ✅ |
| Sem termos técnicos internos | ✅ |
| Sem mocks novos | ✅ |

---

## Referências

- Fase 7: `docs/reports/2026-05-17-execucao-operacional-phase7.md`
- Review output: `core/normalize-review-output-from-bundle.js`
- Evidência: `scripts/daemon/lib/run-evidence.js`
