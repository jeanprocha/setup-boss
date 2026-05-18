# Discovery técnico: autenticação Git por provider (GitHub e Bitbucket)

**Data:** 2026-05-15  
**Tipo:** discovery (sem implementação)  
**Objectivo:** permitir “conexões Git por provider” com listagem de repositórios privados e clone/registo sem obrigar o utilizador a colar URL com token na UI.

---

## 1. Estado actual do fluxo «Adicionar repositório Git»

### 1.1 Experiência do utilizador

- O botão **«Adicionar repositório Git»** abre o modal `AddProjectDialog`.
- O utilizador cola **URL** (HTTPS ou SSH) e opcionalmente **branch**.
- **«Clonar / Registar»** dispara uma mutação que chama o runtime.

### 1.2 Frontend — componentes e serviços

| Peça | Ficheiro / função | Papel |
|------|-------------------|--------|
| Modal principal | `frontend/components/features/projects/AddProjectDialog.tsx` | URL, branch, estado «Clonando…», erros; registo manual avançado (pasta local). |
| Abrir modal | `frontend/hooks/use-add-project-flow.ts` | Estado `open` + `onRegistered` (invalida queries). |
| Chamada Git | `frontend/hooks/use-register-git-project.ts` | `POST /projects/git/register` com `{ repo_url, branch? }`, timeout 180s. |
| Cliente HTTP | `frontend/lib/api/client.ts` | `runtimePostJson` / proxy Next. |
| Proxy runtime | `frontend/app/api/runtime/[[...segments]]/route.ts` | Encaminha para o daemon; timeout longo para `projects/git/register`. |
| Lista de projectos na sidebar | `frontend_hooks/use-projects.ts` → `fetchRuntimeProjects()` | `GET /projects` após invalidação de `runtimeQueryKeys.root`. |
| Selecção pós-registo | `AddProjectDialog` + `useMissionShellStore` | Em sucesso: `setSelectedProject(projectId)` e fecha o modal. |

### 1.3 Backend — onde o clone corre

| Peça | Ficheiro | Papel |
|------|----------|--------|
| HTTP API do daemon | `scripts/daemon/runtime-api.js` | `POST /projects/git/register`: lê corpo JSON (`pickRepoUrl`: `repo_url`, `repoUrl`, `url`, `repositoryUrl`), chama `registerOrUpdateGitProject({ repoUrl, branch, managedRoot })`. |
| Lógica Git | `scripts/daemon/lib/project-git-register.js` | Normaliza URL (HTTPS / SSH), gera slug de pasta sob `SETUP_BOSS_PROJECTS_DIR`, executa **`child_process.spawn('git', args, { shell: false })`** para `clone` ou `fetch`/`pull --ff-only`. |
| Registo de projecto | `scripts/daemon/lib/project-registry.js` | `upsertProjectFromUsage` → `projects.json` (via `getDaemonDirs().projectsPath`). |
| Pastas geridas | `scripts/daemon/lib/daemon-paths.js` | `getManagedProjectsRoot()` (env `SETUP_BOSS_PROJECTS_DIR` ou defeito em `~/setup-boss-projects`). |
| Log do daemon | `scripts/daemon/lib/daemon-log.js` | Linhas de contexto **sem** URL completo (apenas provider, host, kind, slug, branch) — alinhado com o requisito de não logar credenciais nas mensagens actuais. |

**Conclusão:** O **único** ponto que executa Git é o **daemon** (`project-git-register.js`). O frontend **não** clona; apenas envia URL + branch.

---

## 2. Lacunas face ao objectivo “conexões por provider”

- Não existe conceito de **“conta ligada”** nem armazenamento de credenciais no daemon.
- Não há chamadas às **APIs REST** do GitHub/Bitbucket para listar repositórios ou branches.
- Repositórios **privados** em HTTPS dependem de credenciais já existentes no ambiente (token na URL, credential helper, etc.) ou de SSH com chave local — não há fluxo guiado “conectar → listar → clonar”.

---

## 3. Melhor abordagem para o MVP (PAT / App Password vs OAuth)

### Recomendação MVP: **Personal Access Token (GitHub) + App Password (Bitbucket)**

