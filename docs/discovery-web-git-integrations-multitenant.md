# Discovery técnico: integrações Git web-first e multi-tenant

**Data:** 2026-05-15  
**Tipo:** discovery (sem implementação nesta etapa)  
**Relacionado:** `docs/discovery-git-provider-auth-github-bitbucket.md` (MVP local/daemon; este documento **reavalia** o desenho para servidor web, multiusuário e múltiplas contas por provider)

---

## Visão de produto

O **Setup-Boss** deixa de ser concebido como “ferramenta cujo Git vive só no daemon da máquina do utilizador” e passa a ter um eixo **web/servidor**, integrável ao **System Wiser Wiki**: utilizadores acedem ao Setup-Boss **dentro** do Wiki, ligam **N contas** por provider (GitHub, Bitbucket, GitLab, …), e o produto **clona, ramifica, edita, faz commit/push** e (em fases posteriores) abre **PR/MR** em nome da **conta** escolhida para aquela atividade — com **isolamento forte** entre tenants e entre utilizadores.

**Princípio:** credenciais e workspaces são **recursos de serviço** (ou “edge” controlado), não “config local opaque”; o modo **local MVP** mantém-se como **perfil de implantação** do mesmo **contrato** de domínio (tenant, utilizador, conta Git, repositório, projeto, workspace, execução).

---

## 1. Arquitetura: separação de responsabilidades

| Componente | Responsabilidade principal |
|------------|----------------------------|
| **System Wiser Wiki** | Autenticação e contexto do utilizador final (SSO/sessão Wiki), **tenant** (organização) e redireccionamento/embed do Setup-Boss; opcionalmente políticas (quem pode ligar contas Git, quotas). Não executa Git. |
| **Setup-Boss frontend** | UI: Integrações (ligar contas), escolha de repo/branch, missões, timeline visual; envia apenas **referências** (IDs de conta, repo, branch) e **não** persiste segredos em `localStorage` de forma prolongada. |
| **Setup-Boss runtime** (servidor) | API BFF + orquestração: valida **sessão Wiki↔Setup-Boss**, resolve tenant/user, chama **Git Account service**, agenda **workspace jobs**, expõe estado de execução. |
| **Git workers / execução** | Processos isolados que correm `git` + ferramentas; filesystem **sandboxed** por workspace; sem shell interpolado em URLs ou argumentos. |
| **Git providers** (GitHub, Bitbucket, GitLab) | OAuth/App, APIs REST para catálogo/PR, operação Git HTTPS/SSH sobre rede. |
| **Armazenamento de credenciais** | **Cofre** (KMS, envelope encryption, HSM onde aplicável): tokens por `git_account_id`; acesso só via serviço com identidade de workload; auditoria de leitura. |
| **Workspace de repositórios** | Armazenamento efémero ou semi-persistente em disco/objeto por `(tenant, projeto, execução ou branch de trabalho)`; quotas e TTL. |

Fluxo lógico (alto nível):

```
Wiki (auth + tenant) → Setup-Boss FE → Setup-Boss API (BFF)
                                              ↓
                        Git Account Service ← Cofre de tokens
                                              ↓
                        Workspace Orchestrator → Worker(s) → git clone/fetch/branch/commit/push
                                              ↓
                        Providers (HTTPS API + Git)
```

### O MVP deve continuar a correr local?

**Sim**, como **perfil** “single-tenant single-user”: o mesmo modelo conceptual (conta, repo, projeto, workspace) aplica-se; a implementação local fixa `tenant` e `user` implícitos, usa bind `127.0.0.1` e cofre em disco cifrado — **sem** bifurcar o modelo de dados de negócio em dois mundos incompatíveis.

### Compatibilidade local ↔ web

- **Contratos estáveis:** APIs e eventos usam IDs de `GitAccount`, `RemoteRepository`, `Project`, `Workspace`, `Run` — não “só URL colada”.
- **Dois modos de auth:** modo Wiki passa JWT/cookie de confiança mútua; modo local passa sessão local ao runtime (como hoje), mapeando para um **utilizador local sintético**.
- **Feature flags / capability:** `integrations.multiAccount`, `git.managedWorkspace`, `git.push`, `git.prAutomation` por deployment.
- **Migration path:** projectos hoje registados por `repo_url` tornam-se `RemoteRepository` “manual” ou migrados para uma `GitAccount` “ambient” (credenciais do SO) apenas no perfil local — documentar limitações.

