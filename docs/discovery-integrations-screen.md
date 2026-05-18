# Discovery técnico: tela **Integrações** (Setup-Boss)

**Data:** 2026-05-15  
**Modo:** apenas análise e plano — **sem alteração de código funcional** nesta etapa.

---

## 1. Diagnóstico do estado atual

### 1.1 Frontend — estrutura de rotas e shell

| Peça | Local | Observação |
|------|--------|------------|
| Entrada da app | `frontend/app/page.tsx` | Renderiza apenas `AppShell` — **SPA de página única** (`/`). |
| Layout global | `frontend/app/layout.tsx` | Providers + estilos; sem sub-rotas de UI hoje. |
| Shell principal | `frontend/components/regions/AppShell.tsx` | Orquestra chrome, sidebar de projectos, `RunViewShell`, painel direito (timeline). |
| Cabeçalho | `frontend/components/regions/AppChrome.tsx` | Toolbar com estado API, refresh, **ícone Settings2**, tema. |

**Descoberta relevante:** o botão com `aria-label` ligado ao painel de execução (`"Painel de navegação da execução"`) chama hoje `onSettings` → **`toggleRightTimeline()`** — ou seja, **não abre configurações**; abre/fecha o painel lateral da timeline. Para «Integrações» é necessário **desacoplar** este comportamento: novo botão «Integrações» ou reatribuir ícones (ex.: Settings → integrações; outro ícone para timeline).

### 1.2 Fluxo Git actual (contexto para reuso)

| Peça | Papel |
|------|--------|
| `AddProjectDialog` | URL manual + branch; registo manual de pasta (avançado). |
| `useRegisterGitProject` | `POST /projects/git/register` com `{ repo_url, branch? }`. |
| Daemon `project-git-register.js` | Clone/pull via `spawn('git', …)`; registo em `projects.json`. |

**Não existe** ainda: armazenamento de credenciais no daemon, rotas `/integrations/...`, nem catálogo de repositórios por provider. O discovery [git provider auth](./discovery-git-provider-auth-github-bitbucket.md) complementa este documento.

### 1.3 Comunicação com o runtime

- UI → `frontend/lib/api/*` → proxy `app/api/runtime/[[...segments]]/route.ts` → daemon `scripts/daemon/runtime-api.js` (bind local).

---

## 2. Proposta de arquitectura

### 2.1 Visão geral

```
┌─────────────────────────────────────────────────────────────┐
│  Integrações (UI) — lista de cards por provider              │
│  GitHub | Bitbucket | (GitLab futuro) | (Jira/Trello/Notion) │
└───────────────────────────┬─────────────────────────────────┘
                            │  HTTPS 127.0.0.1 (sem persistir token no browser)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Daemon: runtime-api                                         │
│  • GET  /integrations        → metadados (conectado ou não)   │
│  • POST /integrations/github  → PAT uma vez → cifrar → disco  │
│  • POST /integrations/bitbucket → user + app password         │
│  • DELETE /integrations/:id   → revogar localmente            │
│  • POST /integrations/:id/test → ping API provider           │
│  (futuro) GET …/repos, …/branches                             │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
                   Armazenamento local cifrado + chamadas Git/API
```

- **Frontend:** só envia secrets em **POST** pontuais; respostas contêm apenas `connected`, `accountLabel`, mensagens de teste **sem** eco de token ou URL autenticada.
- **Daemon:** única fonte de verdade para credenciais; Git clone/listagens usam o store (fase posterior no «Adicionar projeto»).

### 2.2 Extensibilidade (GitLab, Jira, Trello, Notion)

- Modelo de dados com `providerId` + `kind` (`git_host`, `work_management`, `docs`).
- UI: grelha de cards «Disponíveis» vs «Brevemente» para providers não implementados.
- Endpoints versionados por prefixo: `/integrations/providers/github/...` evita colisão com futuros tipos.

---

## 3. UX da tela de Integrações

### 3.1 Acesso

- **Header:** ícone dedicado (ex.: `Plug`, `Link2` ou `Settings2` **só** para integrações) com `aria-label="Integrações"`.
- **Alternativa:** item no menu dropdown se o header ficar carregado.
- **Rota sugerida:** `GET /integrations` (Next.js App Router) **ou** painel lateral full-height (Sheet) — ver secção 4.

### 3.2 Conteúdo MVP

1. **Título:** «Integrações»
2. **Subtítulo:** «Ligue contas externas para clonar repositórios privados e automatizar fluxos.»
3. **Lista de providers** (cards):
   - **GitHub:** estado Conectado / Não conectado; último teste OK/falha (data opcional); botões **Conectar** (abre formulário PAT), **Testar**, **Desligar**.
   - **Bitbucket:** idem com **username + App Password**.
   - **GitLab, Jira, Trello, Notion:** card desactivado com selo «Em breve».
