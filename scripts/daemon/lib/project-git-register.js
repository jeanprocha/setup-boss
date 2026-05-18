"use strict";

const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const {
  deriveProjectId,
  canonicalProjectRoot,
  upsertProjectFromUsage,
  findProjectRecord,
} = require("./project-registry");
const { appendDaemonLog } = require("./daemon-log");
const { gitSpawn } = require("../../../core/git-exec");

/** @param {string} hostname */
function gitProviderFromHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (h.includes("github")) return "github";
  if (h.includes("gitlab")) return "gitlab";
  if (h.includes("bitbucket")) return "bitbucket";
  return "unknown";
}

/** @param {string} hostname */
function isAllowedGitHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (!h) return false;
  if (h === "github.com" || h.endsWith(".github.com")) return true;
  if (h === "gitlab.com" || h.endsWith(".gitlab.com")) return true;
  if (h === "bitbucket.org" || h.endsWith(".bitbucket.org")) return true;
  return false;
}

/** @param {string} raw */
function trimRaw(raw) {
  return raw != null ? String(raw).trim() : "";
}

const HUMAN = {
  repo_url_vazio: "Indique o URL do repositório Git.",
  repo_url_invalido:
    "Informe uma URL Git válida (ex.: git@bitbucket.org/org/repo.git ou https://bitbucket.org/org/repo.git).",
  host_git_nao_permitido:
    "O host do repositório não é suportado. Use GitHub, GitLab ou Bitbucket.",
  caminho_do_repo_ausente: "O URL não inclui o caminho do repositório (org/repo).",
  apenas_https_ou_ssh: "Use https://… ou git@…",

  ssh_nao_suportado_use_https: "Use formato git@host:org/repo.git ou https://…",
  invalid_branch: "Nome de branch inválido.",
  nome_pasta_invalido: "Nome interno da pasta inválido.",
  path_traversal: "Caminho não permitido.",
  managed_root_invalid: "Directório de projectos geridos inválido.",
  destino_existe_sem_git: "Já existe uma pasta com o mesmo nome que não é um repositório Git.",
  git_timeout: "Operação Git excedeu o tempo limite.",
  git_auth_failed:
    "Não foi possível autenticar no repositório. Verifique acesso HTTPS/token ou chave SSH configurada no sistema.",
};

/**
 * @typedef {{
 *   kind: "https"|"ssh",
 *   provider: string,
 *   host: string,
 *   cloneUrl: string,
 *   pathSegments: string[],
 * }} NormalizedGitRemote
 */

/**
 * @param {string} raw
 * @returns {{ ok: true, remote: NormalizedGitRemote } | { ok: false, error: string }}
 */
function normalizeGitRemoteUrl(raw) {
  const s = trimRaw(raw);
  if (!s) return { ok: false, error: "repo_url_vazio" };

  const scp = /^git@([^:]+):(.+)$/.exec(s);
  if (scp) {
    const host = String(scp[1] || "").trim();
    const pathPart = String(scp[2] || "").trim();
    if (!host || !pathPart || pathPart.includes("..")) {
      return { ok: false, error: "repo_url_invalido" };
    }
    if (!isAllowedGitHost(host)) return { ok: false, error: "host_git_nao_permitido" };
    const segments = pathPart
      .split("/")
      .filter(Boolean)
      .map((x) => x.replace(/\.git$/i, ""));
    if (!segments.length) return { ok: false, error: "caminho_do_repo_ausente" };
    return {
      ok: true,
      remote: {
        kind: "ssh",
        host,
        cloneUrl: s,
        pathSegments: segments,
        provider: gitProviderFromHost(host),
      },
    };
  }

  let u;
  try {
    u = new URL(s);
  } catch (_) {
    return { ok: false, error: "repo_url_invalido" };
  }

  if (u.protocol === "ssh:") {
    const host = (u.hostname || "").trim();
    if (!host) return { ok: false, error: "repo_url_invalido" };
    if (!isAllowedGitHost(host)) return { ok: false, error: "host_git_nao_permitido" };
    let pathStr = String(u.pathname || "").replace(/^\/+/u, "");
    if (!pathStr) return { ok: false, error: "caminho_do_repo_ausente" };
    const segments = pathStr
      .split("/")
      .filter(Boolean)
      .map((x) => x.replace(/\.git$/i, ""));
    if (!segments.length) return { ok: false, error: "caminho_do_repo_ausente" };
    return {
      ok: true,
      remote: {
        kind: "ssh",
        host,
        cloneUrl: s,
        pathSegments: segments,
        provider: gitProviderFromHost(host),
      },
    };
  }

  if (u.protocol !== "https:") {
    return { ok: false, error: "apenas_https_ou_ssh" };
  }

  const host = (u.hostname || "").trim();
  if (!host) return { ok: false, error: "repo_url_invalido" };
  if (!isAllowedGitHost(host)) return { ok: false, error: "host_git_nao_permitido" };
  if (!u.pathname || u.pathname === "/") return { ok: false, error: "caminho_do_repo_ausente" };

  const segments = String(u.pathname)
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/\.git$/i, ""));
  if (!segments.length) return { ok: false, error: "caminho_do_repo_ausente" };

  return {
    ok: true,
    remote: {
      kind: "https",
      host,
      cloneUrl: s,
      pathSegments: segments,
      provider: gitProviderFromHost(host),
    },
  };
}

