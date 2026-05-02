## Arquivos alterados

- _(nenhum — o projeto `landing-sofas` já está em conformidade com hero, benefícios, produtos, CTAs WhatsApp com `data-wa-href` / `data-wa-msg` / `data-wa-placement`, `<body data-whatsapp>`, mais de três produtos e CTA final; não foi necessário alterar código nem CSS nem JS.)_

## Validações feitas

- **`index.html`**: existe `<section class="hero">` com título/copy e CTA WhatsApp principal com `data-wa-href`, `data-wa-placement`, `data-wa-msg` (aprox. L23–37).
- **Benefícios**: `<section class="section benefits">` com vários `.benefit-card` (aprox. L51–94).
- **Produtos**: `<section class="section products" id="produtos">` com **4** `<article class="product-card">` (Linea 3 lugares, Canto Aura, Relax Retrátil, Módulo Loft) — mais de **3** modelos (aprox. L117–173).
- **CTA WhatsApp nos produtos**: cada card com `<a … data-wa-href … data-wa-placement="product" … data-wa-msg="…">` (aprox. L133, L145, L157, L169).
- **CTA principal (hero)** e **header**: `data-wa-href` + `data-wa-msg` + `data-wa-placement` em `hero_primary` e `header` (L18, L32).
- **CTA final**: seção `.cta-final` com botão `data-wa-placement="cta_footer"` (aprox. L176–188).
- **Botão flutuante**: `.wa-float` com `data-wa-href`, `data-wa-placement="float"`, `data-wa-msg` (L200).
- **`<body>`**: mantém `data-whatsapp="5511999999999"` (L12).
- **`css/styles.css`**: uso de `@media`, `clamp`, grids e `flex` para layout responsível (ex.: `.hero__grid` L191–202, `.products__grid` L407–422, `.cta-final__inner` L492–498).
- **`js/main.js`**: único script WhatsApp — seleciona `[data-wa-href]`, lê `data-wa-msg` e `data-wa-placement`, monta `href` `wa.me` a partir de `data-whatsapp` no `body`; sem segunda lógica paralela para links (L48–77).

## Evidências

- **`index.html`** — corpo WhatsApp + hero + CTA principal:

```html
<body data-whatsapp="5511999999999">
  ...
    <section class="hero" aria-labelledby="hero-title">
      ...
            <a class="btn btn--primary btn--large" data-wa-href data-wa-placement="hero_primary" data-wa-msg="Olá! Vim pelo site e quero um orçamento de sofá." href="#">
```

- **`index.html`** — três produtos (há quarto cartão igualmente conforme):

```html
<h3 class="product-card__name">Linea 3 lugares</h3>
...
<h3 class="product-card__name">Canto Aura</h3>
...
<h3 class="product-card__name">Relax Retrátil</h3>
```

- **`index.html`** — CTA final:

```html
<section class="section cta-final" aria-labelledby="cta-final-title">
  ...
        <a class="btn btn--primary btn--xlarge" data-wa-href data-wa-placement="cta_footer" data-wa-msg="Olá! Quero agendar atendimento e orçamento gratuito." href="#">
```

- **`css/styles.css`** — exemplo de responsividade:

```css
@media (min-width: 900px) {
  .hero__grid {
    grid-template-columns: 1fr 1fr;
    gap: 3rem;
  }
}
```

- **`js/main.js`** — padrão único dos CTAs (não alterado):

```javascript
  document.querySelectorAll("[data-wa-href]").forEach((el) => {
    const anchor = /** @type {HTMLAnchorElement} */ (el);
    const rawMsg = anchor.getAttribute("data-wa-msg") || "";
    ...
```

## Fora de escopo

- **Confirmado**: nenhum arquivo fora do repositório/pasta **`landing-sofas`** foi modificado nesta execução (apenas leitura e validação local do que já existe no projeto).