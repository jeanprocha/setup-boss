"use strict";

const { gitExecInRepoSync } = require("./git-exec");

/**
 * @param {string} hostname
 */
function gitProviderFromHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (h.includes("github")) return "github";
  if (h.includes("gitlab")) return "gitlab";
  if (h.includes("bitbucket")) return "bitbucket";
  return "unknown";
}

/**
 * @param {string} raw
 * @returns {{ ok: true, provider: string, host: string, workspace: string, repoSlug: string } | { ok: false, reason: string }}
 */
function parseGitRemoteUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return { ok: false, reason: "empty_remote_url" };

  const scp = /^git@([^:]+):(.+)$/.exec(s);
  if (scp) {
    const host = String(scp[1] || "").trim();
    const pathPart = String(scp[2] || "").trim().replace(/\.git$/i, "");
    const segments = pathPart.split("/").filter(Boolean);
    if (segments.length < 2) return { ok: false, reason: "invalid_path" };
    return {
      ok: true,
      provider: gitProviderFromHost(host),
      host,
      workspace: segments[0],
      repoSlug: segments[1],
    };
  }

  let u;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  const host = (u.hostname || "").trim();
  let pathStr = String(u.pathname || "").replace(/^\/+/u, "").replace(/\.git$/i, "");
  const segments = pathStr.split("/").filter(Boolean);
  if (segments.length < 2) return { ok: false, reason: "invalid_path" };

  return {
    ok: true,
    provider: gitProviderFromHost(host),
    host,
    workspace: segments[0],
    repoSlug: segments[1],
  };
}

/**
 * @param {string} projectRoot
 * @param {string} [remoteName]
 */
function getOriginRemoteUrl(projectRoot, remoteName = "origin") {
  try {
    const out = gitExecInRepoSync(projectRoot, ["remote", "get-url", remoteName], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return String(out).trim() || null;
  } catch {
    return null;
  }
}

/**
 * @param {string} projectRoot
 * @param {string} [remoteName]
 */
function resolveGitRemoteContext(projectRoot, remoteName = "origin") {
  const url = getOriginRemoteUrl(projectRoot, remoteName);
  if (!url) {
    return { ok: false, reason: "origin_url_missing" };
  }
  const parsed = parseGitRemoteUrl(url);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason, originUrl: url };
  }
  return {
    ok: true,
    originUrl: url,
    provider: parsed.provider,
    host: parsed.host,
    workspace: parsed.workspace,
    repoSlug: parsed.repoSlug,
  };
}

module.exports = {
  gitProviderFromHost,
  parseGitRemoteUrl,
  getOriginRemoteUrl,
  resolveGitRemoteContext,
};
