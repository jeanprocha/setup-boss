# Setup Boss — Observabilidade

## Contexto

O Setup Boss possui um pipeline estruturado:

```text
scan → architect → executor → review → correction → executor → knowledge
```

Artefatos esperados por estágio em `outputs/<run>/` (entre outros): `scan-output.md`, `architect-output.md`, `executor-output.md`, `executor-changes.json`, `review-output.json`, correções iterativas antes de `knowledge-update.md` final.
