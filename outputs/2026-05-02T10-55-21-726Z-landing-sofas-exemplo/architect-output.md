```json
{
  "task_valid": true,
  "acceptance_level": "development",
  "has_acceptance_criteria": true,
  "risks": [
    "O Project Scan indica que `index.html` e `css/styles.css` estão truncados nas evidências, então a estrutura completa atual não foi totalmente confirmada.",
    "Há risco apontado no scan de falha em runtime em `js/main.js` por possível uso inconsistente de variável (`u` vs `utm`); alterar esse arquivo pode expandir escopo indevidamente.",
    "Como a task permite reutilizar `index.html`, existe ambiguidade entre criar nova landing do zero e ajustar a landing já existente.",
    "Não há testes automatizados, lint ou build para validar regressões; a validação dependerá de inspeção manual no navegador.",
    "O número em `data-whatsapp` pode estar como placeholder, o que é aceitável em development, mas não valida operação real em produção."
  ],
  "missing_definitions": [
    "Confirmar se a expectativa é adaptar o `index.html` existente ou criar uma nova variação de landing dentro do mesmo arquivo.",
    "Confirmar se a seção de produtos deve ter quantidade mínima de cards ou apenas presença estrutural.",
    "Confirmar se imagens mockadas já existem no projeto ou se devem ser usadas URLs externas/placeholders inline.",
    "Confirmar se o conteúdo atual já atende parcialmente aos critérios e a task é apenas de ajuste fino."
  ],
  "summary": "A task é válida e executável em nível development. O plano seguro é atuar apenas na landing existente, priorizando `index.html` e, se necessário, `css/styles.css`, preservando o padrão de CTA com `data-wa-href` e `data-whatsapp` e sem alterar `js/main.js` salvo evidência explícita de quebra causada pela própria task."
}
```

## Entendimento

A task pede uma landing page de sofás com quatro blocos essenciais:

- hero
- benefícios
- produtos
- CTA WhatsApp

Pelo Project Scan, já existe uma landing estática em `index.html` com integração pronta para WhatsApp via:

- `data-whatsapp` no `<body>`
- elementos com `data-wa-href`
- suporte de UTMs e tracking em `js/main.js`

Então a abordagem mais segura e limitada é:

- reutilizar a estrutura existente
- ajustar o conteúdo/markup necessário em `index.html`
- complementar estilos apenas se houver necessidade em `css/styles.css`
- preservar a integração já existente com `js/main.js`
- não mexer em stack, arquitetura ou fluxo de tracking

A task está coerente com o projeto e com os critérios de aceite definidos para development.

## Riscos

1. **Escopo duplicado com o que já existe**
   - O scan já descreve hero, benefícios, produtos e CTA final na landing.
   - Risco: a task talvez já esteja parcialmente atendida e a execução virar refatoração desnecessária.

2. **Arquivos parcialmente conhecidos**
   - `index.html` e `css/styles.css` foram reportados como truncados no material analisado.
   - Risco: existir estrutura/estilo adicional não visível nas evidências.

3. **Integração JS sensível**
   - O padrão de CTA depende de atributos HTML específicos.
   - Se a marcação for alterada fora do padrão (`data-wa-href`, `data-wa-msg`, `data-wa-placement`, `data-product-id` quando aplicável), a integração pode quebrar.

4. **Possível bug pré-existente em `js/main.js`**
   - O scan sinaliza uma possível inconsistência na função de UTMs.
   - Isso não deve ser tratado agora sem confirmação, porque a task não pede correção de JS.
   - Só deve ser reportado se bloquear diretamente o aceite.

5. **Validação apenas manual**
   - Sem testes automatizados, a confirmação dependerá de inspeção visual e funcional no navegador.

## Arquivos prováveis

index.html  
css/styles.css  

## Plano

1. **Inspecionar o estado atual da landing**
   - Verificar se `index.html` já contém as seções exigidas:
     - hero
     - benefícios
     - produtos
     - CTA WhatsApp
   - Verificar se o `<body>` possui `data-whatsapp`.
   - Verificar se os CTAs usam `data-wa-href`.

2. **Mapear lacunas em relação ao aceite**
   - Confirmar se falta alguma seção estrutural.
   - Confirmar se os CTAs existentes seguem exatamente o padrão do projeto.
   - Confirmar se a integração com `js/main.js` está apenas consumida pelo HTML, sem necessidade de alterar JS.

3. **Definir intervenção mínima**
   - Se faltar apenas conteúdo/markup: alterar somente `index.html`.
   - Se houver necessidade visual para suportar as seções: complementar `css/styles.css` sem refatorar estilos existentes.
   - Não alterar `js/main.js` a menos que haja divergência explícita entre task e implementação atual que impeça o aceite.

4. **Preservar o contrato com o JavaScript**
   - Manter `data-whatsapp` no `<body>`.
   - Garantir que os botões/links de WhatsApp usem `data-wa-href`.
   - Se houver mensagem contextual, usar atributos já previstos pelo projeto, sem inventar novo contrato.

5. **Validar manualmente em navegador**
   - Confirmar presença visual das quatro áreas exigidas.
   - Confirmar que o CTA gera link `wa.me` quando `data-whatsapp` estiver válido.
   - Confirmar que a página continua funcional sem depender de backend ou build.

6. **Conferir escopo**
   - Garantir que nenhum arquivo fora do necessário foi alterado.
   - Evitar qualquer refatoração estrutural não pedida.

## Critério de parada

Parar e reportar antes da implementação se ocorrer qualquer uma das situações abaixo:

- O código real divergir do scan a ponto de `index.html` não existir, ou `js/main.js` não implementar o padrão informado.
- A landing já atender integralmente aos critérios de aceite e a task se mostrar redundante sem necessidade de mudança objetiva.
- For necessário alterar `js/main.js` para cumprir a task, sem que isso esteja claramente autorizado no escopo.
- A estrutura atual exigir criação de nova arquitetura, novas dependências ou reorganização ampla de arquivos.
- O padrão de CTA no código real for diferente de `data-wa-href` + `data-whatsapp`, gerando conflito entre task, scan e código.