# Cursor Token Optimization Rules

## Objetivo

Minimizar consumo de contexto/tokens sem perder qualidade técnica.

O agente deve operar de forma:
- cirúrgica
- incremental
- contextual
- econômica

Evitar comportamento exploratório excessivo.

---

# REGRAS GERAIS

## 1. NÃO expandir contexto desnecessariamente

NÃO:
- analisar o projeto inteiro
- abrir arquivos sem necessidade
- seguir imports em cadeia indefinidamente
- carregar pastas inteiras sem motivo

Sempre manter análise local e focada.

---

## 2. Ler apenas o necessário

Antes de abrir arquivos:
- identificar os arquivos mais prováveis
- limitar leitura ao escopo da tarefa

Evitar:
- "full project analysis"
- "deep architecture scan"

---

## 3. Discovery primeiro

Sempre separar:
1. discovery
2. implementação
3. review

Nunca tentar fazer tudo em uma única execução.

---

## 4. Discovery econômico

Discovery deve responder apenas:
- causa raiz
- arquivos envolvidos
- impacto
- plano mínimo

Evitar:
- explicações longas
- documentação extensa
- reescrever arquitetura inteira

---

## 5. Implementações pequenas

Preferir:
- mudanças pequenas
- commits mentais pequenos
- prompts curtos
- escopo limitado

Evitar prompts monolíticos.

---

## 6. NÃO repetir contexto global

Assumir que:
- `.cursor/index.md`
- `.IA/index.md`
- `.cursor/rules/*`

já representam o contexto permanente.

NÃO reexplicar:
- arquitetura global
- stack
- regras gerais
- padrões já documentados

---

## 7. Seguir imports apenas se necessário

Só expandir dependências/imports quando:
- necessário para implementar
- necessário para validar impacto
- necessário para debug

Caso contrário:
- manter análise local

---

## 8. Respostas objetivas

Preferir:
- bullet points
- diffs
- ações diretas

Evitar:
- textos longos
- raciocínio excessivo
- explicações acadêmicas

---

## 9. Não gerar documentação sem solicitação

Só gerar:
- docs
- markdowns extensos
- análises longas

quando explicitamente solicitado.

---

## 10. Validar apenas o impacto direto

Testar:
- arquivos alterados
- fluxos afetados
- build/lint/testes relevantes

Evitar validações globais desnecessárias.

---

# MODO OPERACIONAL

## Discovery Mode

Objetivo:
- entender problema
- mapear arquivos
- propor plano mínimo

NÃO:
- implementar
- refatorar
- otimizar além do solicitado

---

## Implementation Mode

Objetivo:
- executar apenas o plano aprovado

NÃO:
- reanalisar arquitetura inteira
- expandir escopo
- fazer melhorias paralelas

---

## Review Mode

Objetivo:
- validar regressões
- validar impacto direto

NÃO:
- propor refactors grandes
- abrir novas iniciativas
- expandir escopo

---

# PRIORIDADE

Priorizar sempre:
1. menor contexto possível
2. menor quantidade de arquivos
3. menor expansão possível
4. execução incremental
5. precisão
6. baixo custo de token