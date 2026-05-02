## Decision / Update

### Context
Foi solicitada a criação de uma landing page de sofás com hero, benefícios, produtos e CTA para WhatsApp no projeto `landing-sofas`.

### Decision
Passa a valer como padrão que, em landings estáticas deste projeto, o escopo deve ser atendido reaproveitando a infraestrutura já existente de CTA para WhatsApp, em vez de recriar lógica de conversão ou scripts paralelos.

### Reason
O projeto já possui integração funcional de WhatsApp baseada em:
- `data-whatsapp` no `<body>`
- CTAs com atributos como `data-wa-href`
- montagem de mensagem com suporte a UTMs
- evento `whatsapp_cta_click`

Isso reduz retrabalho e evita inconsistência entre botões, rastreamento e mensagem enviada.

### Impact
Próximas tasks de landing ou ajuste de seções devem:
- priorizar edição de conteúdo/estrutura visual
- manter CTAs ligados à lógica central existente
- evitar soluções duplicadas de link para WhatsApp
- validar sempre o número configurado em `data-whatsapp` antes de publicação

### Validation
Foi validado que a landing atual já atende ao escopo funcional pedido:
- hero
- benefícios
- produtos
- CTA WhatsApp

Também foi confirmado que a integração de WhatsApp já funciona com suporte a UTMs e evento de tracking.

### Date
2026-05-01

---

## Decision / Update

### Context
Durante a validação da task, foi identificado que o projeto está funcional, mas o número de WhatsApp configurado permanece como placeholder.

### Decision
Antes de qualquer publicação, o campo `data-whatsapp` deve ser tratado como item obrigatório de checklist operacional.

### Reason
Mesmo com a landing correta estruturalmente, o uso de placeholder impede conversão real e pode gerar falso positivo de conclusão técnica.

### Impact
Em futuras entregas semelhantes:
- a task pode ser considerada concluída em desenvolvimento/homologação
- mas publicação deve depender da troca do número real
- checklist final deve incluir validação explícita do `data-whatsapp`

### Validation
A revisão confirmou que o valor atual é um placeholder (`5511999999999`) e que esse é o único ponto operacional relevante antes de produção.

### Date
2026-05-01