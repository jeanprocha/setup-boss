# Mission Control — painel «Arquivos do chat»

## Objectivo

Expor na UI do Mission Control os **ficheiros reais** gravados pelo runtime no **output dir** da corrida (`resolveOutputDir` → tipicamente `docs/.IA/outputs/<runId>/`), sem hardcode de nomes e sem acesso directo ao filesystem pelo browser.

## Arquitectura

| Camada | Papel |
|--------|--------|
| **Daemon HTTP** | `GET /runs/:runIdOuJobId/evidence` — lista derivada de walk recursivo do output dir (limite `MAX_ARTIFACTS` / profundidade no `run-evidence.js`). |
| **Daemon HTTP** | `GET /runs/:runIdOuJobId/artifacts/:artifactId` — conteúdo read-only (texto: json, md, txt, log, ndjson; binário devolve `unsupported`). |
| **Next.js** | Proxy `/api/runtime/*` → mesmo host do daemon (já existente). |
| **Frontend** | Aba **«Arquivos do chat»** no painel direito: `useRunEvidence` + `useArtifactContent`, reutiliza `ArtifactsExplorer` / `ArtifactViewer`. |

Não foi criado endpoint novo: o contrato de evidência já cobria listagem + leitura com validação de paths (`isSafeRelativePath`, jail sob `outputDir`).

## Fluxo UX

1. Utilizador abre o painel direito (ícone de definições / timeline).
2. Aba **Execução** — navegação por passos (inalterada em conteúdo).
3. Aba **Arquivos do chat** — lista agrupada por **categoria inferida** a partir do caminho (mesma lógica que o explorador inferior), com **tamanho**, **mtime** (`modifiedAt` → rótulo pt-PT) e badges de estado.
4. Clique num ficheiro → preview em baixo (markdown renderizado, JSON pretty, texto mono).
5. **Copiar** / **Download** — mesmo comportamento do `ArtifactViewer`.
6. Actualização periódica: invalidação da query de evidência ~28s enquanto o painel está montado.

Ao fechar o painel direito, a aba volta para **Execução** (evita abrir sempre em «Arquivos»).

## Tipos suportados (preview)

- **Markdown** — `ReactMarkdown` (mesmo stack que o viewer de evidência).
- **JSON** — pretty-print quando parseável.
- **TXT / LOG / NDJSON** — bloco `<pre>` monoespaçado.
- **Outros** — mensagem «tipo binário ou não suportado»; metadados e download ainda úteis se no futuro o API devolver bytes/base64.

## Segurança

- Path traversal bloqueado no daemon (`..`, absolutos, fora do `outputDir`).
- UI **nunca** monta paths locais; só `artifactId` estável (hash do `relativePath`) e `runId`/`jobId` resolvido como nas outras rotas `/runs/...`.

## Limitações MVP

- Listagem limitada a `MAX_ARTIFACTS` (200) e profundidade máxima no walk — o painel mostra aviso quando `truncatedListing` vem true na resposta.
- Leitura de conteúdo truncada por `MAX_READ_BYTES` / `MAX_CONTENT_CHARS` no daemon (igual ao fluxo de evidência).
- JSON sem árvore colapsável — pretty-print apenas; evolução possível (Monaco / react-json-view).

## Próximos passos sugeridos

- SSE ou invalidação dirigida quando o runtime escreve ficheiros novos.
- Endpoint dedicado só metadados (payload mais leve que `evidence` completo).
- Preview YAML / diff para patches.

## Testes

- **Backend:** `node --test scripts/daemon/lib/run-evidence.test.js` (inclui `modifiedAt` em summaries).
- **Frontend:** `npx tsc --noEmit` no pacote `frontend`.
