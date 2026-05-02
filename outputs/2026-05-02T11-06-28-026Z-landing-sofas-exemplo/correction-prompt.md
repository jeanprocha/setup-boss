# Correction Prompt

## Objetivo da correção

Implementar de fato a landing page de sofás no arquivo de escopo da task, garantindo que a página contenha hero, benefícios, produtos e CTA WhatsApp no padrão do projeto, preservando a integração existente com `js/main.js` e sem alterar arquivos fora do escopo.

## Problemas apontados no Review

- Não há evidência de implementação da landing page de sofás no código alterado.
- Não há evidência de que a estrutura da página contenha hero, benefícios, produtos e CTA WhatsApp.
- Não há evidência de uso do padrão de CTA WhatsApp do projeto (`data-wa-href` e `data-whatsapp`).
- Não há evidência de preservação da integração com `js/main.js`.
- Há indício de alteração em arquivos fora do escopo da task (`agents/cursor-template.md` e `outputs/.../cursor-prompt.md`).

## Ajustes necessários

- Implementar ou ajustar a landing page no arquivo correto do escopo, preferencialmente `index.html`, reutilizando a estrutura existente se aplicável.
- Garantir a presença explícita das seções:
  - hero
  - benefícios
  - produtos
  - CTA WhatsApp
- Aplicar o padrão de WhatsApp do projeto no CTA com os atributos:
  - `data-wa-href`
  - `data-whatsapp`
- Manter a integração já existente com `js/main.js`, sem remover, quebrar ou substituir a lógica atual.
- Remover do escopo da execução qualquer alteração em arquivos não relacionados à landing page.
- Apresentar evidência objetiva da correção com diff ou trechos finais dos arquivos alterados.

## Instruções para o Cursor

1. Alterar apenas os arquivos necessários para entregar a landing page solicitada.
2. Implementar a landing de sofás no arquivo de página do projeto, preferencialmente `index.html`, sem criar nova arquitetura.
3. Garantir que a página contenha claramente:
   - hero
   - benefícios
   - produtos
   - CTA WhatsApp
4. No CTA WhatsApp, usar obrigatoriamente o padrão do projeto com `data-wa-href` e `data-whatsapp`.
5. Preservar a integração com `js/main.js` exatamente como o projeto espera hoje.
6. Não modificar arquivos de template, agentes, outputs do pipeline ou qualquer outro arquivo fora do escopo da task.
7. Não refatorar estrutura, pastas ou componentes fora do necessário para cumprir os critérios.
8. Ao final, retornar evidência objetiva da implementação:
   - diff dos arquivos alterados
   - ou trechos finais relevantes de `index.html`
   - e indicação explícita de que `js/main.js` permaneceu integrado

## Arquivos prováveis de atuação

- `index.html`
- `js/main.js` apenas se for estritamente necessário para preservar a integração existente, sem alterar comportamento fora da task

## O que não deve ser alterado

- Não alterar `agents/cursor-template.md`.
- Não alterar arquivos em `outputs/...`.
- Não adicionar novas features além da landing solicitada.
- Não criar nova arquitetura ou refatoração ampla.
- Não modificar comportamento não relacionado.
- Não adicionar dependências sem justificativa.
- Não reestruturar pastas.
- Não corrigir warnings não bloqueantes que não sejam necessários para atender ao review.

## Critério de sucesso

- Todos os problemas bloqueantes do Review foram corrigidos.
- Existe evidência clara no código da landing page de sofás implementada.
- A estrutura da página contém hero, benefícios, produtos e CTA WhatsApp.
- O CTA WhatsApp usa `data-wa-href` e `data-whatsapp`.
- A integração com `js/main.js` foi preservada.
- Nenhum arquivo fora do escopo foi alterado.
- O Reviewer consegue aprovar a nova execução.