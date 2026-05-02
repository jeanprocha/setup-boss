# Setup Boss — Roadmap

## Estado atual

```text
scan → architect → cursor → review → correction → knowledge
```

Execução ainda depende de etapa manual.

---

## Objetivo atual

Implementar **local-executor**.

---

## O que é o local-executor

Componente que:

- lê arquivos do projeto
- aplica alterações
- respeita escopo do architect
- gera evidência (diff/trechos)

---

## Novo fluxo esperado

```text
scan → architect → executor → review → correction → executor → knowledge
```

---

## Regras

- não quebrar pipeline atual
- manter review como validação final
- não alterar fora do escopo permitido

---

## Critério de sucesso

- não usar Cursor manual
- execução automática no projeto