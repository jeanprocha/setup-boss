# Setup Boss — Agents governance

## Objetivo

Regras para criar, manter e desativar **agents** (ficheiros Markdown em `agents/` consumidos pelos scripts).

Objetivo: evitar proliferação, sobreposição de papéis e pipeline imprevisível.

---

## Princípio central

Um agent novo só entra se **melhorar** o pipeline de forma clara.

Agents demais aumentam custo (tokens), ambiguidade e superfície de manutenção.

---

## Distinção importante

- **Agent** — texto de sistema/papel carregado por um script (`loadAgent`, etc.).
- **Artefacto de pipeline** — JSON gerado por código (ex.: **`run-context.json`**). Não é um agent; não deve ser confundido com um novo ficheiro em `agents/` sem necessidade.

---

## Regra oficial para criação de agents

Um novo agent só é aceitável se:

1. Responsabilidade **única**
2. Reduz repetição **real** no pipeline (ou custo mensurável)
3. Input bem definido (ficheiros, secções, JSON)
4. Output bem definido (Markdown e/ou schema JSON quando aplicável)
5. Critério de sucesso objetivo
6. Não duplica um agent existente
7. Não existe só para “organizar texto”
8. Não existe só por preferência estética

Se falhar qualquer ponto → não criar.

---

## Checklist antes de criar um novo agent

```text
1. Qual problema real resolve?
2. Esse problema já apareceu mais de uma vez?
3. Qual agent atual não cobre isso?
4. Qual é a responsabilidade única?
5. Qual input exato?
6. Qual output exato?
7. Como saber que funcionou?
8. O que acontece se não existir?
9. Reduz ou aumenta complexidade?
10. Poderia ser só uma secção num agent existente?
```

---

## Alinhamento com o código atual

- O pipeline oficial passa por **run-context**, **executor PATCH**, review JSON e correction; prompts dos agents devem permanecer **compatíveis** com os schemas e validações dos scripts (alterações exigem mudança coordenada em código + doc).
- Mudanças que só “empurrem mais contexto” para o modelo sem ganho verificável tendem a **aumentar custo** — preferir evolução em **artefactos** (`run-context`) e **código**, não só texto novo em `agents/`.