/** @param {NormalizedGitRemote} n */
function safeDirectorySlugFromNormalized(n) {
  const host = String(n.host || "host").replace(/\./g, "-");
  const raw = [host, ...n.pathSegments].join("-").toLowerCase();
  let slug = raw
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  if (!slug) slug = "repo";
  return slug;
}

/** @param {NormalizedGitRemote} n */
function displayNameFromNormalized(n) {
  const last = n.pathSegments[n.pathSegments.length - 1] || "repo";
  return last || "repo";
}

/** @param {NormalizedGitRemote} n */
function safeGitRegisterLogLine(n, branchLabel) {
  const slug = n.pathSegments.join("/");

  return `git_register provider=${n.provider} host=${n.host} kind=${n.kind} slug=${slug} branch=${branchLabel}`;
}

/** @param {string} stderr */
function looksLikeGitAuthFailure(stderr) {
  const t = String(stderr || "").toLowerCase();
  return (
    t.includes("permission denied") ||
    t.includes("authentication failed") ||
    t.includes("could not read from remote repository") ||
    t.includes("access denied") ||
    t.includes("denied (publickey)") ||
    t.includes("no supported authentication methods") ||
    t.includes("incorrect username or password") ||
    t.includes("fatal: could not read username")
  );
}

/** @param {Error & { stderr?: string }} err */
function attachGitAuthIfNeeded(err) {
  const stderr = err && typeof err.stderr === "string" ? err.stderr : "";
  const msg = String((err && err.message) || "");
  if (looksLikeGitAuthFailure(stderr) || looksLikeGitAuthFailure(msg)) {
    const e = new Error(HUMAN.git_auth_failed);
    e.code = "git_auth_failed";
    throw e;
  }
}

/** @param {string} name */
function assertSafeRelativeDirSegment(name) {
  if (!/^[a-z0-9._-]+$/i.test(String(name))) {
    const e = new Error(HUMAN.nome_pasta_invalido);
    e.code = "nome_pasta_invalido";
    throw e;
  }
}

/**
 * @param {string} managedRootAbs
 * @param {string} childSegment
 */
function resolveUnderManagedRoot(managedRootAbs, childSegment) {
  const root = path.resolve(managedRootAbs);
  const target = path.resolve(path.join(root, childSegment));
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    const e = new Error(HUMAN.path_traversal);
    e.code = "path_traversal";
    throw e;
  }
  return target;
}