---

## 2. Modelo multi-tenant

### Entidades conceptuais (sugestão)

| Entidade | Descrição | Chave de isolamento |
|----------|-----------|---------------------|
| **Tenant** | Empresa/organização no Wiki (ou implícita no local). | `tenant_id` em todas as linhas graváveis. |
| **User** | Utilizador humano; identidade provém do Wiki (ou local). | `user_id` + `tenant_id`. |
| **GitProvider** | Enum: `github`, `bitbucket`, `gitlab`, … | — |
| **GitAccount** (conta ligada) | Uma credencial + identidade remota (login, emails, ids numéricos do provider). **N por user por provider.** | `tenant_id`, `user_id`; nunca partilhada entre users. |
| **RemoteRepository** | Repo remoto normalizado (`owner`, `name`, `clone_url_template`, `default_branch`, `provider_repo_id`). Pode existir antes de haver projeto. | Visível só via `GitAccount` que tem acesso (listagem/API) ou via registo explícito autorizado. |
| **Project** (Setup-Boss) | “Projeto de automação” no Setup-Boss: metadados, políticas, ligação a um `RemoteRepository` (opcional no MVP antigo). | `tenant_id`; dono/equipa conforme RBAC. |
| **Workspace** | Árvore Git no servidor (ou cache) para um dado contexto: tipicamente `(project_id, run_id)` ou `(project_id, activity_branch_id)`. | Path e credencial derivados do `GitAccount` escolhido para essa operação. |
| **ActivityBranch** (ramo de trabalho) | Nome/canonical branch associada a uma tarefa/execução; rastreia upstream e estado. | Referência em `Run` ou entidade filha. |
| **Run** (execução/corrida) | Instância de execução; referencia `project_id`, `workspace_id?`, commits, eventos de timeline. | `tenant_id`, `user_id` (actor). |

### N contas por provider por utilizador

- Modelar `GitAccount` como linha única por `(tenant_id, user_id, provider, external_account_id)` ou permitir **várias** com `display_label` (“pessoal”, “empresa A”) quando o provider não distingue bem — unicidade tratada por `oauth_account_id` ou par `(login, provider)` conforme API.
- A UI escolhe **qual** `GitAccount` usar ao listar repos, ao registar projeto e ao executar.

### Impedir acesso cruzado a repositórios

- **Todas** as operações passam por: `(tenant_id, user_id)` validados no BFF a partir da sessão Wiki (ou local).
- `GitAccount` só é legível pelo **dono** (e roles admin do tenant, se existirem); workers recebem **apenas** handles opacos ou tokens efémeros gerados para aquela operação.
- Listagens de repo: sempre via token da **conta selecionada**; cache de catálogo etiquetado por `git_account_id`.
- Autorização ao nível de **projeto**: associar `project` → `remote_repository_id` **só** se o user provou acesso (listou naquela conta ou é admin).

---

## 3. Autenticação Git

### Comparação (resumo)

| Abordagem | Prós | Contras | Adequação web multi-tenant |
|-----------|------|---------|----------------------------|
| **PAT / App Password** | Simples; bom para MVP; fácil de revogar no provider | UX fraca; segredos sensíveis a phishing; rotação manual | OK **MVP controlado** |
| **OAuth App (user)** | UX standard; refresh tokens | Gestão de client secret; redirect URLs por ambiente; consentimento | **Recomendado** pós-MVP |
| **GitHub App** | Permissões finas; curto-lived tokens; escalável | Modelo mental mais complexo; instalação por org | **Produção GitHub** preferível |
| **Bitbucket OAuth / App Password** | OAuth melhora UX; App Password fallback | Bitbucket Cloud vs Server divergem | OAuth produção; password legado |
| **GitLab OAuth / PAT** | OAuth maduro; PAT com scopes | Mesmas considerações de armazenamento | OAuth produção |

### MVP web: o que usar

- **Curto prazo:** OAuth **com PKCE** para apps “user-owned” **ou** PAT/App Password **colado uma vez** apenas em ambiente já considerado seguro (HTTPS, sem echo no cliente), com validação server-side e armazenamento no cofre — alinhado ao discovery local, mas **sem** afirmar que o segredo “vive no daemon”; vive no **serviço de contas**.
- **GitHub:** preferir já **GitHub App** se o tempo permitir; senão OAuth App user para MVP.
- **Bitbucket / GitLab:** OAuth user como trilho principal; PAT/App Password como fallback documentado.

