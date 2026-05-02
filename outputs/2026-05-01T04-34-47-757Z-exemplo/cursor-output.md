Segue o retorno no **formato do `cursor-prompt.md`**.

---

## 1. Resumo

O prompt reitera a mesma landing (hero, benefícios, produtos, WhatsApp), critérios de aceite e um plano que inclui, de forma **opcional**, uma **seção de reforço de confiança**. A base em `landing-sofas/` já cobria o MVP, SEO básico, responsividade, CTAs com mensagem contextual e evento `whatsapp_cta_click` com UTMs. Foi acrescentada uma faixa **“Compra com clareza”** entre benefícios e produtos, com três pontos de reforço **sem inventar números ou depoimentos** (evita risco comercial citado no plano).

---

## 2. Arquivos alterados

- `c:\Users\pierr\Documents\automacao\landing-sofas\index.html` — nova `<section class="trust-strip">` com título e três itens.
- `c:\Users\pierr\Documents\automacao\landing-sofas\css\styles.css` — estilos `.trust-strip*` (e correção de sintaxe em `font-weight` / `letter-spacing`).

---

## 3. Como validar

1. Abrir `landing-sofas/index.html` no navegador.
2. Rolar da seção de benefícios para baixo: deve aparecer **“Compra com clareza”** e três colunas (em telas médias/grandes) ou empilhado no mobile.
3. Confirmar que hero, benefícios, produtos e CTAs de WhatsApp continuam iguais em comportamento.
4. Ajustar `data-whatsapp` no `<body>` e testar um CTA com UTMs na URL.

---

## 4. Checks executados

- Inserção manual revisada no HTML e no CSS.
- `read_lints` em `styles.css`: sem diagnósticos.

---

## 5. Problemas

- Textos da faixa de confiança são **genéricos**; vale substituir por garantias reais, região de atendimento ou política da loja quando o stakeholder fechar o conteúdo.
- **Componentização** tipo React mencionada no plano **não** foi aplicada: o projeto segue HTML/CSS/JS estático, coerente com “sem dependências desnecessárias”.

---

## 6. Próximo passo

Para fechar o fluxo do plano: **briefing** com marca, região, headline definitiva, número de WhatsApp, mensagens de CTA por objetivo (orçamento x catálogo x visita) e, se quiser Fase 2, **prova social** real (depoimentos, selos). Posso redigir esse briefing em markdown na pasta do projeto se você quiser.