# Guia: runtime local (daemon + frontend)

**Âmbito:** fluxo **local** ponta a ponta (sem cloud, sem multi-tenant). O Mission Control liga-se ao daemon via proxy Next em `/api/runtime`.

---

## Pré-requisitos

- Node.js (versão suportada pelo repositório).
- Repositório `setup-boss` clonado na máquina.

---

## 1. Subir o daemon

Na raiz do repositório:

```powershell
npm run setup-boss -- daemon start
```

- **Foreground (debug):** `npm run setup-boss -- daemon start --foreground`
- **Estado:** `npm run setup-boss -- daemon status`
- **Parar:** `npm run setup-boss -- daemon stop`

O **Runtime API** escuta em `http://127.0.0.1:3210` por defeito (`SETUP_BOSS_RUNTIME_API_PORT` para alterar).

Verificar:

```powershell
curl http://127.0.0.1:3210/health
```

Resposta esperada: JSON com `ok: true` e `daemon: "running"`.

**Diagnóstico:** `npm run setup-boss -- doctor`

---

## 2. Subir o frontend

```powershell
cd frontend
npm install
npm run dev
```

Abrir **http://localhost:3000** (ou a porta que o Next indicar).

O browser **não** fala directamente com `3210`; o Next reencaminha para `SETUP_BOSS_RUNTIME_API_URL` ou `http://127.0.0.1:3210` (ver `frontend/lib/api/runtime-config.ts`).

---

## 3. Testar o fluxo ponta a ponta

1. Confirmar indicador **live** na barra lateral (runtime alcancável).
2. **Adicionar repositório Git** ou pasta (modal) — regista projecto no daemon.
3. Seleccionar o **projecto** na sidebar.
4. **Nova atividade** → descrever tarefa (**mínimo ~12 caracteres**) → submeter (cria corrida no runtime).
5. Acompanhar **passos** (intake, milestones) e a secção **Timeline e feed do runtime** (eventos + polling/SSE).
6. Avançar **clarificação / estratégia / execução** conforme o estado da corrida (botões nos painéis).
7. **Recarregar a página** — projecto e última atividade seleccionada devem ser **restaurados** (persistência local via `localStorage`: chave `setup-boss-mission-shell`).

Artefactos e corridas continuam no disco sob `.setup-boss/` do **projecto** e outputs do runtime conforme configurado no daemon.

---

## 4. Limitações actuais (MVP local)

- Uma instalação **single-user**; sem OAuth nem Git integrado “por conta” na UI além do fluxo actual (URL / registo).
- **LLM:** partes do pipeline podem exigir chaves/API e modo `skipLlm` conforme implementação; erros aparecem no intake e no feed.
- **Fila/workers:** comportamento real depende do daemon (jobs, recuperação); não há orquestração distribuída.
- Persistência da **selecção** na UI é **só no browser** (localStorage), não substitui a fonte de verdade das corridas na fila do daemon.

---

## 5. Referências rápidas

| Peça | Local típico |
|------|----------------|
| Runtime API | `scripts/daemon/runtime-api.js` |
| Eventos runtime | `.setup-boss/daemon/events.jsonl` |
| PID daemon | `.setup-boss/daemon/pid` |
| Proxy Next | `frontend/app/api/runtime/[[...segments]]/route.ts` |
| Fluxo Git (prepare → commit → push/PR) | [`docs/git-workflow-operational-runbook.md`](./git-workflow-operational-runbook.md) |

Para fim de falhas de permissões ou locks, ver `npm run setup-boss -- doctor recover` (comando documentado no CLI).