### Produção: trilho correcto

- **GitHub:** **GitHub App** com instalação por org/user + **installation access tokens** de curta duração.
- **GitLab:** OAuth + **project/group tokens** conforme modelo de permissões; runners com **token efémero** por job onde possível.
- **Bitbucket:** OAuth; App Passwords desencorajados excepto legado/enterprise.

### Refresh e revogação

- OAuth: refresh rotativo, revogação no provider e **soft-delete** local da conta; jobs activos invalidados.
- GitHub App: tokens de instalação apenas em memória/volatile cache com TTL.
- PAT: detecção de `401` → estado `invalid` na conta; UI pede relink.

### Armazenamento seguro

- **Nunca** logar tokens nem URLs com credencial.
- Cofre com **envelope** (KMS): ciphertext em DB + DEK por registo.
- Opcional: **External Secrets Manager** (AWS/GCP/Azure) em produção.
- Acesso worker: **sts-token** ou injecção efémera só durante o clone/push.

---

## 4. Operação Git

| Tópico | Abordagem |
|--------|-----------|
| **Clonar privado no servidor** | Worker usa HTTPS com credencial resolvida server-side (token efémero) ou SSH deploy key **por repo** (mais overhead); MVP HTTPS. |
| **Isolar workspaces** | Paths únicos: `/{tenant}/{project}/{run}/workspace` ou hash; **sem** partilha de diretório entre users; `umask` / ACL / container. |
| **Branch por atividade** | Convenção: `setup-boss/{run_short_id}/{slug}` ou prefixo configurável; criar a partir de `base_branch` fixada no projeto. |
| **Sincronizar branches** | `fetch` + `merge`/`rebase` policy explícita; para evitar surpresas: **rebase opcional** ou **merge --no-ff**; bloquear se divergência não resolvível → evento na timeline. |
| **Concorrência no mesmo projeto** | Lock distribuído **por `(project_id, base_branch)`** ou por `remote_repository` para operações mutáveis; filas; ou **um workspace por run** com merge manual na PR. |
| **Commit/push** | Identidade Git: `user.name` / `user.email` do Wiki ou da `GitAccount`; signed commits opcional fase posterior. |
| **PR/MR** | REST: GitHub `pull_requests`, Bitbucket `pullrequests`, GitLab `merge_requests`; ligar URL ao `Run`. |
| **Repos grandes** | **Shallow clone** (`--depth`), **sparse checkout** se aplicável, **Git LFS** policy por tenant, timeouts e limites de tamanho; streaming logs sem listar ficheiros sensíveis. |

---

## 5. Segurança

| Risco | Mitigação |
|-------|-----------|
| **Exposição de tokens** | Cofre, tokens de curta duração, nunca enviar de volta ao browser após gravação. |
| **Logs/relatórios** | Sanitização de stderr Git, redacção de URLs, política de observabilidade “denylist”. |
| **Command injection** | `spawn` com `shell: false`; args como array; validação estrita de branch/repo; sem concatenação de input utilizador em comando. |
| **Filesystem** | Chroot/containers; quotas; **sem** acesso à raiz do host; apenas paths permitidos. |
| **Limpeza de workspaces** | TTL + job de GC; apagar após `Run` terminal ou após retenção N dias. |
| **Auditoria** | Eventos: `git.account.linked`, `repo.clone`, `branch.create`, `commit`, `push`, `pr.open` com `tenant_id`, `user_id`, `run_id`, **sem** segredos. |
| **RBAC** | Papéis tenant-wide: quem pode ligar contas, executar push, aprovar PRs automáticas. |

---

## 6. Impacto no fluxo e UX actuais

### “Adicionar projeto”

- Deixa de ser só “colar URL” como caminho feliz: passa a **escolher conta Git** → **listar repos** → **branch** → **confirmar** (mantendo URL manual como **avançado/fallback local**).
- Associação explícita `Project` → `RemoteRepository` + `default_git_account_id` (ou conta por run).

### Sidebar esquerda

- Secção **Projectos**: indica estado (ligado a Git? conta?); opcional icon do provider.
- Indicadores de **conta activa** ou aviso se projeto sem conta com permissão.

### Tela **Integrações**

- Lista **múltiplas contas** por provider (cartões com label, login, última validação).
- Acções: ligar, testar, remover; entrada para **políticas** (fase posterior).
- Não mostrar tokens; estados `connected | expired | error`.

