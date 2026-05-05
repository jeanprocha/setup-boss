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

## Decision / Update

### Context
A run de diagnóstico depende de pré-criar `tmp/setup-boss-diagnostic.md` porque o executor aplica patch apenas em ficheiros já existentes.

### Decision
A alteração relevante deve ficar limitada a `tmp/setup-boss-diagnostic.md`, com conteúdo curto contendo `prompt-sizes` ou `diagnostic` e timestamp ISO 8601.

### Reason
Isso evita bloqueio por caminho inexistente e mantém o escopo limpo, sem tocar em `scripts/`, `core/`, `agents/` ou `docs/`.

### Impact
O fluxo passa a ser validável por presença do ficheiro alvo e pela ausência de alterações fora de `tmp/`, reduzindo risco de false positives no review.

### Validation
Verifica-se por inspeção do diff e do conteúdo final de `tmp/setup-boss-diagnostic.md`, confirmando que não houve alterações fora do caminho permitido.

### Date
2026-05-05

## Decision / Update

### Context

A run de regression deve ficar confinada ao ficheiro temporário permitido, sem tocar no código do projeto.

### Decision

O repositório passou a usar `tmp/setup-boss-regression.md` como única saída de mudança para este smoke test.

### Reason

O escopo aprovado exige isolamento total de alterações para evitar efeitos colaterais em `scripts/`, `core/`, `agents/` e `docs/`.

### Impact

Qualquer validação futura deste pipeline deve confirmar que só esse ficheiro temporário contém a evidência de regressão e timestamp ISO.

### Validation

Verifica-se com `git diff` e inspeção do ficheiro alvo, garantindo ausência de alterações fora de `tmp/setup-boss-regression.md`.

### Date

2026-05-05