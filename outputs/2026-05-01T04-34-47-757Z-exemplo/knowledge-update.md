## Decision / Update

### Context
Implementação de uma landing page de sofás com foco em conversão via WhatsApp. Durante a execução, surgiu a necessidade de complementar o MVP sem inflar escopo e de garantir que a entrega fosse avaliada pelos requisitos obrigatórios da task, não apenas por melhorias opcionais.

### Decision
Para landing pages comerciais simples, manter a implementação em HTML/CSS/JS estático é adequado quando o objetivo é velocidade, baixo custo de manutenção e ausência de dependências desnecessárias.

Também ficou definido que:
- seções opcionais de reforço de confiança podem ser adicionadas, desde que não substituam a validação explícita dos blocos obrigatórios;
- CTAs de WhatsApp podem usar mensagem contextual e rastreamento com evento/UTM, mas a configuração do número não deve depender de um ponto frágil sem fallback ou documentação clara;
- conteúdos de confiança genéricos devem ser tratados como placeholders até validação de negócio.

### Reason
A task era de uma landing page de geração de leads, não de um e-commerce ou aplicação complexa. Nesse cenário, solução estática atende bem e reduz complexidade. Porém, o review mostrou um padrão importante: melhorias extras não compensam falta de evidência objetiva de que hero, benefícios, produtos e CTA WhatsApp estão presentes e funcionando. Também ficou claro que dependências globais como `data-whatsapp` aumentam risco de erro silencioso se não houver proteção.

### Impact
Para tarefas futuras de landing page:
- priorizar primeiro a comprovação dos requisitos mínimos;
- documentar ou implementar fallback para configurações globais críticas, como número de WhatsApp;
- tratar seções extras como complementares, nunca como foco principal do relatório;
- validar responsividade, destaque do CTA no hero e funcionamento real do WhatsApp em mobile/desktop;
- marcar textos comerciais genéricos como placeholder até confirmação do negócio.

### Validation
Foi validado que:
- a abordagem estática permaneceu coerente com o escopo enxuto;
- houve preservação de responsividade e estrutura comercial já existente;
- existia rastreamento de clique no WhatsApp com suporte a UTMs.

O review apontou como critério obrigatório para aceite final:
- evidência clara dos 4 blocos da task;
- teste funcional do CTA de WhatsApp com número e mensagem;
- validação de responsividade real;
- confirmação de que analytics e UTMs funcionam;
- revisão da dependência de `data-whatsapp` com fallback ou documentação.

### Date
2026-05-01