| Critério | PAT / App Password | OAuth (autorização web) |
|----------|--------------------|-------------------------|
| Complexidade | Baixa: um formulário no daemon/UI, um POST para guardar secret uma vez | Média–alta: redirect URI, client id/secret, armazenamento de refresh token, CSRF/PKCE |
| Tempo até valor | Dias | Semanas (fluxo + revisão de segurança) |
| Superfície de ataque | Secret colado uma vez; risco de phishing se o utilizador for negligente | Tokens de curta/long duração; precisa de modelo de revogação e rotação |
| Alinhamento ao pedido | Cumpre «token/manual seguro» e «frontend só envia uma vez» | Melhor UX, adequado a **fase seguinte** |

**OAuth** deve constar no roadmap como **fase 2+** (PKCE, callback local no daemon ou scheme `setup-boss://`, armazenamento de refresh token com o mesmo rigor que secrets).

---

## 4. Arquitectura proposta (alto nível)

```
┌─────────────────┐     HTTPS (127.0.0.1)      ┌──────────────────────────────┐
│  Next.js UI     │  ─────────────────────────►  │  Daemon runtime-api          │
│  (sem tokens     │   POST /integrations/git/…   │  + módulos provider API      │
│   em memória     │   POST /projects/git/…       │  + cred store                │
│   prolongada)    │                               │  + spawn git clone           │
└─────────────────┘                               └──────────────────────────────┘
                                                            │
                                                            ▼
                                                   GitHub / Bitbucket (HTTPS API + Git)
```

Princípios:

1. **Credenciais só no daemon** — o browser envia o token **uma vez** num endpoint dedicado (TLS local + bind 127.0.0.1, como hoje).
2. **Listagem e clone** usam o token **só no processo daemon** (memória + armazenamento local cifrado).
3. **Git clone** continua com `spawn` + argumentos separados; URL autenticada construída em memória (ex. Basic ou token na URL HTTPS) **nunca** escrita em log/relatório; erros do git **sanitizados** antes de responder ao cliente.

---

## 5. Endpoints sugeridos (incremental)

*Todos no mesmo `runtime-api.js` (ou router extrado), mesma política de bind local.*

### 5.1 Integrações / credenciais

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/integrations/git/github` | Body: `{ pat: string }` ou `{ token: string }`. Valida com `GET /user` ou similar. Persiste credencial cifrada; retorna `{ ok, accountLogin }` sem ecoar token. |
| `DELETE` | `/integrations/git/github` | Revoga/remover credencial armazenada. |
| `POST` | `/integrations/git/bitbucket` | Body: `{ username: string, appPassword: string }`. Valida com API 2.0 (ex. user profile ou workspace list). Persiste par cifrado. |
| `DELETE` | `/integrations/git/bitbucket` | Remove credencial. |
| `GET` | `/integrations/git/status` | Opcional: `{ github: { connected: boolean, login?: string }, bitbucket: { … } }` — só metadados. |

### 5.2 Catálogo (listagens)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/integrations/git/github/repos` | Query: `page`, `per_page`, `visibility?`. Proxy da lista de repos acessíveis ao token. |
| `GET` | `/integrations/git/bitbucket/repositories` | Query: `workspace?`, `page`, `pagelen`. Lista repositórios (workspaces podem vir de `GET /workspaces` prévio). |
| `GET` | `/integrations/git/branches` | Query: `provider`, `repo_key` (ex. `owner/repo` ou `workspace/slug`). Lista branches (GitHub: branches API; Bitbucket: refs/branches na API 2.0). |

