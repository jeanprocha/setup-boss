const fs = require("fs");
const path = require("path");

/**
 * Cache UTF-8 in-memory por run. Invalida entrada no write.
 */
function createFileCache({ telemetry } = {}) {
  const mem = new Map();

  function key(p) {
    return path.resolve(String(p));
  }

  function invalidate(p) {
    const k = key(p);
    mem.delete(k);
    if (telemetry) telemetry.emit("cache.invalidate", { path: k });
  }

  function readFileSync(absPath, encoding = "utf8") {
    const k = key(absPath);
    if ((encoding === "utf8" || encoding === "utf-8") && mem.has(k)) {
      if (telemetry) telemetry.emit("cache.hit", { path: k });
      return mem.get(k);
    }
    if (telemetry) {
      telemetry.emit("cache.miss", { path: k });
      telemetry.emit("file.read", { path: k });
    }
    const content = fs.readFileSync(absPath, encoding);
    if (encoding === "utf8" || encoding === "utf-8") {
      mem.set(k, typeof content === "string" ? content : content.toString("utf8"));
    }
    return content;
  }

  function writeFileSync(absPath, data, encoding = "utf8") {
    const k = key(absPath);
    mem.delete(k);
    if (telemetry) telemetry.emit("file.write", { path: k });
    return fs.writeFileSync(absPath, data, encoding);
  }

  function existsSync(absPath) {
    const k = key(absPath);
    if (mem.has(k)) return true;
    return fs.existsSync(absPath);
  }

  function readJsonSync(absPath) {
    return JSON.parse(readFileSync(absPath, "utf8"));
  }

  function writeJsonSync(absPath, data) {
    writeFileSync(absPath, JSON.stringify(data, null, 2), "utf8");
  }

  return {
    readFileSync,
    writeFileSync,
    existsSync,
    readJsonSync,
    writeJsonSync,
    invalidate,
  };
}

module.exports = { createFileCache };
