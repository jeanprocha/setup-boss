{
  "task_valid": true,
  "acceptance_level": "development",
  "has_acceptance_criteria": true,
  "risks": [
    "O Project Scan indica que `index.html` e `css/styles.css` foram fornecidos de forma truncada, então a estrutura completa atual não está totalmente confirmada.",
    "Há risco de divergência entre a task e o estado real do código, pois o scan já sugere que a landing com hero, benefícios, produtos e CTA WhatsApp aparentemente existe.",
    "Existe risco em `js/main.js` já mapeado no scan (`u` vs `utm`), mas essa task exige preservar a integração e não ampliar escopo para correção não solicitada.",
    "Não há testes automatizados, lint ou build formal; a validação dependerá de inspeção manual no navegador.",
    "O número em `data-whatsapp` pode estar como placeholder, o que é aceitável em development, mas impede validação operacional de publicação real."
  ],
  "missing_definitions": [
    "Confirmar se a task é para criar do zero ou apenas ajustar/completar a landing existente.",
    "Confirmar se o conteúdo atual de `index.html` já atende parcialmente ou integralmente aos critérios de aceite.",
    "Confirmar se imagens mockadas devem ser mantidas como externas ou apenas placeholders locais/textuais.",
    "Confirmar se a validação deve considerar somente a presença estrutural das seções ou também acabamento visual mínimo."
  ],
  "summary": "A task é válida e tem aceite definido em development, mas há forte indício de que a estrutura solicitada já exista parcialmente no projeto. O plano seguro é validar o estado atual, ajustar somente `index.html` e, se necessário, `css/styles.css`, preservando totalmente a integração com `js/main.js` e sem expandir escopo."
}

## Entendimento

A task pede planejar a criação de uma landing page de sofás com:

- hero
- benefícios
- produtos
- CTA WhatsApp

Com critérios explícitos de que:

- a estrutura da página deve conter essas seções
- o CTA deve seguir o padrão do projeto com `data-wa-href` e `data-whatsapp`
- a integração com `js/main.js` deve ser preservada
- nenhum arquivo fora do escopo deve ser alterado

Pelo scan, o projeto já parece ser exatamente uma landing page estática com essa composição, usando `index.html`, `css/styles.css` e `js/main.js`. Portanto, o entendimento técnico mais seguro é:

- primeiro verificar se a task já está parcialmente ou totalmente atendida
- se não estiver, atuar de forma mínima na estrutura HTML
- complementar estilos apenas se necessário
- não alterar a lógica de WhatsApp em `js/main.js`, apenas consumir o contrato já existente

## Riscos

1. **Possível task já atendida**
   - O scan descreve uma landing com hero, benefícios, produtos e CTA final.
   - Se isso estiver de fato no código real, implementar “de novo” criaria retrabalho ou alteração indevida.

2. **Arquivos truncados no scan**
   - `index.html` e `css/styles.css` não foram totalmente confirmados.
   - O plano precisa assumir inspeção prévia antes de qualquer execução.

3. **Integração frágil com WhatsApp**
   - O projeto usa contrato específico:
     - `body[data-whatsapp]`
     - elementos com `data-wa-href`
     - opcionais como `data-wa-msg`, `data-wa-placement`, `data-product-id`
   - Qualquer CTA fora desse padrão quebra o comportamento esperado.

4. **Bug potencial pré-existente em `js/main.js`**
   - O scan aponta possível erro de variável (`u` vs `utm`).
   - Como a task pede preservar integração, não é seguro corrigir isso sem confirmar necessidade e impacto, a menos que bloqueie diretamente o aceite.

5. **Sem automação**
   - Não há testes, lint ou build.
   - Toda validação depende de inspeção manual no navegador.

## Arquivos prováveis

index.html  
css/styles.css  
js/main.js

## Plano

1. **Inspecionar o estado atual do projeto**
   - Confirmar se `index.html` já contém:
     - hero
     - benefícios
     - produtos
     - CTA WhatsApp
   - Confirmar se o `<body>` já possui `data-whatsapp`.
   - Confirmar se os CTAs já usam `data-wa-href`.

2. **Delimitar escopo real de alteração**
   - Se a estrutura já existir e atender ao aceite, não propor mudanças desnecessárias.
   - Se faltar conteúdo/seção, ajustar somente `index.html`.
   - Se a seção existir mas faltar acabamento mínimo, ajustar somente `css/styles.css`.
   - `js/main.js` só deve ser lido/validado para garantir compatibilidade; não deve ser alterado sem necessidade comprovada.

3. **Preservar contrato do CTA WhatsApp**
   - Garantir que o CTA principal e eventuais CTAs de produto usem `data-wa-href`.
   - Garantir que o número continue vindo de `body[data-whatsapp]`.
   - Se houver mensagem específica por botão, usar apenas atributos já suportados pelo projeto, como `data-wa-msg`.

4. **Manter implementação compatível com a arquitetura atual**
   - HTML estático em `index.html`
   - estilos em `css/styles.css`
   - comportamento já centralizado em `js/main.js`
   - sem novas dependências
   - sem troca de stack
   - sem refatoração paralela

5. **Validação manual**
   - Abrir `index.html` no navegador.
   - Verificar presença visual e estrutural das seções exigidas.
   - Inspecionar se os links com `data-wa-href` recebem `href` final para `https://wa.me/...`.
   - Validar que a interação continua sendo tratada por `js/main.js`.
   - Confirmar que nenhum arquivo fora do escopo foi alterado.

6. **Definição objetiva de aceite**
   - A task será considerada pronta em development quando:
     - a landing contiver as seções exigidas
     - os CTAs seguirem o padrão de WhatsApp do projeto
     - `js/main.js` continuar sendo o mecanismo de integração
     - não houver alteração fora do escopo mínimo necessário

## Critério de parada

Parar e reportar antes de execução se ocorrer qualquer um dos casos abaixo:

- houver divergência entre a task e o código real, especialmente se `index.html` já atender integralmente aos critérios de aceite
- o contrato esperado de `js/main.js` não corresponder ao uso de `data-wa-href` e `data-whatsapp` descrito no scan
- a estrutura real do projeto diferir do scan a ponto de exigir alteração arquitetural
- a correção necessária depender de mudanças fora de `index.html` e `css/styles.css` sem justificativa clara de escopo
- o bug potencial em `js/main.js` bloquear a validação do CTA, pois nesse caso será necessário confirmar se a task inclui correção de defeito pré-existente ou apenas criação/ajuste da landing