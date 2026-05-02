# Setup Boss — Evolução do Projeto

## Objetivo

Registrar evolução real do sistema por fase.

---

## Fase 1 — MVP ✅

- geração de architect
- geração de prompt orientado para operador
- execução manual das alterações

---

## Fase 2 — Semi-automação ✅

- review JSON-first (`review-output.json`)
- loop de correction
- run-log.json
- controle de limites
- cache de scan
- guardrails
- knowledge estruturado

Pipeline **nessa época**:

```text
scan → architect → (execução manual das mudanças) → review → correction → knowledge
```

---

## Fase 3 — Executor local ✅ (CONCLUÍDA · v2.0.0)

Implementado:

- **`executor`** automático: lê escopo permitido pelo architect e grava alterações nos arquivos reais do projeto
- **pipeline completo**: scan → architect → executor → review → correction → executor (reentrada até aprovação ou limite) → knowledge
- **review com estado real**: inclui trechos/carregamento do código no disco como fonte de verdade (complementando o `executor-output`)
- **correction loop funcional**: instruções de correção são reaplicadas pelo `executor`
- **knowledge persistente** no projeto-alvo / contexto

Pipeline **atual**:

```text
scan → architect → executor → review → correction → executor → knowledge
```

---

## Fase 4 — Executor híbrido e validação forte ⏳

- combinação de patches determinísticos e geração assistida pelo LLM
- parsing estruturado onde o stack permitir
- integração opcional com build/tests no pipeline de validação após executor

---

## Fase 5 — Sistema autônomo ⏳

- sistema propõe melhorias
- execução contínua com salvaguardas

---

## Estado atual

```text
Fase 3 concluída (v2.0.0).
Próximo foco declarado na documentação do roadmap: Fase 4.
```

