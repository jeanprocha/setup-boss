const fs = require("fs");

function readJsonSafe(filePath, maxBytes = 2_000_000, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const st = fs.statSync(filePath);
    if (st.size > maxBytes) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch (_) {
    return false;
  }
}

function listDirSafe(dir) {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir);
  } catch (_) {
    return [];
  }
}

module.exports = { readJsonSafe, fileExists, listDirSafe };
