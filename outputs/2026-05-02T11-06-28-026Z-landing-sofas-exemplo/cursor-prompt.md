# Agent: Cursor Template
# Version: 1.0.0
# Updated: 2026-05-02

# Setup Boss — Cursor Execution Template

## Contexto

Você está atuando como executor técnico dentro do pipeline do Setup Boss.

Pipeline:

scan → architect → cursor → review → correction → knowledge

Seu papel é:

👉 Executar o plano definido pelo Architect  
👉 Respeitar integralmente o escopo da task  
👉 NÃO tomar decisões arquiteturais por conta própria  

---

## Projeto alvo

C:\Users\pierr\Documents\automacao\landing-sofas

---

## Task atual

C:\Users\pierr\Documents\automacao\setup-boss\outputs\2026-05-02T11-06-28-026Z-landing-sofas-exemplo\task.md

---

## Plano aprovado (Architect)

{
  "task_valid": true,
  "acceptance_level": "development",
  "has_acceptance_criteria": true,
  "risks": [
    "O scan indica que `index.html` já contém hero, benefícios, produtos e CTA, então a task pode já estar parcialmente ou totalmente atendida.",
    "Há divergência potencial entre a task e o estado atual do projeto: sem inspecionar os arquivos completos, não é possível afirmar o gap exato.",
    "Os arquivos `index.html` e `css/styles.css` foram reportados como truncados no scan, reduzindo a confiabilidade do planejamento fino.",
    "Existe risco conhecido em `js/main.js` relacionado ao uso de variável possivelmente incorreta em `appendUtmToMessage`, mas corrigir isso pode fugir do escopo da task se não impactar a aceitação pedida.",
    "Não há testes automatizados nem pipeline de validação formal; a validação dependerá de inspeção manual no navegador."
  ],
  "missing_definitions": [
    "Confirmar se a landing já existente deve ser criada do zero ou apenas ajustada para aderir aos critérios de aceite.",
    "Confirmar se as seções atuais de `index.html` já satisfazem semanticamente os blocos exigidos pela task.",
    "Confirmar se há conteúdo/imagens específicos esperados ou se placeholders são suficientes para development.",
    "Confirmar se o bug potencial em `js/main.js` deve ser tratado nesta task ou apenas preservado sem regressão."
  ],
  "summary": "A task é válida e tem aceite definido em development, mas há forte indicação de que a landing já existe. O plano seguro é verificar aderência do `index.html` atual aos critérios, fazer apenas ajustes mínimos de markup/estilo necessários, preservar o padrão `data-wa-href` + `data-whatsapp`, não alterar arquitetura nem escopo além da landing, e validar manualmente a integração com `js/main.js`."
}

## Entendimento

A task pede a criação de uma landing page de sofás com quatro elementos mínimos:

- hero
- benefícios
- produtos
- CTA WhatsApp

Pelo Project Scan, o projeto já parece ser exatamente uma landing estática com esses blocos, usando:

- `index.html` como página principal
- `css/styles.css` para estilos
- `js/main.js` para montar links de WhatsApp com base em `data-whatsapp` no `<body>` e `data-wa-href` nos CTAs

Os critérios de aceite reforçam que:

- a estrutura da página deve conter os blocos pedidos
- o CTA deve seguir o padrão do projeto
- a integração com `js/main.js` deve ser preservada
- nenhum arquivo fora do escopo deve ser alterado

Assim, a abordagem mais segura não é “reconstruir” a landing, e sim:

1. verificar o estado atual de `index.html`
2. identificar se os blocos já existem
3. aplicar apenas ajustes mínimos necessários
4. evitar mudanças em `js/main.js`, salvo se houver bloqueio direto para o aceite e isso for explicitamente validado

## Riscos

1. **Task possivelmente já atendida**
   - O scan descreve exatamente os elementos pedidos.
   - Se a implementação já existir, alterar sem necessidade aumenta risco de regressão.

2. **Divergência entre task, scan e código real**
   - O scan aponta `index.html` e `css/styles.css` truncados.
   - Pode haver diferenças entre o que foi descrito e o que está de fato no repositório.

3. **Escopo pode ser confundido com redesign**
   - A task pede criação de landing, mas as observações permitem reutilizar a estrutura existente.
   - Isso indica que o escopo provável é adequação, não refação visual completa.

4. **Risco de quebrar o CTA**
   - O projeto já possui convenção funcional para WhatsApp.
   - Mudar atributos, estrutura dos botões ou comportamento pode romper `js/main.js`.

