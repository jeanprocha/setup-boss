# Contrato — Estratégia operacional executável (`OperationalExecutableStrategy`)

**Status:** contrato aprovado — Slice 1 (builder) + Slice 2 (runtime/API/DTO) implementados  
**Data:** 2026-05-17  
**Versão do contrato:** `1.0.0`  
**Escopo:** definir o modelo estável entre Strategy Runtime, plano humano aprovado, comentários iterativos, mini-tarefas e execução futura.

---

## 1. Problema atual

### 1.1 O que o backend já produz

O **Strategy Runtime** (`scripts/runtime/strategy-runtime/`) gera, por run, um pacote técnico em `output/<runId>/strategy/`:

| Artefacto | Conteúdo relevante |
|-----------|-------------------|
| `strategy/subtasks/NNN.json` | `title`, `goal`, `scope.files`, `scope.domains`, `dependencies`, `complexity`, `acceptance_criteria`, `ai_mode`, `status` |
| `execution-order.json` | `ordering_mode`, `ordered_subtasks[]` (`position`, `subtask_id`, `title`, `depends_on`), `blocking_subtasks`, `dependency_warnings` |
| `ai-strategy.json` | `recommended_mode`, `rationale`, `cost_profile`, `quality_profile`, `recommended_usage` |
| `complexity-analysis.json` | `scores`, `classification`, `signals` |
| `decomposition.json` | `strategy` (`single` \| `section_based` \| …), `subtask_count`, `rationale` |
| `shared-runtime-context.json` | `context_refs`, `constraints`, `rules`, objetivo global derivado do plano |
| `execution-ready-handoff.json` | agregação para fase de execução |

A decomposição (`decompose-task.js`) **já cria mini-tarefas ricas** antes de persistir em disco.

### 1.2 Onde a informação se perde

```
strategy/subtasks/*.json  (rico)
        │
        ▼
run-strategy.js → mapSubtasks()     →  id, title, order, dependsOn, readiness
        │
        ▼
StrategyBundleDto (frontend)        →  subtasks finas
        │
        ▼
translate-operational-plan.ts       →  OperationalPlanPresentation
operational-plan-humanize.ts        →  macroOrder[], miniTasks { id, title, order }
        │
        ▼
OperationalPlanDocument (UI)        →  resumo narrativo agradável
```

Paralelamente, comentários iterativos (`plan-comment`) geram `OperationalPlanPresentation` versionado (`planVersion` 2, 3, …) com o **mesmo schema fino** — sem regenerar nem versionar estratégia executável.

### 1.3 Sintoma para o operador

O utilizador **aprova um documento humano** (`OperationalPlanPresentation`) que explica bem a atividade, mas **não aprova explicitamente**:

- ordem executável com dependências auditáveis;
- mini-tarefas com objetivo, escopo, risco e critérios por etapa;
- impacto esperado (ficheiros, módulos, riscos visuais/estruturais);
- modo e padrão de execução/validação.

Hoje a aprovação (`approval-state.json`) referencia apenas `plan_ref` + `plan_sha256` do markdown refinado — **não** uma estratégia versionada.

### 1.4 Consequência

A execução futura (`miniActivities`, progresso por etapa, retry, review) não tem um artefacto humano-aprovado estável para mapear 1:1 com o runtime técnico.

---

## 2. Objetivo do contrato

`OperationalExecutableStrategy` (OES) é o **objeto canónico** que representa:

> *Como o Setup Boss vai executar esta atividade, em que ordem, com que mini-tarefas, dependências, riscos e critérios — após o operador validar o plano.*

O contrato resolve:

1. **Separação clara** entre *plano humano* (o quê / porquê) e *estratégia executável* (como / em que ordem).
2. **Projeção sem perda** dos artefactos `strategy/*` para consumo humano e máquina.
3. **Versionamento alinhado** com plano v1/v2/v3 e comentários iterativos.
4. **Handoff determinístico** para `miniActivities` e execução por etapa.
5. **Aprovação explícita** da estratégia (não só do markdown).

O OES **não substitui** `task-plan-refined.md`; complementa-o com dados operacionais estruturados.

---

## 3. Fontes de dados

### 3.1 Mapa de proveniência

