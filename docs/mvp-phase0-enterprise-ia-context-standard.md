# Fase 0 — Padrão corporativo de contexto IA (MVP)

Documento de fecho da **Fase 0** (subfases **0.1**–**0.5**): onde vive a memória semântica no projeto alvo, como o resolver escolhe o diretório ativo e o que fica fora de âmbito.

---

## Objetivo da Fase 0

Alinhar o Setup Boss e a documentação operacional a um **único padrão de pastas** para conhecimento IA persistente e artefactos por corrida, sem alterar o grafo de execução (DAG), Task Intake nem a lógica de orquestração.

---

## Padrão oficial

- **`docs/.IA/`** no projeto alvo = memória semântica corporativa (ficheiros base `00-`…`10-`, regras locais, etc.).
- **`docs/.IA/outputs/<run-id>/`** = artefactos de uma corrida (metadata, run-context, logs, review, etc.).

---

## Fallback legado

- **`.IA/`** na raiz do projeto alvo = **compatibilidade** com projetos que ainda não têm `docs/.IA/`.
- **`/.IA/outputs/<run-id>/`** = mesma função que `docs/.IA/outputs/…` quando só o legado existe.

---

## Comportamento por cenário (resolver)

| Cenário | Diretório semântico ativo (`iaDir`) |
|--------|-------------------------------------|
| Só existe **`docs/.IA/`** | `docs/.IA` |
| Só existe **`.IA/`** na raiz | `.IA` (legado) |
| **Ambos** existem | **`docs/.IA`** tem prioridade; convém planear remoção ou migração do legado |
| **Nenhum** existe | destino preferido para criação = **`docs/.IA`** (baseline pode criar esta árvore) |

A implementação vive em **`scripts/shared/ia-path-resolver.js`** (e consumidores); este documento não duplica algoritmos.

---

## Artefactos relevantes

| Artefacto | Local típico (padrão) |
|-----------|------------------------|
| Outputs por corrida | **`docs/.IA/outputs/<run-id>/`** |
| Histórico de problemas (append) | **`docs/.IA/09-problem-history.jsonl`** (ou homólogo sob **`.IA/`** se só legado) |

---

## Compatibilidade com runs antigas

- Índices em **`setup-boss/.setup-boss/runs/<run-id>.json`** podem apontar para **`docs/.IA/outputs/...`** ou para **`.IA/outputs/...`** (legado).
- O resolver continua a aceitar ambos para leitura e validação de caminhos; **não há migração automática** de conteúdo entre raiz e `docs/`.

---

## Limites explícitos

- **Não** move ficheiros entre `.IA` e `docs/.IA` automaticamente.
- **Não** apaga a pasta **`.IA`** legada por si só.
- **Não** altera DAG, preflight, orchestration nem contratos de pipeline além do descrito nas fases 0.x.

---

## Subfases 0.1–0.5 (estado)

| Subfase | Foco |
|---------|------|
| **0.1** | Resolver e caminhos canónicos |
| **0.2** | Integração com outputs e índices |
| **0.3** | Consumidores operacionais e preflight |
| **0.4** | Agents, `context/` e prompts (`scan` / `architect`) — narrativa `docs/.IA` + legado |
| **0.5** | Documentação operacional e mensagens **`ensure-ia`** — texto alinhado ao padrão corporativo |

---

## Próximo passo: 0.6

**Validação e regressão final** sobre o padrão `docs/.IA`: revisão de grep residual, consistência entre docs de produto e mensagens de CLI, e confirmação de que nenhum consumidor trata `.IA` na raiz como único caminho suportado.