### Timeline / execução visual

Eventos explícitos e ordenados: `clone_started` → `branch_created` → `files_changed` (agregado) → `commit` → `push` → `pr_opened` (link); falhas com código **sem** stderr cru.

### Fallback local/manual (MVP actual)

- Manter fluxo URL + branch com aviso de credenciais via ambiente.
- Registar como `GitAccount` tipo `system` ou `manual_url` com política **local-only**.

---

## 7. MVP vs produção (síntese)

| Aspeto | MVP (web/local unificado conceptualmente) | Produção |
|--------|---------------------------------------------|----------|
| Auth | OAuth user ou PAT; local pode usar credenciais OS | GitHub App, OAuth robusto, tokens efémeros |
| Multi-conta | Suportado no modelo desde dia 1 | Igual + quotas e auditoria |
| Workspace | Servidor ou daemon local isolado | Cluster workers + storage persistente tiered |
| PR | Manual ou botão único | Políticas, templates, revisores |
| Multi-tenant | Um tenant implícito no local; Wiki = fonte de tenant | Isolamento completo + KMS |

---

## Riscos

- **Complexidade OAuth** por ambiente (Wiki embed, redirect URIs).
- **Concorrência Git** em equipas grandes sem locks claros.
- **Custos de storage** com muitos clones completos.
- **Compliance** (segredos em repartições erradas) se o cofre não for obrigatório desde cedo.
- **Divergência** API GitLab.com vs self-hosted.

---

## Decisões recomendadas

1. Tratar **GitAccount** como entidade de primeira classe **ligada a (tenant, user)** — não “config do daemon”.
2. Introduzir **BFF servidor** como único falador com cofre e workers; frontend só vê metadados.
3. Adoptar **OAuth + cofre** como meta; PAT apenas **ponte** documentada.
4. **GitHub App** como alvo GitHub em produção; GitLab/Bitbucket OAuth.
5. **Locks ou fila** por repo/projeto para operações mutáveis; workspaces por `run`.
6. Manter **URL manual** como compatibilidade, não como arquitectura principal.
7. **Timeline** como contrato de observabilidade estável entre local e Wiki.

---

## Plano incremental (fases)

| Fase | Entrega |
|------|---------|
| **1** | MVP local mantido; **contratos** de domínio `provider` / `git_account` / `remote_repository` / `project` na API e estado FE (sem obrigar multi-tenant real). |
| **2** | Tela **Integrações** web-first: múltiplas contas, OAuth ou PAT conforme deployment. |
| **3** | Listar repositórios **por conta** (APIs dos providers). |
| **4** | Registar **projeto** a partir de repo remoto seleccionado (não só URL). |
| **5** | **Workspace Git gerido** no servidor: clone isolado, política de TTL. |
| **6** | **Branch por atividade** automatizada + eventos na timeline. |
| **7** | **Commit/push** com identidade e validação de permissões. |
| **8** | **PR/MR** automático + ligação ao `Run`. |
| **9** | Integração **System Wiser Wiki** com multi-tenant real (SSO, quotas, embed). |

---

## Critérios de aceite (primeira implementação pós-discovery)

A “primeira implementação” sugerida alinha com **Fase 1–2**:

1. **Modelo de dados** (conceitual ou migrado): é possível representar pelo menos uma `GitAccount` por `(tenant, user, provider)` com `display_label` e `external_login` sem armazenar token em claro.
2. **API**: endpoints ou extensão coerente para **criar/remover** conta e **consultar estado** (`connected`, `last_verified_at`) sem eco de segredo.
3. **FE**: tela Integrações lista contas por provider e permite adicionar/remover (fluxo seguro).
4. **Compatibilidade**: fluxo actual `repo_url` + branch continua funcional no perfil **local** (regressão zero para utilizadores sem OAuth).
5. **Segurança**: política escrita: logs sem credenciais; validação de inputs Git; ameaças de command injection documentadas como mitigadas em `spawn` array args.
6. **Documento de transição**: mapping explícito de projectos legados → novo modelo (`RemoteRepository` manual vs conta).

---

## Referência cruzada

Para detalhes já mapeados ao código actual (daemon, `AddProjectDialog`, `project-git-register.js`), ver `docs/discovery-git-provider-auth-github-bitbucket.md`. Este documento **não** o invalida: **redefine o alvo arquitectural** para o qual esse MVP local deve convergir.