### 5.3 Registo / clone (extensão do actual)

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/projects/git/register` | **Extender** body: `provider`, `owner`, `repo`, `branch?` **sem** token — o daemon resolve clone URL e injeta credencial a partir do store. Manter compat com `repo_url` manual. |

Fluxo UI desejado: utilizador escolhe provider → (se não ligado) cola PAT/App Password uma vez → lista repos → branch → **registar** (nova variante de `register`).

---

## 6. Ficheiros que tenderão a mudar (implementação futura)

### Daemon (Node)

- `scripts/daemon/runtime-api.js` — novas rotas + extensão de `POST /projects/git/register`.
- **Novos** (sugestão de nomes):
  - `scripts/daemon/lib/git-integration-store.js` — ler/escrever blob cifrado, versão de schema.
  - `scripts/daemon/lib/crypto-local.js` — AES-256-GCM ou similar; derivação de chave (ver secção 7).
  - `scripts/daemon/lib/github-client.js` — `fetch` com `Authorization: Bearer <PAT>`.
  - `scripts/daemon/lib/bitbucket-client.js` — Basic `username:appPassword`.
  - `scripts/daemon/lib/git-clone-authenticated.js` — montar URL HTTPS segura para `git clone` ou usar `GIT_ASKPASS` auxiliar **só** no subprocesso.

### Frontend

- `frontend/components/features/projects/AddProjectDialog.tsx` (ou wizard novo) — passos: provider → conectar → listar → branch → registar.
- `frontend/hooks/use-git-integration.ts` (novo) — mutações/query para integrações e catálogo.
- `frontend/lib/api/runtime-api.ts` / `client.ts` — novos paths.

### Dados

- Novo ficheiro sob `.setup-boss/` (ex. `integrations/git-credentials.enc.json`) — **nunca** committado; permissões restritas no SO.

---

## 7. Armazenamento local de credenciais

### Requisitos

- Não persistir token **em texto puro** se existir alternativa **simples** no mesmo processo.

### Opções (da mais simples à mais robusta)

1. **Ficheiro cifrado com chave em variável de ambiente**  
   - `SETUP_BOSS_SECRETS_KEY` (32 bytes base64) definida pelo utilizador ou gerada uma vez na primeira configuração e guardada em ficheiro com ACL restrita.  
   - Conteúdo: JSON com `{ v: 1, github: { ciphertext, iv, tag }, bitbucket: { … } }`.

2. **Keyring do SO** (fase posterior)  
   - Windows Credential Manager / macOS Keychain via módulo nativo ou binário auxiliar — melhor UX, mais trabalho de empacotamento.

3. **Só memória**  
   - Inaceitável para MVP de “conectar uma vez”: exigiria reintroduzir token a cada arranque.

**Recomendação discovery:** MVP com **(1)** + documentar rota para **(2)**.

**Proibições:** não incluir tokens em `projects.json`, `daemon.log`, respostas JSON de erro, nem em relatórios exportados.

---

## 8. Como listar repositórios (referência de API)

### 8.1 GitHub

- **Autenticação:** header `Authorization: Bearer <PAT>` (fine-grained ou classic, com scopes adequados: `repo` para privados).
- **Listagem:**  
  - `GET https://api.github.com/user/repos` — repos do utilizador (inclui colaborações conforme token).  
  - Paginação: header `Link` ou query `page`/`per_page`.
- **Branches:**  
  - `GET https://api.github.com/repos/{owner}/{repo}/branches` (paginar se necessário).

Documentação oficial: *REST API — Repositories* e *Authenticate to the REST API*.

### 8.2 Bitbucket Cloud

- **Autenticação:** HTTP Basic com **username Bitbucket** + **App Password** (com scopes `repository:read`, etc.).
- **Workspaces:** `GET https://api.bitbucket.org/2.0/workspaces` (paginado).
- **Repositórios:**  
  - `GET https://api.bitbucket.org/2.0/repositories/{workspace}` ou iterar workspaces.
- **Branches:**  
  - `GET https://api.bitbucket.org/2.0/repositories/{workspace}/{repo_slug}/refs/branches`.

Documentação: *Bitbucket Cloud REST API* (2.0).

---

## 9. Clonar repositório privado sem expor o token

### Estratégias (preferência: evitar que o URL aporra apareça em `argv` observável)

1. **URL HTTPS efémero em memória** passada como último argumento a `git clone` — simples; em alguns SO o processo pode ser inspeccionado; **nunca** logar; sanitizar `stderr` do git (remover linhas com `@` + host).
2. **`GIT_ASKPASS`** — executável/script mínimo que imprime password na stdout; `git` invoca para credenciais; o script lê de env **`SETUP_BOSS_GIT_ASKPASS_SECRET`** definido só para aquele `spawn` e apagado após o comando.
3. **Credential helper one-shot** — `git -c credential.helper=...` com helper que lê de FD ou pipe (mais frágil no Windows).