| Fonte | Caminho / origem | Papel no OES |
|-------|------------------|--------------|
| Plano refinado | `task-plan-refined.md` | Objetivo global, escopo, passos narrativos, critérios de aceite, riscos textuais → `sourcePlanVersion`, fallbacks de `macroOrder`, `completionCriteria` globais |
| Subtasks técnicas | `strategy/subtasks/NNN.json` | **Fonte primária** de `miniTasks[]` |
| Ordem | `strategy/execution-order.json` | `orderingMode`, `macroOrder` (IDs ordenados), `dependencies` estruturadas |
| Modo IA | `strategy/ai-strategy.json` | `executionPattern`, `validationApproach` (parcial), nível recomendado |
| Complexidade | `strategy/complexity-analysis.json` | `complexity` global, sinais de risco, `expectedImpact` agregado |
| Decomposição | `strategy/decomposition.json` | `executionPattern` (`single`, `section_based`, …), rationale interna |
| Contexto partilhado | `strategy/shared-runtime-context.json` | `constraints`, `rules`, refs cruzadas |
| Aprovação | `approval-state.json` | `approvalState` (decisão, timestamps, hashes) |
| Comentários | `plan-comments/*` + `updatedPlan.presentation` | Dispara **regeneração** de plano + estratégia; não é fonte direta de campos técnicos |
| Respostas clarificação | `clarification-answers.json` | Contexto indireto via regeneração do plano refinado |
| Nível operador | `approval-state.json` → `operator_recommended_mode` | Confirma `recommendedMode` em `ai-strategy` |

### 3.2 Prioridade em conflito

Quando duas fontes divergem:

1. `execution-order.json` vence para **ordem e dependências entre subtasks**.
2. `strategy/subtasks/NNN.json` vence para **conteúdo da mini-task** (objetivo, escopo, critérios).
3. `task-plan-refined.md` vence para **linguagem humana** quando campos técnicos estão vazios (fallback narrativo).
4. Comentário iterativo que altera escopo → **invalida** estratégia anterior → nova corrida do Strategy Runtime.

### 3.3 Identificadores estáveis

| ID | Formato | Notas |
|----|---------|-------|
| `miniTask.id` | `mini-001-{slug}` | Derivado de ordem + título; mapeia `strategy/subtasks/001.json` |
| `strategyVersion` | inteiro ≥ 1 | Alinhado a `planVersion` quando regenerado pelo mesmo evento |
| `runId` | existente | Âncora do output dir |
| `sourcePlanSha256` | hex | Mesmo conceito de `approval-state.json` → `plan_sha256` |

---

## 4. Modelo proposto — `OperationalExecutableStrategy`

### 4.1 Visão geral

```typescript
// Conceitual — implementação futura em TS/JSON Schema
type OperationalExecutableStrategy = {
  version: string;                    // "1.0.0"
  strategyVersion: number;            // 1, 2, 3…
  sourcePlanVersion: number;          // plano humano que originou esta estratégia
  sourcePlanSha256: string | null;
  runId: string;
  generatedAt: string;                // ISO-8601
  supersedesStrategyVersion: number | null;

  orderingMode: "linear" | "parallel" | "staged";
  executionPattern: ExecutionPattern;
  macroOrder: string[];               // IDs de miniTasks na ordem de execução
  validationApproach: ValidationApproach;

  dependencies: ExecutableDependency[];
  expectedImpact: ExpectedImpact;
  complexity: GlobalComplexity;
  risks: StrategyRisk[];

  miniTasks: ExecutableMiniTask[];
  approvalState: StrategyApprovalState;

  /** Rastreio técnico — não mostrar cru na UI */
  provenance: StrategyProvenance;
};
```

### 4.2 Enums e tipos auxiliares

```typescript
type ExecutionPattern =
  | "single_pass"           // uma entrega consolidada
  | "sequential_by_step"    // passos lineares do plano
  | "by_component"          // isolado por componente/domínio
  | "refactor_then_feature" // preparação estrutural antes da feature
  | "incremental_validate"; // validação após cada bloco

type ValidationApproach =
  | "end_only"
  | "per_mini_task"
  | "incremental"
  | "visual_smoke";         // UI: validação visual mínima

type StrategyApprovalState =
  | { status: "draft" }
  | { status: "pending_approval"; strategySha256: string }
  | {
      status: "approved";
      approvedAt: string;
      strategySha256: string;
      planSha256: string;
      operatorRecommendedMode?: "basic" | "standard" | "expert";
    }
  | { status: "superseded"; supersededAt: string; supersededBy: number };
```