4. **Formulário conectar** (modal ou inline):
   - Campos password/masked; texto de ajuda com links para criar PAT/App Password.
   - Checkbox/aviso: «O token é enviado uma vez ao daemon neste computador e não fica guardado no browser.»
5. **Testar conexão:** feedback inline («A testar…» → sucesso ou mensagem genérica sem corpo bruto da API).

### 3.3 Ligação futura ao «Adicionar projeto»

- Em `AddProjectDialog`, passo opcional: «Escolher da conta GitHub/Bitbucket» só se integração **conectada** (dados de `GET /integrations`).
- Listagem de repos/branches servida pelo daemon (fases posteriores).

---

## 4. Onde criar página/modal no projeto

| Abordagem | Prós | Contras |
|-----------|------|---------|
| **A) Rota `app/integrations/page.tsx`** | URL partilhável; histórico browser; claro para documentação. | Exige layout mínimo ou reutilizar chrome; utilizador «sai» da vista mission por instantes (ou layout com shell partilhado). |
| **B) Sheet/Modal global** em `AppShell` + estado Zustand (`integrationsOpen`) | Mantém utilizador no mesmo ecrã; rápido de integrar. | Menos óbvio para deep-link. |

**Recomendação discovery:** **A** (`/integrations`) com layout que **reutiliza** `AppChrome` + sidebar opcionalmente colapsada, para consistência com «área centralizada»; ou **B** se o produto quiser zero navegação. Em ambos os casos, o **ícone no header** abre a experiência (navigate ou `openIntegrations()`).

**Ficheiros prováveis (implementação futura, não feita agora):**

- `frontend/app/integrations/page.tsx` (se rota)
- `frontend/components/features/integrations/IntegrationsPage.tsx` (conteúdo)
- `frontend/components/features/integrations/ProviderConnectCard.tsx`
- `frontend/hooks/use-integrations.ts` (queries/mutations)
- Ajuste em `AppChrome.tsx` para abrir integrações em vez de (ou além de) timeline

---

## 5. Endpoints propostos no daemon

Prefixo sugerido: `/integrations` (todos JSON, `POST` com corpo pequeno, mesmos limites de body que hoje).

| Método | Rota | Função MVP |
|--------|------|------------|
| `GET` | `/integrations` | Lista **metadados** por provider: `{ id, provider, connected, accountHint?, lastTestAt?, lastTestOk? }` — **sem** secrets. |
| `POST` | `/integrations/github` | Body: `{ pat: string }`. Valida com API GitHub; persiste credencial cifrada; resposta `{ ok, accountLogin }`. |
| `POST` | `/integrations/bitbucket` | Body: `{ username, appPassword }`. Valida API 2.0; persiste par cifrado. |
| `DELETE` | `/integrations/github` | Remove credencial GitHub local. |
| `DELETE` | `/integrations/bitbucket` | Remove credencial Bitbucket local. |
| `POST` | `/integrations/github/test` | Revalida PAT (opcionalmente sem gravar). |
| `POST` | `/integrations/bitbucket/test` | Revalida App Password. |

**Fase seguinte** (alinhada ao «Adicionar projeto»):

| Método | Rota |
|--------|------|
| `GET` | `/integrations/github/repos?…` |
| `GET` | `/integrations/bitbucket/repositories?…` |
| `GET` | `/integrations/github/branches?owner=&repo=` |
| etc. | |

**OAuth (evolução):** `GET /integrations/github/oauth/start`, `GET /integrations/github/oauth/callback` (callback **no daemon** ou via loopback) — documentado, não MVP PAT.

**CORS / OPTIONS:** seguir o padrão actual do `runtime-api.js` para rotas novas.

---

## 6. Modelo de dados local (daemon)

### 6.1 Ficheiro sugerido

- Localização: sob `getDaemonDirs().setupBossDir`, ex. **`integrations/credentials.enc.json`** (ou blob único).
- **Não** misturar com `projects.json` (evita vazamento acidental em exportações de projectos).

### 6.2 Forma lógica (após desencriptar em memória)

```json
{
  "schemaVersion": 1,
  "providers": {
    "github": {
      "type": "pat",
      "encrypted": { "iv": "…", "ciphertext": "…", "tag": "…" },
      "accountLogin": "octocat",
      "createdAt": "ISO",
      "updatedAt": "ISO"
    },
    "bitbucket": {
      "type": "app_password",
      "encrypted": { "…" },
      "username": "user",
      "createdAt": "ISO",
      "updatedAt": "ISO"
    }
  }
}
```

- `accountLogin` / `username` são **não secretos**; o segredo só dentro de `encrypted`.
- Opcional: não guardar nem `accountLogin` em disco até primeiro teste bem-sucedido.

---

## 7. Estratégia segura de armazenamento

