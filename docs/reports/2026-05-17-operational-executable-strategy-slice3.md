# Relatório — Estratégia operacional executável (Slice 3 — UI)

**Data:** 2026-05-17  
**Tipo:** UI de aprovação (`OperationalPlanDocument`)  
**Contrato:** [`docs/operational-executable-strategy-contract.md`](../operational-executable-strategy-contract.md)

---

## Resumo

O plano de aprovação passa a consumir `strategy.executableStrategy` (já exposto no DTO desde o Slice 2) através de uma projeção dedicada para UI. Mini-tarefas executáveis, dependências, impacto esperado e estratégia de execução ficam visíveis no documento técnico, com modo compacto para planos históricos e fallbacks para runs legados/degradados.

**Fora de escopo (conforme pedido):** runtime, aprovação, execução, geração de nova estratégia.

---

## O que foi exposto na UI

| Secção | Fonte OES | Comportamento |
|--------|-----------|---------------|
| **Mini-tarefas** | `miniTasks[]` | Ordem, título, objetivo, escopo, complexidade, risco, critérios, dependências inline |
| **Impacto esperado** | `expectedImpact` | Arquivos, componentes, módulos, riscos estrutural/visual/comportamental |
| **Estratégia de execução** | `orderingMode`, `executionPattern`, `validationApproach`, `macroOrder` | Narrativa em PT-BR + ordem macro |
| **Aviso degradado** | `degraded` / `available` | Texto discreto no topo do documento |

---

## Decisões de visualização

1. **Projeção separada** — `operational-plan-executable-view.ts` traduz o DTO para tipos de apresentação; o componente React só renderiza.
2. **Documento técnico** — blocos leves (`operational-mini-task`, separadores `border-border/15`), sem cards pesados.
3. **Plano atual vs histórico**
   - Ativo (`compact=false`): mini-tarefas ricas completas.
   - Histórico (`compact=true`): lista resumida (ordem + título); label «Substituído por plano atualizado» mantido pelo `PlanApprovalTimeline`.
4. **Dependências** — uma linha por mini-tarefa: `Depende de: Mini-tarefa N — Título`; sem grafo.
5. **Ordenação em PT-BR** — `linear` → Sequencial, `staged` → Por etapas, `parallel` → Paralelizável.
6. **Impacto** — secção omitida se não houver listas úteis; em modo degradado, texto: «Impacto detalhado indisponível para esta execução.»

---

## Fallbacks

| Condição | UI |
|----------|-----|
| `executableStrategy` ausente / `null` | Plano humano atual (comportamento anterior) |
| `degraded` ou `!available` | Plano humano + aviso «Estratégia executável detalhada indisponível…» |
| OES completo | Secções ricas; `plan.miniTasks` legado usado só se OES não projetar tarefas |

Sem mensagens de erro técnico expostas ao operador.

---

## Ficheiros alterados

| Ficheiro | Alteração |
|----------|-----------|
| `frontend/lib/runtime/operational/operational-plan-executable-view.ts` | Projeção OES → view UI |
| `frontend/lib/runtime/operational/operational-plan-types.ts` | Campo `executableStrategyView` |
| `frontend/lib/runtime/operational/translate-operational-plan.ts` | Preenche view na tradução |
| `frontend/components/features/planning/OperationalPlanDocument.tsx` | Renderização rica/compacta/legada |
| `frontend/styles/plan-approval-timeline.css` | Classes `operational-*` |
| `frontend/lib/runtime/operational/operational-plan-executable-view.test.ts` | Testes da projeção |
| `frontend/lib/runtime/operational/translate-operational-plan.test.ts` | Teste integração translate + OES |

---

## Testes

```bash
node --test frontend/lib/runtime/operational/operational-plan-executable-view.test.ts \
           frontend/lib/runtime/operational/translate-operational-plan.test.ts
```

Cobertura:

- OES completo (mini-task com dependência, narrativa de execução, impacto)
- Modo degradado / legado
- Impacto vazio (secção não forçada)
- `translateOperationalPlan` com `executableStrategyView`

---

## Próximos passos (sugestão)

1. **Slice 4 — Aprovação explícita da estratégia** — hash `strategySha256` no fluxo de approve.
2. **Execução** — mapear `miniActivities` 1:1 com `miniTasks` do OES aprovado.
3. **Comentários iterativos** — regenerar/reexpor OES quando o plano v2+ for gerado.
4. **Testes E2E de UI** — validar timeline com run real que tenha `operational-executable-strategy.json`.