### 4.3 `ExecutableMiniTask` (mini-task rica)

```typescript
type ExecutableMiniTask = {
  id: string;                         // "001"
  order: number;                      // posição em macroOrder (1-based)
  title: string;

  objective: string;                  // de subtask.goal
  scope: string;                      // resumo humano do corpo/escopo (não markdown cru)

  affectedFiles: string[];            // de scope.files
  affectedDomains: string[];          // de scope.domains

  dependsOnIds: string[];             // IDs "001" válidos
  complexity: MiniTaskComplexity;
  risk: MiniTaskRisk;

  acceptanceCriteria: string[];       // de acceptance_criteria
  completionCriteria: string[];       // derivado: acceptance + critérios globais aplicáveis
  validationHints: string[];          // ex.: "validar visualmente", "correr testes do módulo X"

  /** Estado técnico — leitura na execução, oculto na aprovação */
  readiness: "not_ready" | "ready" | "blocked";
  blockerLabel: string | null;
};
```

```typescript
type MiniTaskComplexity = {
  level: "low" | "medium" | "high";
  score: number | null;               // estimated_score 0–10, se existir
  explanation: string | null;
};

type MiniTaskRisk = {
  level: "low" | "medium" | "high";
  label: string | null;               // risco principal da etapa
};
```

### 4.4 `ExecutableDependency`

```typescript
type ExecutableDependency = {
  fromId: string;
  toId: string;
  label: string;                        // humanizado: "Dark mode depende do theme provider"
  kind: "blocks" | "requires" | "soft";
};
```

**Origem:** `execution-order.json` → `ordered_subtasks[].depends_on` + `blocking_subtasks`; enriquecimento opcional com títulos das subtasks.

### 4.5 `ExpectedImpact`

```typescript
type ExpectedImpact = {
  affectedFiles: string[];
  affectedComponents: string[];       // inferido: nomes de componentes React, se detectável
  affectedModules: string[];          // domínios/path top-level (de scope.domains)
  structuralRisk: RiskLevel;
  visualRisk: RiskLevel;
  behaviorRisk: RiskLevel;
  summary: string | null;             // parágrafo único para o operador
};

type RiskLevel = "low" | "medium" | "high" | "unknown";
```

**Origem agregada:**

- ficheiros: união de `miniTasks[].affectedFiles` + refs do plano;
- módulos: `scope.domains`;
- riscos: `complexity-analysis.json` scores + sinais + secção «Riscos» do plano;
- `visualRisk` elevado quando plano menciona UI/layout/CSS/componentes visuais.

### 4.6 `GlobalComplexity` e `risks`

```typescript
type GlobalComplexity = {
  level: "low" | "medium" | "high";
  explanation: string | null;
  coordinationComplexity: "low" | "medium" | "high" | null;
};

type StrategyRisk = {
  id: string;
  label: string;
  level: "low" | "medium" | "high";
};
```

### 4.7 `StrategyProvenance` (auditoria)

```typescript
type StrategyProvenance = {
  artifacts: string[];                // paths relativos strategy/*
  decompositionStrategy: string | null;
  warnings: string[];                 // ex. dependency_warnings
  projectionVersion: string;          // versão do algoritmo de projeção
};
```

### 4.8 Persistência (decisões fechadas)

| Artefacto | Caminho |
|-----------|---------|
| OES canónico | `strategy/operational-executable-strategy.json` |
| Snapshot aprovado (futuro) | `strategy/operational-executable-strategy.approved.json` |
| Histórico (futuro) | `strategy/history/operational-executable-strategy-v{N}.json` |

**ID de mini-task / mini-activity:** `mini-{order}-{slug}` (ex.: `mini-001-analisar-estrutura-da-tela`).

**Aprovação (futuro):** um único CTA aprova plano humano + estratégia executável; `approval-state.json` ganhará `strategy_sha256` alinhado ao OES.

**Runs legados:** sem `strategy/subtasks` → builder devolve OES degradado (fallback do plano); **não bloqueia** aprovação nem runtime existente.

### 4.9 Relação com `OperationalPlanPresentation`

