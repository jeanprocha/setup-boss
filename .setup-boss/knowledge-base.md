## Decision / Update

### Context

A run exigiu pré-criação do stub em `tmp/setup-boss-diagnostic.md` antes do patch, com escopo estritamente limitado a esse ficheiro.

### Decision

A alteração válida deve ficar confinada a `tmp/setup-boss-diagnostic.md`, sem tocar `scripts/`, `core/`, `agents/` ou `docs/`.

### Reason

O executor bloqueia patches fora de ficheiros já existentes e a task depende dessa pré-condição para evitar `blocked`.

### Impact

O fluxo passa a ser previsível e auditável, com risco reduzido de alterações laterais fora do ficheiro-alvo.

### Validation

Verifica-se confirmando que só `tmp/setup-boss-diagnostic.md` foi alterado e que o conteúdo inclui `prompt-sizes` ou `diagnostic` com timestamp ISO.

### Date

2026-05-05

## Decision / Update

### Context

O fluxo de diagnóstico deve manter a alteração do projeto alvo estritamente em `tmp/setup-boss-diagnostic.md`.

### Decision

A run fica limitada a um único ficheiro de diagnóstico com uma linha curta contendo marcador e timestamp ISO.

### Reason

Isso cumpre o objetivo de gerar o artefacto mínimo sem tocar em `scripts/`, `core/`, `agents/` ou `docs/`.

### Impact

Reduz o risco de alterações colaterais e facilita a validação por comparação direta do ficheiro alvo.

### Validation

Verifica-se pela presença de `tmp/setup-boss-diagnostic.md` com timestamp ISO e pela ausência de alterações fora desse caminho.

### Date

2026-05-05