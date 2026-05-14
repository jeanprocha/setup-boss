"use strict";

const http = require("http");
const {
  resolveRuntimeApiPort,
  RUNTIME_API_HOST,
} = require("../../daemon/runtime-api");

const DEFAULT_HEALTH_MS = Number(process.env.SETUP_BOSS_RUNTIME_API_HEALTH_MS || 400);

function normalizeBase(raw) {
  if (!raw || !String(raw).trim()) return null;
  return String(raw).trim().replace(/\/+$/, "");
}

function runtimeApiBaseUrl() {
  const fromEnv = normalizeBase(process.env.SETUP_BOSS_RUNTIME_API_URL);
  if (fromEnv) return fromEnv;
  return `http://${RUNTIME_API_HOST}:${resolveRuntimeApiPort()}`;
}

function getListenTarget() {
  const raw = process.env.SETUP_BOSS_RUNTIME_API_URL;
  if (!raw || !String(raw).trim()) {
    return { hostname: RUNTIME_API_HOST, port: resolveRuntimeApiPort() };
  }
  try {
    const u = new URL(String(raw).trim());
    const p = u.port && String(u.port).trim();
    return {
      hostname: u.hostname || RUNTIME_API_HOST,
      port: p ? Number(u.port) : resolveRuntimeApiPort(),
    };
  } catch {
    return { hostname: RUNTIME_API_HOST, port: resolveRuntimeApiPort() };
  }
}

function httpReqJson(opts) {
  const bodyStr =
    opts.body && typeof opts.body === "object"
      ? JSON.stringify(opts.body)
      : (opts.bodyRaw ?? "");
  const timeoutMs =
    typeof opts.timeoutMs === "number" && opts.timeoutMs > 0
      ? opts.timeoutMs
      : DEFAULT_HEALTH_MS;

  return new Promise((resolve, reject) => {
    const { hostname: hname, port } = getListenTarget();
    const pathname = opts.path.startsWith("/") ? opts.path : `/${opts.path}`;

    const req = http.request(
      {
        hostname: hname,
        port,
        path: pathname,
        method: opts.method || "GET",
        timeout: timeoutMs,
        headers: {
          ...(opts.headers || {}),
          ...(bodyStr
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(bodyStr, "utf8"),
              }
            : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const txt = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = txt ? JSON.parse(txt) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode || 0, json, raw: txt });
        });
      },
    );

    req.on("timeout", () => {
      req.destroy();
      reject(Object.assign(new Error("timeout"), { code: "EIO" }));
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function isRuntimeApiAvailable(extraTimeoutMs) {
  const timeoutMs =
    typeof extraTimeoutMs === "number" ? extraTimeoutMs : DEFAULT_HEALTH_MS;
  try {
    const res = await httpReqJson({
      path: "/health",
      method: "GET",
      timeoutMs,
    });
    return res.status === 200 && Boolean(res.json && res.json.ok);
  } catch {
    return false;
  }
}

async function postEnqueueViaApi(payload) {
  return httpReqJson({
    path: "/jobs",
    method: "POST",
    body: payload,
    timeoutMs: Number(process.env.SETUP_BOSS_CLI_API_TIMEOUT_MS || 8000),
  });
}

async function getQueueViaApi(query) {
  const q =
    query && typeof query === "object" && Object.keys(query).length
      ? `?${new URLSearchParams(query).toString()}`
      : "";
  return httpReqJson({
    path: `/queue${q}`,
    method: "GET",
    timeoutMs: Number(process.env.SETUP_BOSS_CLI_API_TIMEOUT_MS || 8000),
  });
}

async function getStatusViaApi() {
  return httpReqJson({
    path: "/status",
    method: "GET",
    timeoutMs: Number(process.env.SETUP_BOSS_CLI_API_TIMEOUT_MS || 8000),
  });
}


async function getEventsViaApi(query) {
  const q =
    query && typeof query === "object" && Object.keys(query).length
      ? "?" + new URLSearchParams(query).toString()
      : "";

  return httpReqJson({
    path: "/events" + q,
    method: "GET",
    timeoutMs: Number(process.env.SETUP_BOSS_CLI_API_TIMEOUT_MS || 8000),
  });
}

module.exports = {
  runtimeApiBaseUrl,
  isRuntimeApiAvailable,
  httpReqJson,
  postEnqueueViaApi,
  getQueueViaApi,
  getStatusViaApi,
  getEventsViaApi,
};
