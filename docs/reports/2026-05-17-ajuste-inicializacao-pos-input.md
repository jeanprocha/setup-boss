# Ajuste UX — Inicialização pós-input

**Data:** 2026-05-17  
**Escopo:** Fase operacional **Inicialização** (Mission Control)  
**Tipo:** Implementação front — sem alteração estrutural do backend

---

## Comportamento antigo

1. Ao abrir **nova atividade** (`newActivityFlow` + projeto seleccionado), a UI disparava de imediato:
   - `GET /projects/:id/governance` (validação `.IA`)
   - Derivação de `iaValidated` / estados `validating_ia` no painel
   - Checklist operacional com passos técnicos visíveis antes de qualquer input
   - `logGovernanceWarningToRuntime` quando governança retornava `warning`
2. O utilizador via spinners/copy do tipo “A validar base .IA” **antes** de descrever a atividade.
3. O trigger estava em três pontos paralelos:
   - `useOrchestration` → `needsProjectGovernance = composeOnly || runInIntake`
   - `InitializationPhasePanel` → `useProjectGovernance` se `composeOnly`
   - `TaskComposer` → `useProjectGovernance` se `composeOnly`

---

## Comportamento novo

### Antes do submit (`intakeUiPhase === "idle"` + `composeOnly`)

| Aspecto | Comportamento |
|---------|----------------|
| Título de estado | **Descreva a atividade** |
| Campos | descrição, prioridade, tags (`TaskComposer`) |
| Validação `.IA` | **Não** — nenhum `GET /governance` |
| Checklist / rail | **Oculto** |
| Logs operacionais | **Não** — sem `logGovernanceWarningToRuntime` |
| Runtime da corrida | **Não** — sem `runId`, sem eventos de intake |

### Após submit (`creating_run` / corrida criada / intake)

1. `GET /projects/:id/governance` activa (mesma validação de antes).
2. Checklist pós-submit:
   - A validar base .IA
   - A carregar contexto do projeto
   - A analisar projeto (`ia_found`)
   - A gerar SPEC inicial
   - SPEC inicial pronta
3. `POST /runs` → intake no daemon → SPEC inicial como antes.
4. Erros de `.IA` (`ia_missing`) só aparecem **depois** do envio.

---

## Arquivos alterados

| Ficheiro | Alteração |
|----------|-----------|
| `frontend/lib/runtime/intake/compose-governance-gate.ts` | **Novo** — gate `composeAwaitingInitialSubmit` / `projectGovernanceEnabledForIntake` |
| `frontend/lib/runtime/intake/compose-governance-gate.test.ts` | **Novo** — testes do gate |
| `frontend/hooks/use-orchestration.ts` | Governança só após submit ou com corrida em intake |
| `frontend/hooks/use-run-operational-ux.ts` | Mesmo gate no hook alternativo |
| `frontend/components/features/initialization/InitializationPhasePanel.tsx` | UI limpa pré-submit; rail pós-submit; copy “Descreva a atividade” |
| `frontend/components/features/intake/TaskComposer.tsx` | Governança e logs só após submit |
| `frontend/lib/runtime/operational/initialization-operational-state.ts` | `preSubmitCompose`; label `ia_found` → “A analisar projeto” |
| `frontend/lib/runtime/operational/initialization-operational-state.test.ts` | Caso `preSubmitCompose` |

**Backend:** sem alterações.

---

## Onde o trigger foi movido

```
Antes:
  mount (composeOnly) → useProjectGovernance(projectId) → GET /governance

Depois:
  submit → intakeUiPhase !== "idle"
         → projectGovernanceEnabledForIntake(...) === true
         → useProjectGovernance(projectId) → GET /governance
```

Fonte única do critério: `compose-governance-gate.ts`.

Consumidores:

- `useOrchestration` (contrato `operationalUx`)
- `InitializationPhasePanel` (estado visual + rail)
- `TaskComposer` (card bloqueado + logs de aviso)
- `useRunOperationalUx` (hook auxiliar)

---

## Validação manual

| Critério | Como verificar |
|----------|----------------|
| Tela inicial sem runtime | Abrir nova atividade; DevTools → **sem** `GET .../governance` até clicar Iniciar |
| Sem artifact antes do submit | `.setup-boss/runs/` — nenhum ficheiro novo antes do POST |
| Submit inicia intake | Após enviar → `POST /runs`, corrida seleccionada, eventos `knowledge_bootstrap_*` |
| SPEC gerada | Painel passa a `spec_ready` + `InitialSpecBlock` |
| Logs só após envio | Observabilidade / diagnósticos sem avisos `.IA` na idle |

---

## Impactos no runtime / UI

| Área | Impacto |
|------|---------|
| **API** | Menos chamadas `GET /governance` em visitas idle à tela de nova atividade |
| **Daemon** | Intake continua no `POST /runs`; validação `.IA` no servidor inalterada |
| **Contrato UX** | `iaValidated` permanece `null` até governança ser pedida; `preSubmitCompose` força UI `awaiting_activity` |
| **Erros `.IA`** | Bloqueio visual (`ia_missing`) apenas pós-submit; erros de pré-run no `TaskComposer` via resposta `POST /runs` |
| **Timeline embutida** | Slot `task_intake` com composer limpo; rail técnico só após busy |

---

## Notas

- Validações existentes da `.IA` **não foram removidas** — apenas adiadas no cliente até `intakeUiPhase !== "idle"`.
- Durante `creating_run` (antes de `runId` persistir), governança já pode correr em paralelo ao `POST /runs`.
- `GovernanceStatusCard` em modo bloqueado continua a fazer fetch próprio quando `ia_missing` pós-submit (comportamento esperado).
