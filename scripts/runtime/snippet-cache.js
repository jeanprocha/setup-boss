/**
 * Cache intra-run de snippets/targeted windows (evita reconstruir em correction loops).
 */
function createSnippetCache({ telemetry } = {}) {
  const mem = new Map();

  function get(key) {
    return mem.get(key) ?? null;
  }

  function set(key, entry) {
    mem.set(key, entry);
  }

  function notify(kind, payload) {
    if (!telemetry) return;
    if (kind === "hit") telemetry.emit("snippet.cache.hit", payload);
    else telemetry.emit("snippet.cache.miss", payload);
  }

  return {
    get,
    set,
    notify,
    size: () => mem.size,
  };
}

module.exports = { createSnippetCache };