**Recomendação discovery:** combinar **(2)** ou **(1)** com **sanitização agressiva** de mensagens de erro devolvidas ao cliente (substituir qualquer substring que coincida com padrão `//[^:]+:[^@]+@`).

**SSH com OAuth/PAT** não é o caminho padrão no MVP; manter HTTPS autenticado alinhado às APIs listadas.

---

## 10. Actualização da sidebar após registo

**Já hoje:**

- `useRegisterGitProject` faz `invalidateQueries({ queryKey: runtimeQueryKeys.root })` → `useProjects` volta a pedir `GET /projects`.
- O modal chama `setSelectedProject(projectId)` no sucesso.

**Com fluxo por provider:**

- O `projectId` continua derivado do **caminho local** canónico (`deriveProjectId`); após clone, a resposta de `POST /projects/git/register` já traz `projectId` — mesmo padrão.
- Garantir que a nova variante do registo (por `owner/repo` + provider) devolve o mesmo contrato `data.projectId` para a UI.

---

## 11. Riscos

| Risco | Mitigação |
|-------|-----------|
| Exfiltração de PAT via logs / erro Git | Sanitizar stderr/stdout; nunca ecoar URL com credencial; testes de regressão em mensagens de erro. |
| Token armazenado recuperável em disco | Cifrar em repouso; permissões de ficheiro; documentar rotação e `DELETE` de integração. |
| Utilizador cola PAT na UI num computador partilhado | Aviso na UI; opcional “desligar integração” em saída. |
| Escopos insuficientes / token expirado | Respostas claras (401/403) mapeadas para «token inválido ou sem permissão» sem devolver corpo da API cru com segredos. |
| Rate limiting GitHub/Bitbucket | Paginação conservadora; cache curta opcional no daemon para listagens. |
| Compliance | Não enviar tokens para o Next em builds analytics; sem relatórios automáticos com payload de integração. |

---

## 12. Plano de implementação incremental

1. **Fase A — Armazenamento**  
   - Ficheiro cifrado + `POST`/`DELETE` GitHub/Bitbucket mínimos; `GET /integrations/git/status` sem secrets.

2. **Fase B — Validação de credencial**  
   - Após gravar, chamada de validação à API do provider; normalizar erros.

3. **Fase C — Listagens**  
   - `GET` repos + branches para GitHub; idem Bitbucket com workspaces.

4. **Fase D — Clone autenticado**  
   - Estender `registerOrUpdateGitProject` (ou wrapper) para modo `provider + full_name` usando credencial do store + `GIT_ASKPASS` ou URL efémera.

5. **Fase E — UI**  
   - Wizard no `AddProjectDialog` (ou componente dedicado); manter modo manual URL/SSH existente.

6. **Fase F — OAuth**  
   - Desenho PKCE + registo de aplicação GitHub/Bitbucket; troca de code server-side no daemon.

---

## 13. Respostas directas ao brief

| Pergunta | Resposta resumida |
|----------|-------------------|
| Melhor MVP: PAT/App Password ou OAuth? | **PAT + App Password** para MVP; OAuth como fase seguinte. |
| Quais ficheiros mudam? | `runtime-api.js`, novo store + clients provider, extensão `project-git-register` / clone auth, UI + hooks (secção 6). |
| Quais endpoints? | Secção 5 (`/integrations/git/...`, extensão `/projects/git/register`, opcional `/integrations/git/branches`). |
| Como armazenar localmente? | JSON cifrado sob `.setup-boss/` + chave derivada/env; evoluir para keychain (secção 7). |
| Listar repos GitHub? | REST `user/repos` com `Authorization: Bearer` (secção 8.1). |
| Listar repos Bitbucket? | REST 2.0 `repositories/{workspace}` com Basic + App Password (secção 8.2). |
| Clonar sem expor token? | `GIT_ASKPASS` ou URL efémera + sanitização de erros; sem logs (secção 9). |
| Sidebar após registo? | Invalidação `useProjects` + `setSelectedProject` — já existente; manter contrato (secção 10). |
| Riscos? | Exfiltração, disco, scopes — secção 11. |
| Plano incremental? | Secção 12. |

---

*Documento gerado no âmbito de discovery; nenhuma alteração de código foi efectuada na elaboração deste ficheiro.*