| Requisito | Abordagem sugerida |
|-----------|-------------------|
| Não texto puro | AES-256-GCM (Node `crypto`) sobre JSON serializado do secret. |
| Chave mestra | Env `SETUP_BOSS_INTEGRATIONS_KEY` (32 bytes base64url) **ou** ficheiro `integrations/.key` gerado na primeira gravação com permissões restritas (OS). |
| Rotação | Versão de schema + migração; botão «Desligar» apaga ciphertext. |
| Logs / erros | Nunca imprimir `pat`, `appPassword`, nem URLs `https://x-access-token:…@`; sanitizar `stderr` do `git` e corpos de erro HTTP upstream. |
| Relatórios | Proibir inclusão automática do ficheiro `credentials.enc.json` em exportações. |
| Frontend | **Não** `localStorage` / `sessionStorage` para tokens; React state só durante digitação até enviar POST. |

Evolução: integrar com **keychain** do SO numa fase posterior.

---

## 8. Como testar conexão

### 8.1 GitHub (PAT)

- Após receber o token, o daemon chama **`GET https://api.github.com/user`** com `Authorization: Bearer <PAT>`.
- **200:** extrair `login` (e opcionalmente `id`) para `accountHint`; marcar `lastTestOk: true`.
- **401/403:** mensagem genérica «Token inválido ou sem permissões suficientes» — **não** repassar cabeçalhos ou corpo com dados sensíveis.

### 8.2 Bitbucket (App Password)

- **`GET https://api.bitbucket.org/2.0/user`** com **HTTP Basic** `username:appPassword`.
- **200:** usar `username` ou `display_name` como hint.
- Falhas: idem, mensagem genérica.

**Endpoint dedicado** `POST /integrations/.../test` permite revalidar sem alterar token (útil após rotação de PAT no portal).

---

## 9. Uso posterior no «Adicionar projeto»

1. `GET /integrations` na abertura do `AddProjectDialog` (ou cache React Query).
2. Se `github.connected`, mostrar secção «Repositórios da conta» → `GET /integrations/github/repos` (fase 2).
3. Utilizador escolhe repo + branch → `POST /projects/git/register` **estendido** com `{ provider: 'github', full_name: 'owner/repo', branch }` — daemon resolve URL clone e injeta credencial **sem** a UI ver o token.

Compat: manter fluxo actual por **URL manual** para quem não quer integração.

---

## 10. Riscos de segurança

| Risco | Nota |
|-------|------|
| Token em memória do processo Node | Aceitável para desktop local; evitar core dumps em ambientes partilhados. |
| Ficheiro cifrado roubado | Chave mestra continua necessária; documentar permissões NTFS/posix. |
| XSS no frontend | Com tokens só em trânsito pontual, superfície menor; mesmo assim sanitizar qualquer reflexão de API. |
| Engenharia social | UI deve explicar que PAT/App Password são equivalentes a passwords. |
| Compliance | Não enviar tokens a serviços de analytics/telemetry. |

---

## 11. Fases de implementação incrementais

| Fase | Entregas |
|------|----------|
| **F1** | Modelo de store cifrado + `POST/DELETE/GET` mínimos GitHub + Bitbucket + teste; sem UI além de smoke manual (curl). |
| **F2** | Tela `/integrations` + header; cards + formulários + testar/desligar. |
| **F3** | Listagem repos/branches no daemon + extensão `POST /projects/git/register`. |
| **F4** | Integração no `AddProjectDialog` (picker por conta). |
| **F5** | GitLab (PAT ou OAuth); depois Jira/Trello/Notion com o mesmo padrão de cards. |
| **F6** | OAuth por provider + refresh tokens. |

---

## 12. Critérios de aceite (quando implementado)

- [ ] Utilizador abre **Integrações** a partir do **header** (acção clara e acessível).
- [ ] Lista mostra GitHub e Bitbucket com estados **Conectado / Não conectado**.
- [ ] Conectar envia token **uma vez** ao daemon; **não** persiste no frontend após sucesso.
- [ ] Desligar remove credencial do disco (ou invalida ciphertext).
- [ ] Testar conexão retorna sucesso/falha **compreensível** sem vazar secrets.
- [ ] Logs e respostas de erro **não** contêm PAT, App Password, nem URL com credencial.
- [ ] Documentação de utilizador explica PAT (GitHub) e App Password (Bitbucket).
- [ ] Roadmap visível na UI ou docs para GitLab e integrações não-Git (placeholders).

---

## 13. Relação com outros documentos

- [Discovery autenticação Git por provider (GitHub/Bitbucket)](./discovery-git-provider-auth-github-bitbucket.md) — detalhe de clone listagens e `spawn` git.

---

*Entregue conforme pedido: análise e plano apenas; sem mudanças funcionais no código.*
