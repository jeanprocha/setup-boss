# Setup Boss — Visão de Evolução

## Objetivo

Definir os níveis de maturidade do Setup Boss.

---

## Fase 1 — MVP

- geração de plano
- geração de prompt
- execução manual

---

## Fase 2 — Semi-automação

- review JSON-first
- loop de correção automático
- logs e controle de execução

Execução de alterações ainda era manual antes do executor.

---

## Fase 3 — Executor local ✅ (CONCLUÍDA · v2.0.0)

- execução automática no projeto via `executor`
- pipeline integral com review baseado em estado real dos arquivos
- correction loop funcional entre review e novo `executor`
- knowledge persistente

---

## Fase 4 — Sistema assistido (PRÓXIMA)

Executor híbrido e fortalecimento da validação:

- parsing estruturado onde couber (HTML / AST / árvores)
- inserções mais determinísticas
- validação opcional por build/teste em projetos compatíveis
- papel humano claro nos gates quando necessário

---

## Fase 5 — Sistema autônomo

- IA propõe melhorias
- execução contínua com salvaguardas organizacionais

---

## Estado atual

```text
Fase 3 — Executor local automático (v2.0.0)
```

---

## Próximo passo

```text
Fase 4 — Executor híbrido, parsing estruturado, validação via build/teste
```

