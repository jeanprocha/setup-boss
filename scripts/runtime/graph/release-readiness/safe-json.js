"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Leitura JSON tolerante (read-only).
 * @param {string} dir
 * @param {string} filename
 * @returns {{ ok: boolean, data: object|null, error: string|null }}
 */
function tryReadJsonFile(dir, filename) {
  const base = String(dir || "");
  if (!base) return { ok: false, data: null, error: "dir vazio" };
  const p = path.join(path.resolve(base), filename);
  try {
    if (!fs.existsSync(p)) return { ok: false, data: null, error: `missing: ${filename}` };
    const raw = fs.readFileSync(p, "utf8");
    const data = JSON.parse(raw);
    if (data == null || typeof data !== "object") {
      return { ok: false, data: null, error: `invalid root: ${filename}` };
    }
    return { ok: true, data, error: null };
  } catch (e) {
    const msg = e && e.message ? e.message : String(e || "parse error");
    return { ok: false, data: null, error: `${filename}: ${msg.slice(0, 240)}` };
  }
}

module.exports = {
  tryReadJsonFile,
};
