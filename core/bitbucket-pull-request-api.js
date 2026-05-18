"use strict";

const BITBUCKET_API_BASE = "https://api.bitbucket.org/2.0";

/**
 * @param {unknown} msg
 */
function sanitizeBitbucketErrorMessage(msg) {
  return String(msg || "")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer <redacted>")
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic <redacted>")
    .replace(/x-token-auth:[^@\s]+/gi, "x-token-auth:<redacted>")
    .replace(/https?:\/\/[^\s]+/gi, "<url-redacted>")
    .slice(0, 500);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function resolveBitbucketCredentials(env = process.env) {
  const token =
    env.SETUP_BOSS_BITBUCKET_ACCESS_TOKEN != null &&
    String(env.SETUP_BOSS_BITBUCKET_ACCESS_TOKEN).trim()
      ? String(env.SETUP_BOSS_BITBUCKET_ACCESS_TOKEN).trim()
      : env.BITBUCKET_ACCESS_TOKEN != null && String(env.BITBUCKET_ACCESS_TOKEN).trim()
        ? String(env.BITBUCKET_ACCESS_TOKEN).trim()
        : "";

  if (token) {
    return { kind: "bearer", token };
  }

  const username =
    env.SETUP_BOSS_BITBUCKET_USERNAME != null && String(env.SETUP_BOSS_BITBUCKET_USERNAME).trim()
      ? String(env.SETUP_BOSS_BITBUCKET_USERNAME).trim()
      : env.BITBUCKET_USERNAME != null && String(env.BITBUCKET_USERNAME).trim()
        ? String(env.BITBUCKET_USERNAME).trim()
        : "";

  const appPassword =
    env.SETUP_BOSS_BITBUCKET_APP_PASSWORD != null &&
    String(env.SETUP_BOSS_BITBUCKET_APP_PASSWORD).trim()
      ? String(env.SETUP_BOSS_BITBUCKET_APP_PASSWORD).trim()
      : env.BITBUCKET_APP_PASSWORD != null && String(env.BITBUCKET_APP_PASSWORD).trim()
        ? String(env.BITBUCKET_APP_PASSWORD).trim()
        : "";

  if (username && appPassword) {
    return { kind: "basic", username, appPassword };
  }

  return null;
}

/**
 * @param {{ kind: string, token?: string, username?: string, appPassword?: string }} auth
 */
function buildAuthHeader(auth) {
  if (auth.kind === "bearer" && auth.token) {
    return `Bearer ${auth.token}`;
  }
  if (auth.kind === "basic" && auth.username && auth.appPassword) {
    const raw = `${auth.username}:${auth.appPassword}`;
    return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
  }
  return "";
}

/**
 * @param {string} url
 * @param {RequestInit} init
 */
async function bitbucketFetch(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  /** @type {unknown} */
  let body = null;
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 500) };
    }
  }
  if (!res.ok) {
    const errObj =
      body && typeof body === "object" && !Array.isArray(body) && body.error
        ? /** @type {{ error?: { message?: string } }} */ (body).error
        : null;
    const message = sanitizeBitbucketErrorMessage(
      errObj && errObj.message ? String(errObj.message) : `HTTP ${res.status}`,
    );
    const e = new Error(message);
    e.code = "bitbucket_api_error";
    e.status = res.status;
    throw e;
  }
  return body;
}

/**
 * @param {{
 *   workspace: string,
 *   repoSlug: string,
 *   sourceBranch: string,
 *   destinationBranch: string,
 *   auth: { kind: string, token?: string, username?: string, appPassword?: string },
 * }} input
 */
async function findOpenBitbucketPullRequest(input) {
  const ws = encodeURIComponent(input.workspace);
  const repo = encodeURIComponent(input.repoSlug);
  const q = encodeURIComponent(`source.branch.name="${input.sourceBranch}"`);
  const url = `${BITBUCKET_API_BASE}/repositories/${ws}/${repo}/pullrequests?state=OPEN&q=${q}&pagelen=10`;
  const authHeader = buildAuthHeader(input.auth);
  const doc = await bitbucketFetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: authHeader,
    },
  });

  const values =
    doc && typeof doc === "object" && !Array.isArray(doc) && Array.isArray(doc.values)
      ? doc.values
      : [];

  for (const row of values) {
    if (!row || typeof row !== "object") continue;
    const r = /** @type {Record<string, unknown>} */ (row);
    const source =
      r.source && typeof r.source === "object" && !Array.isArray(r.source)
        ? /** @type {Record<string, unknown>} */ (r.source)
        : {};
    const dest =
      r.destination && typeof r.destination === "object" && !Array.isArray(r.destination)
        ? /** @type {Record<string, unknown>} */ (r.destination)
        : {};
    const srcBranch =
      source.branch &&
      typeof source.branch === "object" &&
      !Array.isArray(source.branch) &&
      /** @type {Record<string, unknown>} */ (source.branch).name != null
        ? String(/** @type {Record<string, unknown>} */ (source.branch).name)
        : "";
    const destBranch =
      dest.branch &&
      typeof dest.branch === "object" &&
      !Array.isArray(dest.branch) &&
      /** @type {Record<string, unknown>} */ (dest.branch).name != null
        ? String(/** @type {Record<string, unknown>} */ (dest.branch).name)
        : "";
    if (srcBranch === input.sourceBranch && destBranch === input.destinationBranch) {
      const links =
        r.links && typeof r.links === "object" && !Array.isArray(r.links)
          ? /** @type {Record<string, unknown>} */ (r.links)
          : {};
      const html =
        links.html &&
        typeof links.html === "object" &&
        !Array.isArray(links.html) &&
        /** @type {Record<string, unknown>} */ (links.html).href != null
          ? String(/** @type {Record<string, unknown>} */ (links.html).href)
          : "";
      return {
        id: r.id != null ? String(r.id) : "",
        url: html,
      };
    }
  }
  return null;
}

/**
 * @param {{
 *   workspace: string,
 *   repoSlug: string,
 *   title: string,
 *   description: string,
 *   sourceBranch: string,
 *   destinationBranch: string,
 *   auth: { kind: string, token?: string, username?: string, appPassword?: string },
 * }} input
 */
async function createBitbucketPullRequest(input) {
  const ws = encodeURIComponent(input.workspace);
  const repo = encodeURIComponent(input.repoSlug);
  const url = `${BITBUCKET_API_BASE}/repositories/${ws}/${repo}/pullrequests`;
  const authHeader = buildAuthHeader(input.auth);

  const doc = await bitbucketFetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({
      title: input.title,
      description: input.description,
      source: { branch: { name: input.sourceBranch } },
      destination: { branch: { name: input.destinationBranch } },
      close_source_branch: false,
    }),
  });

  const r = doc && typeof doc === "object" && !Array.isArray(doc) ? doc : {};
  const links =
    r.links && typeof r.links === "object" && !Array.isArray(r.links)
      ? /** @type {Record<string, unknown>} */ (r.links)
      : {};
  const html =
    links.html &&
    typeof links.html === "object" &&
    !Array.isArray(links.html) &&
    /** @type {Record<string, unknown>} */ (links.html).href != null
      ? String(/** @type {Record<string, unknown>} */ (links.html).href)
      : "";

  return {
    id: r.id != null ? String(r.id) : "",
    url: html,
  };
}

module.exports = {
  BITBUCKET_API_BASE,
  sanitizeBitbucketErrorMessage,
  resolveBitbucketCredentials,
  findOpenBitbucketPullRequest,
  createBitbucketPullRequest,
};
