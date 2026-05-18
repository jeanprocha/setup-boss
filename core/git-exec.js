"use strict";

const path = require("path");
const { execFileSync, spawn } = require("child_process");

const DEFAULT_GIT_SYNC_TIMEOUT_MS = 30_000;
const DEFAULT_GIT_ASYNC_TIMEOUT_MS = 120_000;

/** Opções partilhadas para `execFileSync("git", …)` — evita janelas de consola no Windows. */
const GIT_EXEC_FILE_OPTS = Object.freeze({
  windowsHide: true,
});

/**
 * @param {unknown} err
 * @param {{ args?: string[] }} [ctx]
 * @returns {Error & { code?: string, exitCode?: number, stderr?: string, stdout?: string, gitArgs?: string[] }}
 */
function wrapGitError(err, ctx = {}) {
  if (err instanceof Error) {
    const out = /** @type {Error & { code?: string, exitCode?: number, stderr?: string, stdout?: string, gitArgs?: string[] }} */ (
      err
    );
    if (ctx.args) out.gitArgs = ctx.args;
    return out;
  }
  const e = new Error(String(err));
  if (ctx.args) e.gitArgs = ctx.args;
  return e;
}

/**
 * @param {string} projectRoot
 * @returns {string}
 */
function assertSafeProjectRootForGit(projectRoot) {
  const raw = projectRoot != null ? String(projectRoot).trim() : "";
  if (!raw) {
    const e = new Error("projectRoot é obrigatório.");
    e.code = "GIT_PROJECT_ROOT_REQUIRED";
    throw e;
  }
  return path.resolve(raw);
}

/**
 * Execução síncrona de baixo nível — `args` passados verbatim ao binário `git` (incluir `-C` quando necessário).
 *
 * @param {string[]} args
 * @param {import("child_process").ExecFileSyncOptions} [extra]
 * @returns {string|Buffer}
 */
function gitExecFileSync(args, extra = {}) {
  const timeout =
    extra.timeout != null
      ? extra.timeout
      : extra.timeoutMs != null
        ? Number(extra.timeoutMs)
        : DEFAULT_GIT_SYNC_TIMEOUT_MS;
  const opts = { ...GIT_EXEC_FILE_OPTS, ...extra };
  if (timeout > 0) opts.timeout = timeout;
  try {
    return execFileSync("git", args, opts);
  } catch (err) {
    throw wrapGitError(err, { args });
  }
}

/**
 * @param {string} projectRoot
 * @param {string[]} args
 * @param {import("child_process").ExecFileSyncOptions} [extra]
 * @returns {string|Buffer}
 */
function gitExecInRepoSync(projectRoot, args, extra = {}) {
  const root = assertSafeProjectRootForGit(projectRoot);
  return gitExecFileSync(["-C", root, ...args], extra);
}

/**
 * Execução assíncrona via `spawn` (sem shell). Compatível com o antigo `runGitSpawn` do daemon.
 *
 * @param {string[]} args
 * @param {{ timeoutMs?: number, cwd?: string|null, timeoutMessage?: string }} [opts]
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
function gitSpawn(args, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_GIT_ASYNC_TIMEOUT_MS;
  const timeoutMessage =
    opts.timeoutMessage != null && String(opts.timeoutMessage).trim()
      ? String(opts.timeoutMessage).trim()
      : `Git excedeu o tempo limite (${timeoutMs}ms).`;
  const cwd =
    opts.cwd != null && String(opts.cwd).trim()
      ? path.resolve(String(opts.cwd).trim())
      : undefined;

  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      shell: false,
      windowsHide: true,
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch (_) {
        /* */
      }
      const te = new Error(timeoutMessage);
      te.code = "git_timeout";
      reject(te);
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c) => {
      stdout += c;
    });
    child.stderr.on("data", (c) => {
      stderr += c;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(wrapGitError(err, { args }));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else {
        const msg = (stderr || stdout || `git_exit_${code}`).trim();
        const e = new Error(msg || `git_exit_${code}`);
        e.code = "git_failed";
        e.exitCode = code;
        e.stderr = stderr;
        e.stdout = stdout;
        reject(e);
      }
    });
  });
}

/**
 * @param {string} projectRoot
 * @returns {boolean}
 */
