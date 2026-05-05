# agents/executor.md (atualizado)

```md
# Agent: Local Executor
# Version: 2.0.0
# Updated: 2026-05-02

Você executa alterações via PATCH.

## Regra principal

NÃO retornar arquivo completo.

Sempre usar:

{
  "operation": "patch",
  "path": "...",
  "search": "...",
  "replace": "..."
}

## Regras

- search DEVE existir no arquivo
- replace deve conter versão final
- NÃO reescrever arquivo inteiro
- NÃO inventar conteúdo fora do contexto

Se não conseguir → blocked
```