| Camada | Público | Granularidade |
|--------|---------|---------------|
| `OperationalPlanPresentation` | Operador — *o quê* | Narrativo, secções de entendimento/escopo |
| `OperationalExecutableStrategy` | Operador + runtime — *como* | Estruturado, versionado, aprovável |
| Projeção UI | Operador | `OperationalPlanDocument` ganha secção **Estratégia de execução** derivada do OES (Slice 3) |

Na aprovação, o operador deve ver **ambos** fundidos num documento coerente, mas o sistema deve persistir **dois artefactos** distintos para não colapsar de novo.

---

## 5. Regras de projeção (técnico → humano)

### 5.1 Princípios

1. **Nunca** mostrar JSON cru, paths internos (`strategy/subtasks/`), nem IDs de fase (`3.4`, `strategy_runtime_initialized`).
2. **Nunca** expor termos de pipeline: `decomposition`, `handoff`, `readiness`, `HITL`, `phase3`.
3. **Sempre** preservar campos obrigatórios da mini-task; se vazio, aplicar fallback explícito (não omitir a secção).
4. IDs de mini-task na UI: opcionalmente ocultos; usar **ordem + título** como âncora visual.
5. Dependências: formato «*Etapa B* depende de *Etapa A*» — não `001 → 002`.

### 5.2 Tabela de projeção por campo

| Campo OES | Fonte primária | Regra humana | Fallback |
|-----------|----------------|--------------|----------|
| `macroOrder` | `execution-order.ordered_subtasks` | Lista numerada de títulos | Passos de `## Passos` no plano refinado |
| `orderingMode` | `execution-order.ordering_mode` | «Execução sequencial» / «Por etapas paralelas» / «Em fases» | `linear` |
| `executionPattern` | `decomposition.strategy` + `ai-strategy` | Frase única: padrão reconhecível | `sequential_by_step` |
| `validationApproach` | subtask validação + plano | «Validação incremental» etc. | `per_mini_task` se >1 mini-task, senão `end_only` |
| `miniTask.objective` | `subtask.goal` | Uma frase direta | Primeira linha do `title` expandida |
| `miniTask.scope` | corpo da secção / `scope` | 2–4 bullets humanos | «Conforme descrito no plano aprovado.» |
| `affectedFiles` | `scope.files` | Lista colapsável (máx. 8 visíveis + «+N») | omitir secção se vazia |
| `acceptanceCriteria` | `acceptance_criteria` | Bullets | Critério global do plano |
| `complexity.level` | `complexity.estimated_score` | Baixa / Média / Alta | `medium` |
| `risk.level` | score + palavras-chave do plano | Baixo / Médio / Alto | `medium` |
| `expectedImpact.summary` | agregação | Um parágrafo | null — secção omitida |

### 5.3 Filtros de texto (reutilizar política existente)

Aplicar as mesmas regras de `operational-plan-humanize.ts`:

- remover linhas internas / metadados;
- sanitizar parágrafos;
- não duplicar título da mini-task no objetivo.

### 5.4 Modo «direct» vs «motion divided»

| Condição | `miniTasks.length` | Apresentação |
|----------|---------------------|--------------|
| 0–1 tarefas efectivas | 0–1 | Execução directa — mostrar `executionPattern` + `macroOrder` sem cards |
| ≥ 2 tarefas | ≥ 2 | Cards por mini-task com todos os campos ricos |

Alinhar threshold com `MINI_TASK_DIVIDE_THRESHOLD` actual (hoje: 2).

---

## 6. Regras para comentários iterativos

### 6.1 Fluxo obrigatório

```mermaid
flowchart LR
  C[Comentário no plano] --> P[Plano vN+1]
  P --> S[Strategy Runtime]
  S --> E[Estratégia vN+1]
  E --> T[Timeline plano + estratégia]
  T --> A[Aprovação]
```

1. Comentário classificado como alteração de escopo/critérios → gera `updatedPlan` com `planVersion++`.
2. **Obrigatório:** invalidar estratégia corrente (`approvalState.status = superseded` ou equivalente em draft).
3. Re-executar Strategy Runtime sobre o novo `task-plan-refined.md` (ou snapshot derivado).
4. Produzir `OperationalExecutableStrategy` com `strategyVersion` alinhado a `planVersion` **do mesmo evento**.
5. Versões anteriores ficam em **histórico** (timeline); apenas a par `(planVersion, strategyVersion)` mais recente é **aprovável**.

