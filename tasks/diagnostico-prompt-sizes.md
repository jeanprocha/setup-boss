# TASK — Diagnóstico prompt-sizes (Setup Boss)

## Descrição

Tarefa **só para medir fluxo LLM** (`prompt-sizes.json`, `metadata.json` com `llm_usage`, inputs do executor/review). Não valida lógica de negócio.

### Contexto

É preciso uma corrida real mínima no repositório **setup-boss** (projeto alvo = `.`) para instrumentar tamanhos de prompt sem alterar código de produção do pipeline.

### Objetivo

Garantir que existe o ficheiro `tmp/setup-boss-diagnostic.md` com um marcador curto e data ISO, **única** alteração relevante na run.

### Escopo (in)

- Criar ou substituir o conteúdo de `tmp/setup-boss-diagnostic.md` no root do projeto alvo (`setup-boss`).
- Texto alvo (ou equivalente): uma linha indicando run de diagnóstico + timestamp em ISO 8601.

### Escopo (out)

- `scripts/`, `core/`, `agents/`, `docs/` — **proibidos** (não tocar).
- Qualquer outra pasta ou ficheiro fora de `tmp/setup-boss-diagnostic.md`.

### Pré-condição (obrigatória)

O executor aplica PATCH só em ficheiros **já existentes**. Antes de `npm run run`:

1. Criar a pasta `tmp` no root do setup-boss (se não existir).
2. Criar `tmp/setup-boss-diagnostic.md` com uma linha inicial (ex.: `# stub`) para o PATCH poder aplicar.

---

## Acceptance Level (OBRIGATÓRIO)

- [x] development
- [ ] staging
- [ ] production

---

## Acceptance Criteria (OBRIGATÓRIO)

- [ ] existe `tmp/setup-boss-diagnostic.md` com conteúdo que inclua a expressão `prompt-sizes` ou `diagnostic` e um timestamp ISO (ex.: `2026-05-05T12:00:00.000Z`)
- [ ] nenhum ficheiro em `scripts/`, `core/`, `agents/` ou `docs/` foi alterado
- [ ] alteração limitada a `tmp/setup-boss-diagnostic.md`
- [ ] executor não retorna `blocked` por caminho fora do permitido
- [ ] review pode aprovar ou reprovar por texto — o objectivo é gerar artefactos; **não** é obrigatório merge em produção

---

## Restrições

- Não pedir build, testes ou CI.
- Não alterar `package.json`, `package-lock`, `.env`, schemas ou prompts do sistema.
- Não adicionar dependências.
- Reversível: apagar `tmp/setup-boss-diagnostic.md` e, se quiser, a pasta `tmp` após o diagnóstico.

---

## Validação esperada

Após a run (com pré-condição cumprida):

- `<projeto>/docs/.IA/outputs/<run-id>/prompt-sizes.json` com entradas por etapa executada (legado: `<projeto>/.IA/outputs/<run-id>/`).
- `metadata.json` com `llm_usage` / `llm_usage_total` coerentes.
- `executor-input.md` e `review-output.json` presentes na pasta da corrida.

## Fora de escopo

- Melhorias de produto, refactors, documentação de utilizador.

## Observações

- Para reverter: remover `tmp/setup-boss-diagnostic.md` (e `tmp/` se ficar vazia).
