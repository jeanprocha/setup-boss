# TASK — Regression pipeline (Setup Boss)

## Objetivo

Smoke test mínimo do pipeline no repositório **setup-boss** (projeto alvo `.`). Única alteração permitida no código do projeto: **`tmp/setup-boss-regression.md`**.

## Escopo (in)

- Criar ou atualizar **`tmp/setup-boss-regression.md`** com uma linha curta que mencione regressão e um timestamp ISO 8601.

## Escopo (out)

- `scripts/`, `core/`, `agents/`, `docs/` — **não tocar**.
- Qualquer outro ficheiro além de **`tmp/setup-boss-regression.md`**.

### Pré-condição

O executor aplica PATCH só em ficheiros **já existentes**. Antes de `npm run run`, criar `tmp/` e um stub mínimo em **`tmp/setup-boss-regression.md`** se ainda não existirem.

---

## Acceptance Level

- [x] development
- [ ] staging
- [ ] production

---

## Acceptance Criteria

- [ ] existe **`tmp/setup-boss-regression.md`** com texto que inclua `regression` (ou equivalente claro) e um timestamp ISO
- [ ] nenhum ficheiro em `scripts/`, `core/`, `agents/` ou `docs/` foi alterado
- [ ] alteração limitada a **`tmp/setup-boss-regression.md`**
