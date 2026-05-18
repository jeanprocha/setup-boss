# P1b — Governance Resolver Backend

**Execução:** 2026-05-16T23:06:00 (local)

## Causa do 400

`GET /projects/:id/governance` usava apenas `resolveProjectSelector(rawSeg)`, que para IDs `proj_<hash>` devolve `projectRootCanonical: null` (só normaliza o id, não consulta `projects.json`).

O handler exigia **ambos** `projectId` e `projectRootCanonical` → **400** `invalid_request`, mesmo quando o projeto existia no registry com id legado/derivado diferente.

Intake e `GET /projects` já usam `resolveProjectRecord` (match exact, derived, root, jobs).

## Helper usado

**`resolveGovernanceProject(selector, { repoRoot, jobs })`** em `scripts/daemon/lib/project-governance-api.js`:

- Delega em `resolveProjectRecord` (mesma lógica que intake/listagem)
- `canonicalProjectRoot` + `deriveProjectId` para path final
- 404 estruturado `PROJECT_NOT_FOUND` com `suggestedActions` se não resolver

## Arquivos alterados

| Ficheiro | Alteração |
|----------|-----------|
| `scripts/daemon/lib/project-governance-api.js` | `resolveGovernanceProject` |
| `scripts/daemon/lib/project-governance-api.test.js` | **Novo** — 3 casos unitários |
| `scripts/daemon/runtime-api.js` | Handler governance usa resolver |
| `scripts/daemon/runtime-api.test.js` | HTTP: derivado 200 + inexistente 404 |

## Erro estruturado (404)

```json
{
  "ok": false,
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Projeto não encontrado no registry atual.",
    "projectId": "proj_…",
    "suggestedActions": [
      "Atualize a lista de projetos",
      "Selecione novamente o projeto"
    ]
  }
}
```

## Testes executados

```bash
node --test scripts/daemon/lib/project-governance-api.test.js
node --test --test-name-pattern "governance" scripts/daemon/runtime-api.test.js
```

**Resultado:** 3/3 unitários + 1/1 HTTP governance.

## Impacto

- Registry legado (`proj_legacy_*` no JSON, id público derivado do path) → **200** no governance
- ID inexistente → **404** claro (não 400 genérico)
- Alinha com P1a: frontend só chama governance para IDs no registry; backend deixa de falhar em IDs derivados válidos

## Validação manual

1. Mission Control → projeto registado com `.IA`
2. Abrir cartão **Governança `.IA`**
3. Network: `GET /api/runtime/projects/{derivedId}/governance` → **200**
4. `localStorage` com `proj_*` inválido → P1a limpa; governance não dispara
5. `GET .../proj_deadbeef/governance` (inexistente) → **404** + mensagem acima

## Resultado

P1b entregue: resolver robusto partilhado com intake, sem alterar regras `.IA` nem frontend.
