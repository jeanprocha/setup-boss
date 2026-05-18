# Mission Control — remoção de projectos demo da lista pública

## 1. Causa raiz

O endpoint `GET /projects` da Runtime API monta a lista com `buildProjectsOverview`, que **une** o registo `.setup-boss/projects.json` com **todos os `projectId` / `projectRoot` presentes na fila** (`queue.json`). Corridas de teste e fixtures criavam jobs com `projectRoot` terminando em pastas `demo` ou `demo-block` (nomes usados em testes do daemon). Cada combinação distinta de caminho gerava um `projectId` (`proj_<hash>`) diferente, o que explicava **várias entradas** com o mesmo nome visível (`demo-block`).

O frontend **não** usava `mockProjects` da sidebar: `useProjects` já lia só a API; o problema era **dados reais devolvidos pelo backend** a partir da fila + registo.

## 2. Origem dos projectos `demo` / `demo-block`

- Jobs enfileirados com `projectRoot` apontando para directorias de teste (ex.: `…/demo-block`, `…/demo`).
- Registo opcional com `displayName` ou pasta base igual a `demo` / `demo-block`.

Não havia fallback mock no `useProjects` em caso de erro da API (apenas lista vazia com `source: "error"`).

## 3. Ficheiros alterados

| Ficheiro | Alteração |
|----------|-----------|
| `scripts/daemon/lib/project-registry.js` | `mergeProjectsOverviewFromJobs` (merge cru), `isDemoProjectRow`, `demoProjectsEnabled`, `buildProjectsOverview` aplica filtro por omissão |
| `scripts/daemon/runtime-api.js` | Logs `runtime.projects.list`, `runtime.projects.demo_filtered`, `runtime.projects.empty` (quando só sobravam linhas filtradas) |
| `scripts/daemon/lib/project-registry.test.js` | Testes a `isDemoProjectRow` e filtro / flag |
| `frontend/hooks/use-projects.ts` | `errorMessage` em falhas de rede/contrato |
| `frontend/components/regions/ProjectSidebar.tsx` | Estado de erro explícito, hints vazio/real, botão **Actualizar** |
| `frontend/components/regions/ProjectActivitySidebar.tsx` | Mesmo tratamento de erro e hints alinhados |

## 4. Regra nova: sem demo por defeito

- Por omissão, linhas cuja pasta base (`basename(projectRoot)`) ou `displayName` (normalizado) é `demo` ou `demo-block` **não entram** em `buildProjectsOverview` (logo não aparecem na UI nem na CLI `setup-boss projects`).
- Para voltar a listar esses projectos (ex.: desenvolvimento): `SETUP_BOSS_ENABLE_DEMO_PROJECTS=1` no ambiente do **processo do daemon** / Runtime API.

## 5. Limpeza de localStorage / cache

- Não foi necessária migração de esquema: o `selectedProjectId` persistido em `setup-boss-mission-shell` já é corrigido quando a lista carrega — se o id não existir na resposta actual, os efeitos em `ProjectSidebar` / `ProjectActivitySidebar` limpam ou reatribuem selecção.
- Recomendação: após actualizar o daemon, usar **Actualizar** na sidebar ou recarregar a página.

## 6. Validações executadas

- `node --test scripts/daemon/lib/project-registry.test.js`
- `node --test scripts/daemon/runtime-api.test.js --test-name-pattern="/projects"` (conjunto filtrado que inclui o teste HTTP de `/projects`)
- `cd frontend; npx tsc --noEmit`

## 7. Próximos passos (opcional)

- Se no futuro houver mais pastas de fixture, considerar lista configurável ou metadata `demo: true` nos jobs em vez de blocklist por nome.
- Opcional: expurgar jobs antigos de teste da `queue.json` para reduzir ruído no daemon (fora do âmbito desta alteração).
