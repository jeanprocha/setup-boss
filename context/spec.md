# Setup Boss — Spec

## Objetivo

Sistema de execução de tarefas assistido por IA, com pipeline estruturado, **artefactos persistidos** e **executor automático** por **PATCH** no projeto alvo (v2.0.0).

O sistema deve:

- compreender o projeto automaticamente (**scan**)
- planear antes de executar (**architect**) e fixar contexto compacto (**`run-context.json`**)
- aplicar alterações no disco via **executor** (**PATCH** validado, **`allowed_files`**)
- validar com **review** estruturado (**`review-output.json`**)
- iterar com **correction** quando o review exigir
- aprender após execução bem-sucedida (**knowledge**)

---

## Escopo

O Setup Boss cobre:

- análise de projeto (**scan**)
- planeamento e geração de **`run-context.json`** (**architect**)
- **execução automática** no disco (**executor** — não reescrita integral de ficheiro pela resposta; schema **`operation: patch`**)
- validação (**review**)
- iteração (**correction** → **executor** → **review**)
- aprendizado (**knowledge**)

---

## Fora de escopo

- substituição do **review** por meras afirmações em texto livre (a decisão operacional do review é **`review-output.json`**, conforme `scripts/review.js`)
- automação de deploy ou CI sem integração explicitamente acrescentada
- garantia de build/test automático sem infraestrutura no projeto alvo (fase futura no roadmap)

---

## Princípios

- **`run-context.json`** como base de contexto reduzido entre **architect**, **executor**, **review**, **correction** e **knowledge** quando válido
- simplicidade de contrato: **PATCH** com **`search`** único no ficheiro
- evidência em disco (**executor-changes.json**, ficheiros alterados) antes de conclusões do review
- aprendizado persistente separado de logs de corrida (**knowledge** vs **run-log**)

---

## Invariantes do executor (código)

- Operação suportada no schema atual: **`patch`**.
- Cada **`search`** deve ocorrer **exactamente uma vez** no conteúdo atual do ficheiro.
- Paths de alteração limitados a **`allowed_files`** (e validações de segurança de caminho em **`scripts/executor.js`**).
