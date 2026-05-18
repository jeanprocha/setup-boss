# Setup Boss — Visão de produto — Web UI MVP (Fase 5)

Documento-base de **posicionamento** e **modelo mental** da interface. Não substitui a visão de evolução do repositório; **especializa** a Fase 5 como camada visual sobre o runtime já existente.

---

## 1. O que o Setup Boss **é**

- **Plataforma operacional de execução assistida por IA**: orquestra tarefas com artefactos, estados e limites determinísticos.
- **AI Mission Control**: o operador supervisiona corridas, aprova gates, lê diagnósticos e actua sobre o lifecycle — não “conversa” com o sistema como fim em si.
- **Runtime-first**: a verdade operacional continua em ficheiros e índices (`docs/.IA/outputs/<run-id>/`, `.setup-boss/runs/`, manifests); a UI **reflecte** e **não substitui** essa fonte de verdade no MVP.
- **Motor de lifecycle + observabilidade**: intake, clarificação, estratégia, execução, review, correcção, rollback, integridade e estabilização são **primeira classe** na experiência, não menus escondidos.

---

## 2. O que o Setup Boss **não** é

- Não é **chat genérico** nem substituto de ChatGPT.
- Não é **IDE**: não compete com edição de código, refactors em massa nem depuração de linha a linha como foco principal.
- Não é **copiloto inline** no editor.
- Não é **dashboard CRUD** de entidades sem narrativa operacional.
- Não é **multi-tenant / cloud runtime** no âmbito deste MVP (ver roadmap MVP).

---

## 3. Positioning

| Dimensão | Setup Boss (Fase 5) |
|----------|---------------------|
| Valor central | Transparência de execução, gates humanos, recuperação e integridade |
| Unidade de trabalho | **Run** e **subtask** com artefactos verificáveis |
| Interacção dominante | Navegação operacional + stream de runtime + painéis de contexto |
| IA | Assistência e orquestração **dentro de contractos** (deterministic-first) |

---

## 4. Modelo mental do operador

O operador pensa em ciclos:

1. **Seleccionar contexto** (projecto / actividade).
2. **Disparar ou retomar** uma corrida (run).
3. **Ler o estado do runtime** (a correr, à espera de aprovação, bloqueado, a corrigir, rollback, recuperado).
4. **Inspeccionar artefactos e diagnósticos** quando algo falha ou exige decisão.
5. **Actuar** (aprovar, corrigir, retry, rollback) com **efeitos auditáveis** no disco.

O operador **não** pensa primeiro em “mensagens”; pensa em **operações e estados**.

---

## 5. AI Mission Control e Runtime-first UX

- **Mission Control**: visão unificada de saúde da corrida, fila/daemon (quando activo), eventos e próximos passos obrigatórios (HITL).
- **Runtime-first**: qualquer ecrã prioritiza **o que o motor está a fazer agora** e **o que falta para fechar**; texto explicativo é secundário face a estado + artefactos.

---

## 6. Orchestration mindset e operational AI

- **Orquestração**: a UI comunica dependências entre fases (intake → clarify → strategy → execute → …) como **pipeline operacional**, não como conversa livre.
- **Operational AI**: a IA produz e transforma artefactos **com validação**; a UI destaca **pass / fail / warning** e ligações aos ficheiros gerados.

---

## 7. Execution visibility

Transparência mínima exigida no MVP:

- O que foi planeado vs o que foi executado.
- Onde está o bloqueio (validação, review gate, política, disco).
- O que mudou no projecto (PATCH / artefactos) e onde ler o diff lógico (review/correction).

---

## 8. Diferenças face a produtos conhecidos

### Cursor

- Cursor optimiza **edição e agente no repositório**; Setup Boss optimiza **corrida estruturada com lifecycle, artefactos e gates** no modelo Setup Boss.
- A UI do Setup Boss não precisa de ser um editor; prioriza **run timeline + observability + approvals**.

### ChatGPT

- ChatGPT é **conversa stateless por defeito**; Setup Boss é **estado persistido + run index + outputs** com contractos de pipeline.
- Respostas genéricas vs **artefactos nomeados e validáveis**.

### IDE tradicional

- IDE: build, debug, símbolos; Setup Boss: **orquestração de tarefa**, integridade, rollback, relatórios de corrida.

### Copilotos

- Copilotos sugerem código **no momento do typing**; Setup Boss coordena **fases e decisões humanas** com trilho de auditoria no filesystem.

---

## 9. Princípios não negociáveis (Fase 5)

- **Filesystem como source-of-truth** no MVP.
- **Deterministic-first**: UI reflecte validações e estados calculados em código, não “opinião” da UI.
- **Human-in-the-loop**: aprovações e decisões explícitas são parte do fluxo principal, não excepção.
- **Observability e lifecycle visibility** com prioridade sobre “bonito” ou “conversacional”.

---

## 10. Relação com documentos irmãos

- Estrutura de entidades e navegação: `setup-boss-information-architecture.md`.
- Comportamento visual do motor: `setup-boss-runtime-ux.md`.
- Layout: `setup-boss-ui-layout-spec.md`.
- Entregas e exclusões: `setup-boss-mvp-ui-roadmap.md`.

---

## Estado

```text
Discovery — Fase 5 — Web UI MVP — visão de produto (documento-base).
```
