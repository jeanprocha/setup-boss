# Setup Boss — Manutenção e Atualização de Documentos

## Objetivo

Garantir que a IA atualize corretamente os documentos do Setup Boss ao final de cada evolução.

---

## Contexto

O Setup Boss é um sistema versionado por evolução.

Cada conversa pode gerar mudanças em:

- comportamento do sistema
- pipeline
- regras
- estrutura
- limitações

Essas mudanças DEVEM ser refletidas nos documentos.

---

## Regra principal

Sempre que houver mudança relevante no sistema:

```text
os documentos devem ser atualizados
```

---

## Documentos e responsabilidades

### docs/README.md
- como o sistema funciona hoje
- comandos
- pipeline atual
- estado atual (fase)

---

### docs/setup-boss-roadmap.md
- o que está sendo implementado agora
- próximo passo técnico

---

### docs/setup-boss-vision.md
- fases do sistema (1 → 5)
- nível atual
- próxima fase

---

### docs/setup-boss-evolution.md
- histórico real do que já foi feito
- marcar fases concluídas
- atualizar estado atual

---

### docs/ai-session-bootstrap.md
- resumo do sistema para novo chat
- deve refletir comportamento atual

---

### docs/padrao-novo-chat.md
- padrão de comunicação com IA
- só muda se o fluxo mudar

---

## O que atualizar

Atualize documentos SOMENTE se houver:

- mudança de pipeline
- nova etapa no sistema
- alteração de comportamento
- nova limitação ou regra
- avanço de fase (ex: Fase 2 → Fase 3)

---

## O que NÃO atualizar

- não reescrever documentos sem necessidade
- não mudar estrutura sem motivo
- não adicionar complexidade desnecessária

---

## Como atualizar

1. solicitar o documento atual
2. gerar versão completa atualizada
3. manter padrão existente
4. não quebrar formatação

---

## Critério de atualização

Antes de atualizar, validar:

```text
isso muda o funcionamento do sistema?
```

Se NÃO → não atualizar  
Se SIM → atualizar documento correto

---

## Saída esperada

Ao final da conversa, se houver mudanças:

- indicar quais documentos precisam ser atualizados
- solicitar os arquivos
- gerar versões completas atualizadas

---

## Regra final

```text
documentação deve sempre refletir o estado real do sistema
```