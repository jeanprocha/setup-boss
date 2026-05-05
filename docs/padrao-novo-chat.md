# Setup Boss — Padrão de novo chat

## Contexto

Continuação do desenvolvimento do **Setup Boss**. O modelo **não** tem histórico anterior além do que for colado nesta conversa.

---

## Ficheiros iniciais sugeridos

O utilizador pode enviar:

- `docs/ai-session-bootstrap.md`
- `docs/setup-boss-roadmap.md`
- `docs/setup-boss-vision.md`
- `docs/README.md`

Objetivo: alinhar com o **comportamento real** do repo (pipeline com **run-context**, **PATCH**, métricas LLM).

---

## Objetivo deste início

Só **carregar contexto**. Sem implementação até haver uma **atividade** explícita.

---

## Regras de trabalho

- **Não assumir** ficheiros ou trechos de código não fornecidos.
- **Não inventar** comportamento não presente nos scripts/`core`/agents.
- O sistema já **não depende** de colar task/scan/architect completos em todas as etapa — **`run-context.json`** é a referência compacta quando válido.
- O fluxo é **mais determinístico** nas fronteiras de segurança (paths, lista de ficheiros, PATCH único por `search`).

Quando existir atividade que exija alteração:

1. Preferir ler o ficheiro atual no workspace ou pedir o path exato.
2. Para docs `.md`, devolver o **ficheiro completo** atualizado quando solicitado.

---

## Restrições

- Sem pseudocódigo quando o pedido for implementação real.
- Sem plano longo antes da atividade estar definida.

---

## Primeira resposta esperada

Resposta curta com:

- entendimento do sistema (orquestração + custo + PATCH + run-context)
- estado atual (v2.0.0 / Fase 3 conforme docs)
- pergunta: **«Qual atividade vamos executar agora?»**

Sem pedir código desnecessário no primeiro turno.
