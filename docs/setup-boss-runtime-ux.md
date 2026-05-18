# Setup Boss — Runtime UX — Web UI MVP (Fase 5)

Como o **motor** aparece na interface: streams, timelines, artefactos e prioridade visual. Complementa `setup-boss-ui-layout-spec.md` (onde) com **comportamento semântico** (o quê).

---

## 1. Princípios

1. **Estado antes de texto**: badges, ícones e cores semânticas levam; parágrafos explicativos são expansíveis.
2. **Um foco de atenção**: “O que está a bloquear o run?” deve ser respondido em **&lt; 3 segundos** de olhar para o ecrã.
3. **Determinismo visível**: mostrar **de onde** veio o estado (ficheiro, validador, último evento).
4. **HITL explícito**: filas de aprovação e formulários curtos nunca escondidos atrás de “ver mais” por defeito quando pendentes.

---

## 2. Execution stream (stream principal)

**Papel**: narrativa **cronológica recente** do que o runtime fez (comandos concluídos, transições de fase, writes importantes).

### O que entra no stream

- Transições de fase (intake → clarify → …).
- Início/fim de subtask com ID curto e outcome (`ok`, `failed`, `skipped`).
- Eventos de observabilidade de alto sinal (tokens, limites, warnings de política).
- Pedidos de input humano (gate) com CTA inline.

### O que **não** entra (por defeito)

- Conteúdo integral de prompts (link para artifact viewer).
- Dump de JSON grande (preview + “abrir artefacto”).
- Ruído de polling interno da UI.

### Colapsável

- Execuções repetitivas bem-sucedidas do mesmo tipo (agrupar “N patches aplicados” com expand).
- Logs verbosos de nível `debug` (atrás de “nível de detalhe”).

### Prioridade visual

1. **Blocked / failed / waiting approval**
2. **Retrying / correcting**
3. **Running**
4. **Success / recovered** (compacto)

---

## 3. Timeline

**Papel**: visão **densa e escaneável** de todo o lifecycle do run (eixo temporal).

- Nós: fase, subtask, review, correction, rollback, integrity.
- Arestas: ordem causal quando inferível dos artefactos.
- **Zoom**: dia → hora → evento (MVP: lista vertical com marcações temporais; DAG visual **fora** do MVP).

### Stream vs timeline

| Aspeto | Stream | Timeline |
|--------|--------|----------|
| Ordem | Mais recente no topo ou fundo (fixar uma convenção) | Ordem causal completa |
| Detalhe | Mensagens curtas | Marcadores de fase |
| Uso | “O que acabou de acontecer?” | “O que já passou / o que falta?” |

---

## 4. Runtime events

- **Fonte**: Local Runtime API + ficheiros de eventos (ex.: camada existente em `scripts/daemon/lib/runtime-events.js` quando daemon activo).
- **Visual**: linha com `timestamp`, `type`, `severity`, `correlationId` (run/subtask).
- **Acções**: clicar abre painel de detalhe ou artefacto ligado.

---

## 5. Diagnostics, warnings e retries

- **Diagnostics**: painel dedicado; agrupar por `code` quando possível.
- **Warnings**: faixa amarela **não** modal; não bloquear navegação salvo quando política exigir.
- **Retries**: estado `retrying` com contador e motivo; botão “abort retry” só se suportado pelo runtime (fase incremental).

---

## 6. Rollback e recovery

- **Rollback**: entrada de timeline + cartão com **escopo** (o que foi revertido / tentado) e link ao artefacto de prova.
- **Recovery**: distinguir **recovered** (sistema estabilizou) de **success** de negócio (tarefa concluída); mensagens diferentes.

---

## 7. Correction loops e review states

- **Review**: estados `pending`, `approved`, `rejected`, `needs_info` (ajustar labels ao contrato real do repo).
- **Correction**: mostrar **geração** do loop (1ª, 2ª…) e diff resumido; deep dive no ArtifactViewer.
- Evitar misturar mensagem de chat com estado de review — usar **ReviewCard** (ver component map).

---

## 8. Approval flow (HITL)

1. **Banner global** quando existir aprovação pendente no run activo.
2. **Card** no stream no momento do pedido.
3. **Painel lateral** com formulário mínimo (sim/não, comentário curto, anexos se existirem no modelo).

Registar na UI que a decisão escreve no disco (transparência operacional).

---

## 9. O que vira artifact vs log

| Tipo | Destino principal |
|------|---------------------|
| JSON de manifest / handoff | ArtifactViewer |
| Patch / diff | ArtifactViewer + resumo na timeline |
| `run-log` / auditoria longa | Secção “Logs” ou consola com download |
| Métricas LLM / observability | Painel Observability + ficheiro |
| Erro de validação | Diagnostics + link ao schema/regra |

---

## 10. Logs (consola)

- **Papel**: saída bruta ou semi-estruturada para power users.
- **Default**: colapsado se run saudável; expandido automaticamente em `failed` ou `blocked`.

---

## 11. Prioridade visual (resumo)

1. Estado global do run (barra ou hero compacto).
2. Pending approvals + blocked reasons.
3. Timeline (fases).
4. Stream (eventos recentes).
5. Artifacts explorer.
6. Consola de logs.

---

## Documentos relacionados

- `setup-boss-design-system.md` — cores e badges por estado.
- `setup-boss-information-architecture.md` — entidades.
- `setup-boss-mvp-ui-roadmap.md` — ordem de entrega destes blocos.

---

## Estado

```text
Discovery — Fase 5 — Runtime UX (documento-base).
```