/** @param {string|undefined|null} branch */
function normalizeOptionalBranch(branch) {
  if (branch == null || !String(branch).trim()) return "";
  const b = String(branch).trim();
  if (b.length > 200) {
    const e = new Error(HUMAN.invalid_branch);
    e.code = "invalid_branch";
    throw e;
  }
  if (/[\s;|&$`<>\n\r]/.test(b)) {
    const e = new Error(HUMAN.invalid_branch);
    e.code = "invalid_branch";
    throw e;
  }
  return b;
}

/**
 * @param {{ url: string, targetPath: string, branch: string, timeoutMs: number, managedRoot: string }} p
 */
async function gitClone(p) {
  const args = ["clone", "--depth", "1"];
  if (p.branch) args.push("--branch", p.branch, "--single-branch");
  args.push(p.url, p.targetPath);
  try {
    await gitSpawn(args, {
      timeoutMs: p.timeoutMs,
      cwd: p.managedRoot,
      timeoutMessage: HUMAN.git_timeout,
    });
  } catch (e) {
    attachGitAuthIfNeeded(/** @type {Error & { stderr?: string }} */ (e));
    throw e;
  }
}

/**
 * @param {{ targetPath: string, branch: string, timeoutMs: number }} p
 */
async function gitFetchPullFfOnly(p) {
  try {
    const spawnOpts = { timeoutMs: p.timeoutMs, timeoutMessage: HUMAN.git_timeout };
    await gitSpawn(["-C", p.targetPath, "fetch", "origin"], spawnOpts);
    if (p.branch) {
      await gitSpawn(["-C", p.targetPath, "checkout", p.branch], spawnOpts);
    }
    const pullArgs = ["-C", p.targetPath, "pull", "--ff-only"];
    if (p.branch) pullArgs.push("origin", p.branch);
    await gitSpawn(pullArgs, spawnOpts);
  } catch (e) {
    attachGitAuthIfNeeded(/** @type {Error & { stderr?: string }} */ (e));
    throw e;
  }
}

function throwHuman(code, fallback) {
  const text = HUMAN[code] || fallback || code;
  const e = new Error(text);
  e.code = code;
  throw e;
}

/**
 * @param {{
 *   repoUrl?: string|null,
 *   repo_url?: string|null,
 *   branch?: string|null,
 *   managedRoot: string,
 *   timeoutMs?: number,
 * }} opts
 */
async function registerOrUpdateGitProject(opts) {
  const timeoutMs =
    opts.timeoutMs != null && Number.isFinite(Number(opts.timeoutMs))
      ? Math.min(Math.max(Math.floor(Number(opts.timeoutMs)), 5000), 600_000)
      : 180_000;

  const trimmedUrl = trimRaw(opts.repoUrl ?? opts.repo_url ?? "");
  const parsed = normalizeGitRemoteUrl(trimmedUrl);
  if (!parsed.ok) {
    throwHuman(parsed.error, parsed.error);
  }

  const remote = parsed.remote;

  let branchNorm = "";
  try {
    branchNorm = normalizeOptionalBranch(opts.branch);
  } catch (e) {
    throw e;
  }

  const slug = safeDirectorySlugFromNormalized(remote);
  assertSafeRelativeDirSegment(slug);

  const managedRoot = path.resolve(String(opts.managedRoot || "").trim());
  if (!managedRoot) {
    throwHuman("managed_root_invalid", HUMAN.managed_root_invalid);
  }

  appendDaemonLog(safeGitRegisterLogLine(remote, branchNorm || "(default)"));

  fs.mkdirSync(managedRoot, { recursive: true });

  const targetPath = resolveUnderManagedRoot(managedRoot, slug);

  let action = "cloned";

  if (!fs.existsSync(targetPath)) {
    await gitClone({
      url: remote.cloneUrl,
      targetPath,
      branch: branchNorm,
      timeoutMs,
      managedRoot,
    });
  } else {
    const gitMeta = path.join(targetPath, ".git");
    if (!fs.existsSync(gitMeta)) {
      throwHuman("destino_existe_sem_git", HUMAN.destino_existe_sem_git);
    }
    action = "updated";
    await gitFetchPullFfOnly({ targetPath, branch: branchNorm, timeoutMs });
  }

  const projectRoot = canonicalProjectRoot(targetPath);
  const projectId = deriveProjectId(projectRoot);
  const now = new Date().toISOString();
  const existing = findProjectRecord(projectId);
  const prevMeta =
    existing && existing.metadata && typeof existing.metadata === "object"
      ? existing.metadata
      : {};
  const prevGit =
    prevMeta.git && typeof prevMeta.git === "object" && !Array.isArray(prevMeta.git)
      ? prevMeta.git
      : {};

  const metadata = {
    ...prevMeta,
    git: {
      provider: remote.provider,
      repo_url: remote.cloneUrl,
      branch: branchNorm || null,
      local_path: projectRoot,
      remote_kind: remote.kind,
      created_at: typeof prevGit.created_at === "string" ? prevGit.created_at : now,
      updated_at: now,
    },
  };

  upsertProjectFromUsage({
    projectId,
    projectRoot,
    displayName: displayNameFromNormalized(remote),
    metadata,
  });

  return {
    projectId,
    projectRoot,
    local_path: projectRoot,
    action,
    provider: remote.provider,
    repo_url: remote.cloneUrl,
    branch: branchNorm || null,
  };
}

module.exports = {
  normalizeGitRemoteUrl,
  /** @deprecated compat test */
  validateHttpsGitRemoteUrl: (raw) => {
    const n = normalizeGitRemoteUrl(raw);
    if (!n.ok) return { ok: false, error: n.error };
    if (n.remote.kind !== "https") return { ok: false, error: "apenas_https_ou_ssh" };
    try {
      return {
        ok: true,
        normalizedUrl: n.remote.cloneUrl,
        parsedUrl: new URL(n.remote.cloneUrl),
        provider: n.remote.provider,
      };
    } catch (_) {
      return { ok: false, error: "repo_url_invalido" };
    }
  },
  safeDirectorySlugFromUrl: (parsedUrl) => {
    const host = String(parsedUrl.hostname || "host").replace(/\./g, "-");
    const segments = String(parsedUrl.pathname || "")
      .split("/")
      .filter(Boolean)
      .map((s) => s.replace(/\.git$/i, ""));
    const raw = [host, ...segments].join("-").toLowerCase();
    let slug = raw
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);
    if (!slug) slug = "repo";
    return slug;
  },
  resolveUnderManagedRoot,
  assertSafeRelativeDirSegment,
  registerOrUpdateGitProject,
  runGitSpawn: gitSpawn,
  _test: {
    gitProviderFromHost,
    isAllowedGitHost,
    displayNameFromParsedUrl: displayNameFromNormalized,
  },
};
