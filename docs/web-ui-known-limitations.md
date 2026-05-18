# Web UI MVP — Limitações Conhecidas

Explicitamente **fora** do MVP Web UI actual (Fase 5.x).

---

## Runtime / execução

| Limitação | Notas |
|-----------|-------|
| Sem DAG visual | Ordem linear em `execution-order.json` |
| Sem execução paralela de subtasks | Uma subtask activa por vez (MVP) |
| Sem orchestration distribuída | Um daemon local por máquina |
| Sem cloud runtime | Bind `127.0.0.1` apenas |
| Sem multi-user / colaboração | Sem locks UI multi-operador |

---

## UI

| Limitação | Notas |
|-----------|-------|
| Mission Shell pode usar `selectedRunId` mock vs `runId` real | Correlacionar em fase futura |
| Reconciliar stale só por sync passivo | Sem botão “reconciliar” (POST pendente) |
| Polling ainda necessário com SSE | Fallback e read models pesados |
| Terminal / editor | Integração xterm básica, não PTY cloud |

---

## Recovery

- Falso **stale** possível se job acabou e sync ainda não correu (mitigado por sync periódico).
- Scan de índices limitado (cap ~80 runs no boot).
- `recovery_status` pode persistir após fecho manual da run.

---

## Testes

- Smoke E2E usa `skipLlm: true` — não valida qualidade LLM.
- Execução via daemon no smoke depende de strategy/execution determinísticos (sem rede).

---

## Roadmap futuro (não comprometido)

1. POST recovery reconcile + dashboard runs activas no sidebar
2. DAG / paralelismo (Fase enterprise)
3. Cloud runtime + multi-user
4. Collaborative HITL (locks, presença)

Ver `docs/setup-boss-roadmap.md` para priorização global.