### 6.2 Invariantes

| Invariante | Descrição |
|------------|-----------|
| I1 | `sourcePlanVersion === strategyVersion` quando gerados no mesmo pipeline |
| I2 | Não aprovar estratégia se `sourcePlanSha256` ≠ hash do plano activo |
| I3 | Comentário `no_change` não regenera estratégia |
| I4 | Plano histórico na timeline é só leitura; estratégia associada também |
| I5 | Após aprovação, comentário novo **reabre** planejamento — aprovação anterior fica `superseded` |

### 6.3 O que o operador vê na timeline

- **Plano v1** + estratégia v1 (compacto, histórico)
- **Plano v2** + estratégia v2 (activo para aprovação)

Label sugerido: «Estratégia de execução (versão 2)» — nunca «decomposition» ou «subtask 003».

---

## 7. Relação com execução futura

### 7.1 Mapeamento OES → `miniActivities`

| OES | `MiniActivityRecord` (Fase C) |
|-----|-------------------------------|
| `miniTask.id` | `miniActivityId` (prefixo run-scoped na materialização) |
| `order` | `order` |
| `title` | `title` |
| `objective` + `scope` | `description` (markdown curto estruturado) |
| `dependsOnIds` | `dependsOnMiniActivityIds` |
| `targetProject` (futuro) | `targetProjectId` do workspace |
| — | `status` inicial: `pending` ou `ready` conforme deps |

Materialização: função `materializeMiniActivitiesFromOES(oes, workspaceCtx)` — **Slice 5**.

### 7.2 Execução por etapa

- Runner executa **uma mini-task de cada vez** respeitando `macroOrder` e `dependsOnIds`.
- Estado por mini-task alimenta progresso real na UI (% = completed / total).
- **Retry:** só a mini-task falhada; deps satisfeitas não reexecutam.
- **Review:** gate HITL opcional por mini-task usando `acceptanceCriteria` + `validationHints`.

### 7.3 Timeline de execução

Eventos correlacionados:

- `strategy_version`
- `mini_activity_id`
- `mini_activity_status`

### 7.4 Pré-requisito de execução

`validateExecuteReadiness` deve exigir:

1. `approval-state.json` → `approved`
2. `operational-executable-strategy.approved.json` presente e hash consistente
3. `strategy-readiness.json` → ready (runtime técnico intacto)

---

## 8. Compatibilidade incremental (slices)

| Slice | Entrega | Código tocado (previsto) |
|-------|---------|--------------------------|
| **1** | Schema TS + `operational-executable-strategy.json` + projeção pura + testes | `core/project-operational-executable-strategy.js`, testes, sem UI |
| **2** | Enriquecer `mapSubtasks` / `StrategyBundleDto` com campos OES | `run-strategy.js`, `strategy-types.ts` |
| **3** | UI: secção estratégia em `OperationalPlanDocument` | componentes planning |
| **4** | Comentário → regen estratégia + timeline | `plan-comment/*`, hooks |
| **5** | Handoff → `miniActivities` | `validate-mini-activity.js`, execution runtime |

Cada slice deve manter **fallback** para runs antigos sem OES (degradar para apresentação actual).

---

## 9. Critérios de aceite do contrato

O contrato considera-se **pronto para implementação** quando:

- [x] Mapeia fontes reais (`strategy/subtasks`, `execution-order`, `ai-strategy`, plano refinado, aprovação, comentários).
- [x] Define schema estável `OperationalExecutableStrategy` + `ExecutableMiniTask` + `ExpectedImpact`.
- [x] Define regras de projeção e fallback campo a campo.
- [x] Define versionamento plano vN ↔ estratégia vN e histórico.
- [x] Define relação com `miniActivities` e execução futura.
- [x] Define slices incrementais sem big-bang.

**Pendente até implementação:** JSON Schema formal, exemplos `.json` golden, testes de conformidade.

---

## 10. Relatório final — decisões, riscos, próximos passos

### 10.1 Decisões fechadas

