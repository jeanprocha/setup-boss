# Mission Control — limpeza de UI (cards e controlos do runtime)

**Data:** 2026-05-15  
**Objectivo:** reduzir ruído visual no fluxo principal, manter todas as acções do runtime disponíveis e preservar SSE, sidebar e contratos de API.

---

## 1. Elementos removidos

| Elemento | Onde | Motivo |
|----------|------|--------|
| Card **Estado intake** (badge “Pronto”, texto genérico) | `IntakeStateCard` — usado em `RunViewShell` e `CreateTaskPanel` | Duplicava estado já visível nos badges do `TaskComposer` e no `OperationalFocusCard`; aumentava sensação de “dashboard técnico”. |
| Ficheiro **`IntakeStateCard.tsx`** | Eliminado | Componente deixou de ser referenciado. |
| Bloco **Nova tarefa** (botão secundário no composer após existir corrida) | `TaskComposer.tsx` | Redundante com “Nova atividade” na sidebar e com o fluxo `composeOnly` / painel de nova operação. |
| Label **Controlos** e fila horizontal de 6 botões | `RuntimeActionsBar.tsx` | Substituídos por fila curta + menu secundário (ver secção 2). |

### Erro de submissão (intake)

O card antigo mostrava `lastError` e “Tentar novamente”. Essa função passou para um **alerta compacto** no próprio `TaskComposer` (borda + botão), sem card dedicado.

---

## 2. Acções do runtime — antes / depois

### Antes

Uma linha com rótulo “Controlos” e botões: Actualizar, Validar integridade, Rebuild observability, Retry, Resume, Cancelar — muitos visíveis mesmo **disabled**, gerando poluição.

### Depois

| Visível no topo | Condição |
|-----------------|----------|
| **Actualizar** (`RefreshCw`) | Apenas se a acção estiver “visível” no modelo de disponibilidade (`available` ou `unsupported` no sentido de não estar bloqueada por contexto vazio). |
| **Cancelar** | Apenas quando `cancelRule` indica **disponível** (job em `running` / `pending`). |
| **⋯** (Mais acções) | Só se existir pelo menos uma entre: Validar integridade, Rebuild, Retry, Resume com `visibilityOk` — ou seja, entrada relevante no menu. |

| No menu “Mais acções” | Conteúdo |
|------------------------|----------|
| Validar integridade | `ShieldCheck` |
| Rebuild observability | `Sparkles` |
| Retry | `RotateCcw` |
| Resume | `Play` |

**Regra de visibilidade:** itens que não passam `visibilityOk(availability)` não são listados — evita Retry/Resume “mortos” no ecrã principal. Dentro do menu, entradas continuam a respeitar `disabled` onde o modelo o exige (ex.: mutation pendente).

**Confirmações:** `RuntimeActionConfirm` mantém-se para acções que exigem confirmação (cancel, retry, resume, etc.).

---

## 3. Motivação UX

- Menos competição visual entre “dashboard técnico” e o fluxo operacional (intake → clarificação → execução).
- Operador foca em **Actualizar**, **Cancelar quando faz sentido** e no ícone **⋯** para operações avançadas ou ainda partialmente não expostas no daemon.
- CTAs duplicados (“Nova tarefa” no meio do ecrã) foram removidos sem retirar a criação de tarefas: sidebar **Nova atividade**, painel **Nova operação** e composer em modo `composeOnly` mantêm-se.

---

## 4. Screenshots

Não geradas automaticamente neste ambiente. **Smoke manual:** abrir Mission Control e confirmar a faixa superior com `[ Actualizar ]` ou `[ Actualizar ] [ Cancelar ]` + `⋯`, sem fila longa de botões desactivados.

---

## 5. Antes / depois (descrição)

- **Antes:** Faixa densa com 6+ botões, muitos disabled; card lateral “Estado intake”.  
- **Depois:** Faixa com 1–3 controlos visíveis; acções técnicas agrupadas em “⋯”; intake sem card lateral; erro de intake em faixa discreta no composer.

---

## 6. Ficheiros alterados

| Ficheiro | Alteração |
|----------|-----------|
| `frontend/components/features/runtime-controls/RuntimeActionsBar.tsx` | Top simplificado; menu `⋯`; filtragem de visibilidade. |
| `frontend/components/features/intake/TaskComposer.tsx` | Removido CTA “Nova tarefa”; alerta de `lastError` + tentar novamente. |
| `frontend/components/features/run-detail/RunViewShell.tsx` | Remoção de `IntakeStateCard`. |
| `frontend/components/features/intake/CreateTaskPanel.tsx` | Remoção de `IntakeStateCard`; grelha condicional com `TaskSubmissionCard`. |
| `frontend/components/features/intake/IntakeStateCard.tsx` | **Eliminado** |
| `docs/mission-control-ux-runtime-refactor-report.md` | Secção 11 com ligação a este relatório |

---

## 7. Validações

- `cd frontend` → `npx tsc --noEmit` — **OK** (2026-05-15).
- Backend e SSE: **sem alterações** nesta tarefa.

---

## 8. Smoke manual sugerido

1. Abrir Mission Control com corrida seleccionada — ver **RuntimeActionsBar** compacta.  
2. Abrir **⋯** e executar Validar integridade / Retry conforme disponibilidade real.  
3. Confirmar que **Cancelar** só aparece com job cancelável.  
4. Iniciar “nova atividade” pela sidebar — composer em modo envio; sem botão “Nova tarefa” no bloco inferior quando já há corrida.  
5. Forçar erro de criação (se possível) — ver mensagem compacta no `TaskComposer` com “Tentar novamente”.

---

## 9. Limitações / próximos passos

- O menu usa padrão botão + overlay (sem Radix Dropdown); suficiente para MVP.  
- Se no futuro **nenhum** item secundário estiver disponível, o botão **⋯** oculta-se por completo — esperado.
