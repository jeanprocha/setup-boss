/**
 * Adaptador de leitura/gravação UTF-8 + JSON sobre `ctx.cache` (in-run).
 */
function createOutputFs(io) {
  if (!io) return null;
  return {
    writeJson(filePath, data) {
      io.writeJsonSync(filePath, data);
    },
    writeUtf8(filePath, text) {
      io.writeFileSync(filePath, text, "utf-8");
    },
    readUtf8(filePath) {
      return io.readFileSync(filePath, "utf-8");
    },
    readJson(filePath) {
      return io.readJsonSync(filePath);
    },
    exists(filePath) {
      return io.existsSync(filePath);
    },
    readJsonIfExists(filePath, fallback = null) {
      if (!io.existsSync(filePath)) return fallback;
      try {
        return io.readJsonSync(filePath);
      } catch (_) {
        return fallback;
      }
    },
    readIfExists(filePath) {
      if (!io.existsSync(filePath)) return "";
      return io.readFileSync(filePath, "utf-8");
    },
  };
}

module.exports = { createOutputFs };
