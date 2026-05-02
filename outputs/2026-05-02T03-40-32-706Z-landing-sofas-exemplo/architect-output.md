```json
{
  "task_valid": true,
  "acceptance_level": "development",
  "has_acceptance_criteria": true,
  "risks": [
    "O scan indica que a landing e a estrutura base aparentemente já existem, então a task pode estar parcialmente pronta ou redundante.",
    "Há indício de erro em runtime em js/main.js no uso de variável divergente ('u' vs 'utm'), o que pode afetar a integração pedida.",
    "index.html e css/styles.css aparecem truncados no scan, então não há confirmação total da estrutura atual.",
    "Não existem testes automatizados, lint ou build para validar regressões de forma programática."
  ],
  "missing_definitions": [
    "Confirmar se a task é criar do zero ou ajustar/completar uma landing já existente.",
    "Confirmar se o conteúdo visual atual do index.html atende à estrutura esperada ou se deve ser substituído.",
    "Confirmar se a correção de eventual bug em js/main.js faz parte do escopo, caso impeça o aceite de integração preservada."
  ],
  "summary": "A task é válida em nível de development, com escopo centrado na página estática e preservação do padrão de CTA WhatsApp já definido no projeto. Antes de implementar, é necessário confirmar se a landing já existente deve ser reaproveitada ou apenas ajustada, e tratar como risco a possível inconsistência atual em js/main.js."
}
```

## Entendimento

A task pede o planejamento para uma landing page de sofás com quatro blocos mínimos:

- hero
- benefícios
- produtos
- CTA WhatsApp

Pelo scan, o projeto já é uma landing estática em HTML/CSS/JS vanilla e já possui integração de WhatsApp baseada em:

- `data-whatsapp` no `<body>`
- elementos com `data-wa-href`
- suporte a `data-wa-msg`
- suporte a `data-wa-placement`
- processamento em `js/main.js`

Logo, a abordagem segura não é propor nova arquitetura nem nova stack, mas sim:

1. verificar se `index.html` já contém total ou parcialmente essas seções;
2. complementar ou ajustar a estrutura existente;
3. preservar a integração já usada pelo projeto;
4. evitar alterações fora de `index.html`, `css/styles.css` e, somente se estritamente necessário, validação de compatibilidade em `js/main.js`.

Como o aceite diz “integração com `js/main.js` preservada”, o plano deve assumir que a página precisa continuar usando o padrão já existente, sem trocar o mecanismo de CTA.

## Riscos

1. **Possível divergência entre task e estado atual**
   - O scan sugere que a landing principal já existe e já possui CTA WhatsApp.
   - Se a task for “criar” mas o projeto já estiver pronto, pode na prática ser uma task de ajuste, não de criação.

2. **Risco funcional em `js/main.js`**
   - O scan aponta provável erro em runtime na função que manipula UTM.
   - Mesmo sem alterar esse arquivo, a integração pode falhar durante a validação.

3. **Arquivos parcialmente conhecidos**
   - `index.html` e `css/styles.css` foram vistos de forma truncada no scan.
   - Pode haver seções já implementadas, nomes de classes existentes e padrões visuais que precisam ser respeitados.

4. **Escopo limitado**
   - O aceite exige que nenhum arquivo fora do escopo seja alterado.
   - Portanto, qualquer problema estrutural que exija mexer em mais arquivos deve interromper a execução e pedir alinhamento.

5. **Sem automação de validação**
   - Como não há testes, lint ou build, a validação será manual em navegador.
   - Isso aumenta o risco de regressão visual e funcional silenciosa.

## Arquivos prováveis

index.html  
css/styles.css  
js/main.js

## Plano

1. **Inspecionar o estado atual da landing**
   - Confirmar se `index.html` já contém hero, benefícios, produtos e CTA.
   - Mapear os CTAs existentes com `data-wa-href`.
   - Verificar se o `<body>` já possui `data-whatsapp`.

2. **Definir se a execução será de criação incremental ou ajuste**
   - Se a estrutura já existir, apenas complementar o que faltar.
   - Se estiver incompleta, montar as seções mínimas dentro da estrutura atual do HTML.
   - Não substituir arquitetura da página sem necessidade.

3. **Preservar o padrão de integração do WhatsApp**
   - Garantir que o CTA principal use `data-wa-href`.
   - Garantir compatibilidade com `data-whatsapp` no `<body>`.
   - Opcionalmente manter `data-wa-msg` e `data-wa-placement` se o padrão local já estiver em uso.
   - Não criar script novo para WhatsApp.

4. **Ajustar apresentação visual no CSS existente**
   - Inserir apenas estilos necessários para suportar as seções exigidas.
   - Reaproveitar classes e padrões já existentes, se houver.
   - Evitar refatoração ampla de layout ou design system.

5. **Validar integração com `js/main.js` sem expandir escopo**
   - Confirmar que os links de CTA recebem `href` final para `wa.me`.
   - Confirmar que o clique continua disparando o comportamento esperado.
   - Se a integração falhar por problema pré-existente em `js/main.js`, registrar bloqueio antes de propor alteração.

6. **Executar validação manual de aceite**
   - Abrir `index.html` no navegador.
   - Verificar presença das quatro áreas exigidas.
   - Confirmar comportamento do CTA com `data-whatsapp` válido.
   - Confirmar que não houve alteração em arquivos fora do escopo.

## Critério de parada

Parar e reportar antes de implementação se ocorrer qualquer um dos casos abaixo:

- houver divergência clara entre task e código atual, por exemplo:
  - a landing já estiver pronta e atender ao aceite;
  - a task pedir criação, mas o repositório já contiver a solução;
- for necessário alterar arquivos além de `index.html`, `css/styles.css` e eventual verificação pontual em `js/main.js`;
- a integração com WhatsApp não puder ser preservada por problema pré-existente em `js/main.js`;
- a estrutura real do projeto diferir do scan a ponto de invalidar o plano;
- não for possível confirmar no código se o padrão `data-wa-href` / `data-whatsapp` está de fato ativo e suportado.