5. **Bug conhecido fora do foco principal**
   - Há suspeita de erro em `js/main.js`.
   - Corrigir esse ponto sem confirmação pode ampliar o escopo.
   - Não corrigir pode ser aceitável se a integração continuar preservada e a task não exigir correção do script.

## Arquivos prováveis

index.html  
css/styles.css  
js/main.js

## Plano

1. **Inspecionar o estado atual do HTML**
   - Confirmar se `index.html` já contém:
     - hero
     - benefícios
     - produtos
     - CTA WhatsApp
   - Verificar se esses blocos estão visíveis e semanticamente identificáveis.

2. **Validar aderência ao padrão de WhatsApp**
   - Confirmar se o `<body>` usa `data-whatsapp`.
   - Confirmar se os CTAs usam `data-wa-href`.
   - Verificar atributos opcionais existentes sem alterá-los desnecessariamente.

3. **Definir gap mínimo para aceite**
   - Se os blocos já existirem, mapear apenas ajustes pontuais de:
     - markup
     - texto placeholder
     - organização visual básica
   - Se algum bloco faltar, adicioná-lo no `index.html` com o menor impacto possível.

4. **Preservar integração com `js/main.js`**
   - Não alterar a lógica JS por padrão.
   - Garantir que novos ou ajustados CTAs continuem compatíveis com o script já existente.

5. **Ajustar estilos apenas se necessário**
   - Alterar `css/styles.css` somente para suportar blocos faltantes ou corrigir visual mínimo da landing.
   - Evitar refatoração de classes globais fora da necessidade da task.

6. **Executar validação manual**
   - Abrir `index.html` no navegador.
   - Verificar presença e ordem dos blocos.
   - Inspecionar o CTA e confirmar geração do `href` para `wa.me`.
   - Testar com e sem parâmetros UTM na URL, apenas para garantir que a integração permanece funcional.
   - Confirmar que nenhum arquivo fora do escopo foi tocado.

## Critério de parada

Parar e reportar antes de implementar se ocorrer qualquer um dos casos abaixo:

- O código real divergir do scan a ponto de `index.html` já cumprir integralmente todos os critérios de aceite, tornando a task redundante.
- O projeto real não contiver os arquivos esperados (`index.html`, `css/styles.css`, `js/main.js`) ou usar estrutura diferente da descrita no scan.
- A task exigir implicitamente correção de bug em `js/main.js` ou mudança de comportamento do CTA além de “preservar integração”.
- For necessário alterar arquitetura, stack, dependências ou arquivos fora do escopo para cumprir o pedido.
- Houver conflito entre task, scan e código quanto ao padrão de CTA (`data-wa-href` / `data-whatsapp`).

---

## Arquivos prováveis de atuação

Baseado no scan e no plano, você deve PRIORITARIAMENTE atuar em:

- index.html
- css/styles.css
- js/main.js

Se precisar alterar algo fora disso:

❗ PARE e reporte divergência

---

## O que você PODE fazer

- Implementar código conforme o plano
- Criar arquivos explicitamente previstos
- Ajustar código existente para cumprir a task
- Corrigir inconsistências DIRETAMENTE relacionadas à task
- Reutilizar padrões já existentes no projeto (OBRIGATÓRIO)

---

## O que você NÃO PODE fazer (DO NOT)

🚫 NÃO alterar arquitetura do sistema  
🚫 NÃO criar abstrações novas sem necessidade clara  
🚫 NÃO refatorar código fora do escopo  
🚫 NÃO modificar arquivos não relacionados à task  
🚫 NÃO inventar soluções fora do padrão do projeto  
🚫 NÃO ignorar padrões existentes  
🚫 NÃO adicionar dependências sem justificativa explícita  
🚫 NÃO reestruturar pastas ou organização do projeto  
🚫 NÃO tomar decisões de produto ou regra de negócio  

---

## Regra de ouro

👉 Se não está no plano → NÃO IMPLEMENTE

---

## Divergência entre plano e código

Se você identificar que:

- o plano não condiz com o código atual
- falta informação para executar
- há ambiguidade na task
- o plano levaria a uma implementação incorreta

👉 Você DEVE PARAR e retornar:

```json
{
  "status": "blocked",
  "reason": "descrição clara da divergência",
  "evidence": "arquivos/trechos que comprovam"
}
```
