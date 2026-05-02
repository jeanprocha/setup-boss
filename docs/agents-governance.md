# Setup Boss — Agents Governance

## Objetivo

Definir regras oficiais para criação, manutenção e desativação de agents no Setup Boss.

O objetivo é evitar crescimento desnecessário de agents, reduzir sobreposição de responsabilidades e manter o pipeline simples, previsível e auditável.

---

## Princípio central

Um novo agent só pode existir se ele melhorar claramente o pipeline.

Criar agent demais cedo aumenta complexidade, reduz qualidade e dificulta manutenção.

---

## Regra oficial para criação de agents

Um novo agent só pode ser criado se atender todos os critérios abaixo:

1. Ter responsabilidade única
2. Reduzir repetição real no pipeline
3. Possuir input claro
4. Possuir output claro
5. Possuir critério de sucesso objetivo
6. Não duplicar responsabilidade de agent existente
7. Não existir apenas para organizar texto
8. Não existir apenas por preferência estética

Se qualquer item falhar, o agent não deve ser criado.

---

## Checklist obrigatório antes de criar um novo agent

Antes de criar um novo agent, responder:

```text
1. Qual problema real esse agent resolve?
2. Esse problema já apareceu mais de uma vez?
3. Qual agent atual não consegue resolver isso?
4. Qual é a responsabilidade única do novo agent?
5. Qual input ele recebe?
6. Qual output ele entrega?
7. Como saberemos que ele funcionou?
8. O que acontece se ele não existir?
9. Ele reduz ou aumenta complexidade?
10. Ele pode ser apenas uma seção dentro de um agent existente?