function isGitRepository(projectRoot) {
  try {
    gitExecInRepoSync(projectRoot, ["rev-parse", "--git-dir"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} projectRoot
 * @returns {string|null}
 */
function getCurrentBranch(projectRoot) {
  assertSafeProjectRootForGit(projectRoot);
  if (!isGitRepository(projectRoot)) {
    const e = new Error("O caminho não é um repositório Git.");
    e.code = "GIT_NOT_A_REPOSITORY";
    throw e;
  }
  try {
    const out = gitExecInRepoSync(projectRoot, ["branch", "--show-current"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const branch = String(out).trim();
    if (branch) return branch;
    const head = gitExecInRepoSync(projectRoot, ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const ref = String(head).trim();
    if (!ref || ref === "HEAD") return null;
    return ref;
  } catch (err) {
    const wrapped = wrapGitError(err);
    wrapped.code = "GIT_BRANCH_READ_FAILED";
    throw wrapped;
  }
}

/**
 * @param {string} projectRoot
 * @returns {string}
 */
/**
 * @param {string} projectRoot
 * @returns {string}
 */
function getWorkingTreePorcelain(projectRoot) {
  assertSafeProjectRootForGit(projectRoot);
  if (!isGitRepository(projectRoot)) {
    const e = new Error("O caminho não é um repositório Git.");
    e.code = "GIT_NOT_A_REPOSITORY";
    throw e;
  }
  const out = gitExecInRepoSync(projectRoot, ["status", "--porcelain"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return String(out);
}

/**
 * @param {string} projectRoot
 * @returns {boolean}
 */
function isWorkingTreeDirty(projectRoot) {
  const porcelain = getWorkingTreePorcelain(projectRoot);
  return porcelain
    .split(/\r?\n/)
    .some((line) => line.trim().length > 0);
}

/**
 * @param {string} projectRoot
 * @param {string} branchName
 * @returns {boolean}
 */
function branchExistsLocal(projectRoot, branchName) {
  const name = String(branchName || "").trim();
  if (!name) return false;
  try {
    const out = gitExecInRepoSync(
      projectRoot,
      ["show-ref", "--verify", `refs/heads/${name}`],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    return Boolean(String(out).trim());
  } catch {
    try {
      const listed = gitExecInRepoSync(
        projectRoot,
        ["branch", "--list", name, "--format=%(refname:short)"],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      );
      return String(listed)
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .includes(name);
    } catch {
      return false;
    }
  }
}

/**
 * @param {string} projectRoot
 * @param {string} [remoteName]
 * @returns {boolean}
 */
function hasGitRemote(projectRoot, remoteName = "origin") {
  try {
    const out = gitExecInRepoSync(projectRoot, ["remote", "get-url", remoteName], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return Boolean(String(out).trim());
  } catch {
    return false;
  }
}

/**
 * Resolve branch base local (main/master ou origin/HEAD).
 *
 * @param {string} projectRoot
 * @returns {string|null}
 */
function resolveBaseBranchName(projectRoot) {
  assertSafeProjectRootForGit(projectRoot);
  if (!isGitRepository(projectRoot)) return null;

  if (hasGitRemote(projectRoot, "origin")) {
    try {
      const sym = gitExecInRepoSync(
        projectRoot,
        ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
      const short = String(sym).trim();
      if (short.startsWith("origin/")) {
        const base = short.slice("origin/".length);
        if (base && branchExistsLocal(projectRoot, base)) return base;
      }
    } catch {
      /* fallback */
    }
  }

  for (const candidate of ["main", "master"]) {
    if (branchExistsLocal(projectRoot, candidate)) return candidate;
  }

  const current = getCurrentBranch(projectRoot);
  return current || null;
}

function getHeadCommit(projectRoot) {
  assertSafeProjectRootForGit(projectRoot);
  if (!isGitRepository(projectRoot)) {
    const e = new Error("O caminho não é um repositório Git.");
    e.code = "GIT_NOT_A_REPOSITORY";
    throw e;
  }
  try {
    const out = gitExecInRepoSync(projectRoot, ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const sha = String(out).trim();
    if (!sha) {
      const e = new Error("HEAD não resolvido.");
      e.code = "GIT_HEAD_READ_FAILED";
      throw e;
    }
    return sha;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "GIT_HEAD_READ_FAILED") {
      throw err;
    }
    const wrapped = wrapGitError(err);
    wrapped.code = "GIT_HEAD_READ_FAILED";
    throw wrapped;
  }
}

module.exports = {
  DEFAULT_GIT_SYNC_TIMEOUT_MS,
  DEFAULT_GIT_ASYNC_TIMEOUT_MS,
  GIT_EXEC_FILE_OPTS,
  assertSafeProjectRootForGit,
  wrapGitError,
  gitExecFileSync,
  gitExecInRepoSync,
  gitSpawn,
  /** @deprecated use `gitSpawn` */
  runGitSpawn: gitSpawn,
  isGitRepository,
  getCurrentBranch,
  getHeadCommit,
  getWorkingTreePorcelain,
  isWorkingTreeDirty,
  branchExistsLocal,
  hasGitRemote,
  resolveBaseBranchName,
};
