# Setup Boss — Information Architecture — Web UI MVP (Fase 5)

Arquitectura de informação **operacional**: entidades, hierarquia, ownership e navegação. Alinhado ao modelo actual de **run** em disco (`docs/.IA/outputs/<run-id>/`, legado `.IA/outputs/`) e índices em `.setup-boss/runs/`.

---

## 1. Entidades principais

### 1.1 Project (Projecto)

- **Definição**: raiz de trabalho no filesystem (workspace alvo do Setup Boss).
- **Ownership**: utilizador local + registo do daemon/registry (quando em uso).
- **Chaves**: `projectRoot`, `projectId` derivado (estável para UI).

### 1.2 Activity (Actividade)

- **Definição**: unidade de **intenção** do operador dentro do projecto (ex.: “esta task / este epic / esta sessão de trabalho”).
- **Nota MVP**: pode mapear 1:1 a um ficheiro de task, branch, ou etiqueta; **evitar** modelagem complexa — preferir convenção + metadados mínimos em disco.

### 1.3 Run (Corrida)

- **Definição**: instância executada (ou em execução) do pipeline com `runId` e pasta de outputs resolvida.
- **Relacionamentos**: pertence a um **Project**; opcionalmente ligada a uma **Activity**; contém **Runtime States**, **Subtasks**, **Artifacts**, **Diagnostics**, **Integrity Reports**.

### 1.4 Subtask

- **Definição**: unidade de trabalho dentro da estratégia/execução (decomposição já suportada pelo runtime).
- **Ownership**: filha de **Run**; estado derivado de artefactos e validadores.

### 1.5 Runtime State

- **Definição**: agregado do estado do motor (fase actual, flags de bloqueio, último evento, contadores).
- **Fonte**: resultados de scripts + ficheiros de estado; **Local Runtime API** como leitura unificada.

### 1.6 Review / Correction / Rollback

- **Definição**: **modos ou fases** do lifecycle com artefactos próprios (ex.: output de review, pedido de correcção, registo de rollback).
- **UI**: cartões e painéis dedicados; não fundir tudo num único “log”.

### 1.7 Diagnostics

- **Definição**: sinais estruturados (warnings, errors, hints) com ligação a ficheiros/linhas conceptuais.
- **Prioridade**: alta na IA operacional.

### 1.8 Artifacts

- **Definição**: ficheiros JSON/Markdown/patches e outputs sob o run output dir.
- **Ownership**: filhos de **Run** (e por vezes de **Subtask** via naming ou manifest).

### 1.9 Integrity Report

- **Definição**: resultado de validações de continuidade / integridade do runtime.
- **UI**: entrada de primeira classe na navegação de run (não só “mais um ficheiro”).

---

## 2. Hierarquia (vista canónica)

```text
Project
 └── Activity (opcional no MVP; recomendado como etiqueta lógica)
      └── Run
           ├── Runtime State (vista agregada)
           ├── Timeline (eventos ordenados)
           ├── Subtasks[]
           ├── Phases: Intake | Clarify | Strategy | Execute | Review | Correction | …
           ├── Artifacts (árvore / manifest)
           ├── Diagnostics
           └── Integrity Reports
```

---

## 3. Ownership e fonte de verdade

| Entidade | Source of truth (MVP) |
|----------|------------------------|
| Run / outputs | Filesystem + `run` index |
| Runtime State | Agregação API a partir de disco + eventos daemon (se activo) |
| Approvals | Ficheiros de clarificação/governação já existentes no modelo |
| UI preferences | Local storage / settings simples (sem multi-user) |

A UI **nunca** assume que o seu estado local substitui o disco; revalida em navegação e após acções.

---

## 4. Relacionamentos chave

- **Project 1—N Runs**: histórico temporal de corridas.
- **Run 1—N Subtasks**: visão de execução paralela/sequencial conforme estratégia.
- **Run 1—N Artifacts**: explorador filtrado por tipo (manifest, patch, logs, observability).
- **Correction N—1 Run**: loops encadeados na mesma corrida ou corridas filhas (documentar no UX como “correction generation”).
- **Rollback 1—1 Run** (lógico): visão de “ponto de restauro” ou operação aplicada.

---

## 5. Navegação principal (MVP)

1. **Selector de projecto** (topo ou sidebar).
2. **Lista de Runs** do projecto (recentes, filtro por estado / fase).
3. **Vista Run** (layout principal — ver `setup-boss-ui-layout-spec.md`):
   - Stream / console de runtime
   - Timeline
   - Contexto (task, critérios, resumo)
   - Explorador de artefactos
4. **Atalhos globais**: Diagnostics agregados do run; Integrity; Aprovações pendentes (HITL).

**Deep links** desejáveis (fase incremental): `/project/:id/run/:runId`, `/project/:id/run/:runId/artifact/:path`.

---

## 6. Estados globais da aplicação (UI shell)

- **Sem projecto seleccionado**: onboarding mínimo (abrir pasta / detectar cwd).
- **Projecto sem runs**: CTAs para intake / documentação.
- **Daemon offline vs online**: badge de conectividade à Local Runtime API (sem cloud).
- **Run activo**: subscrição/polling a eventos; indicador “live”.

---

## 7. Anti-padrões (IA)

- Uma única coluna estilo “chat” como raiz da navegação.
- CRUD de entidades sem ligação a **run** e **filesystem**.
- Esconder **fase** e **estado** atrás de modais genéricos.

---

## Documentos relacionados

- `setup-boss-runtime-ux.md` — decomposição stream vs timeline vs artifacts.
- `setup-boss-component-map.md` — mapeamento para componentes.
- `setup-boss-mvp-ui-roadmap.md` — o que entra primeiro na navegação.

---

## Estado

```text
Discovery — Fase 5 — Information Architecture (documento-base).
```
