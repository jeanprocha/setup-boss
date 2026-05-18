"use strict";

const http = require("http");

/**
 * @param {number} port
 * @param {{ path: string, method?: string, body?: object, bodyRaw?: string, headers?: Record<string, string> }} opts
 */
function httpJson(port, opts) {
  const bodyStr =
    opts.body && typeof opts.body === "object"
      ? JSON.stringify(opts.body)
      : opts.bodyRaw || "";

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: opts.path,
        method: opts.method || "GET",
        headers: {
          ...(opts.headers || {}),
          ...(bodyStr
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(bodyStr),
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
          } catch (_) {
            json = null;
          }
          resolve({ status: res.statusCode, json, raw: txt, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/**
 * Lê primeiros eventos SSE (heartbeat ou runtime_event).
 * @param {number} port
 * @param {string} projectId
 * @param {number} timeoutMs
 */
function readSseSample(port, projectId, timeoutMs = 8000) {
  const params = new URLSearchParams({ projectId });
  return new Promise((resolve, reject) => {
    const chunks = [];
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: `/events/stream?${params.toString()}`,
        method: "GET",
        headers: { Accept: "text/event-stream" },
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`SSE status ${res.statusCode}`));
          return;
        }
        res.on("data", (c) => chunks.push(c));
      },
    );
    req.on("error", reject);
    req.end();

    const timer = setTimeout(() => {
      req.destroy();
      resolve(Buffer.concat(chunks).toString("utf8"));
    }, timeoutMs);

    req.on("close", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {() => Promise<boolean>|boolean} cond
 * @param {number} timeoutMs
 * @param {number} stepMs
 */
async function poll(cond, timeoutMs = 20000, stepMs = 150) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await cond()) return;
    await sleep(stepMs);
  }
  throw new Error("poll timeout");
}

module.exports = {
  httpJson,
  readSseSample,
  sleep,
  poll,
};