| # | Decisão |
|---|---------|
| D1 | Introduzir artefacto distinto `OperationalExecutableStrategy`; não expandir só `OperationalPlanPresentation`. |
| D2 | Fonte primária de mini-tasks = `strategy/subtasks/NNN.json`, não heurística de títulos. |
| D3 | `strategyVersion` alinha-se a `planVersion` quando gerados no mesmo evento. |
| D4 | Aprovação humana deve incluir hash da estratégia (`strategySha256`), não só do plano markdown. |
| D5 | Comentário com impacto regenera estratégia; versão anterior vira histórico não-aprovável. |
| D6 | Projeção UI reutiliza políticas de humanize existentes; proibição de termos internos. |
| D7 | Implementação em 5 slices; Slice 1 sem UI. |

### 10.2 Decisões fechadas (2026-05-17)

| # | Decisão |
|---|---------|
| O1 | Path canónico: `strategy/operational-executable-strategy.json` |
| O2 | ID de mini-task/activity: `mini-{order}-{slug}` |
| O3 | `affectedComponents`: heurística por path + nome de ficheiro + domínio; fallback `[]` |
| O4 | `executionPattern` derivado de `decomposition.strategy` (+ fallbacks seguros) |
| O5 | Aprovação: **um CTA único** (plano + estratégia); runs legados degradam sem bloquear |

### 10.3 Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Regenerar estratégia em cada comentário é lento | Média | Médio | Só comentários `scope`/`criteria`; cache se plano hash igual |
| Decomposição heurística fraca (secções do MD) | Alta | Alto | Slice futuro: LLM de decompose opcional; contrato tolera campos fallback |
| Duplicação plano vs estratégia confunde UI | Média | Médio | Secção visual única «Como vamos executar» projetada do OES |
| Runs legados sem OES | Alta | Baixo | Degradar para `OperationalPlanPresentation` actual |
| Drift entre OES aprovado e runtime re-executado | Baixa | Alto | Hash + bloquear execução se strategy dir mudou pós-aprovação |

### 10.4 Próximos passos

1. **Revisão humana** deste documento (ajustar O1–O5).
2. **Slice 1:** implementar `core/build-operational-executable-strategy.js` + testes com fixtures reais de `strategy/subtasks`.
3. **Golden files:** 2–3 exemplos em `docs/fixtures/operational-executable-strategy/`.
4. **Atualizar** `approval-state.json` schema (v1.1) com `strategy_sha256` — design only até Slice 4.
5. Só então: enriquecer DTOs (Slice 2) e UI (Slice 3).

---

## Apêndice A — Exemplo conceptual (reduzido)

```json
{
  "version": "1.0.0",
  "strategyVersion": 1,
  "sourcePlanVersion": 1,
  "sourcePlanSha256": "abc…",
  "runId": "20260517-215607-…",
  "generatedAt": "2026-05-17T22:00:00.000Z",
  "orderingMode": "linear",
  "executionPattern": "sequential_by_step",
  "macroOrder": ["001", "002", "003"],
  "validationApproach": "incremental",
  "miniTasks": [
    {
      "id": "001",
      "order": 1,
      "title": "Analisar estrutura da tela de integração",
      "objective": "Mapear componentes existentes antes de criar o chat.",
      "scope": "Rever layout, providers e pontos de extensão.",
      "affectedFiles": ["frontend/app/integracoes/page.tsx"],
      "affectedDomains": ["frontend"],
      "dependsOnIds": [],
      "complexity": { "level": "low", "score": 3, "explanation": null },
      "risk": { "level": "low", "label": null },
      "acceptanceCriteria": ["Mapa de componentes documentado no plano."],
      "completionCriteria": ["Estrutura actual compreendida sem alterações de código."],
      "validationHints": ["Revisão visual da página."],
      "readiness": "ready",
      "blockerLabel": null
    }
  ],
  "approvalState": { "status": "draft" }
}
```

---

## Apêndice B — Referências no repositório

| Área | Ficheiro |
|------|----------|
| Decomposição rica | `scripts/runtime/strategy-runtime/decompose-task.js` |
| Ordem | `scripts/runtime/strategy-runtime/build-execution-order.js` |
| API strategy | `scripts/daemon/lib/run-strategy.js` |
| Plano humano | `frontend/lib/runtime/operational/operational-plan-types.ts` |
| Humanize | `frontend/lib/runtime/operational/operational-plan-humanize.ts` |
| Timeline plano | `frontend/lib/runtime/operational/plan-active-version.ts` |
| Mini-activities | `core/validate-mini-activity.js` |
| Aprovação | `scripts/runtime/clarification/approval.js` |
