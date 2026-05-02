// core/cache.js

const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(process.cwd(), '.setup-boss', 'cache');

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCachePath(key) {
  return path.join(CACHE_DIR, `${key}.json`);
}

function saveCache(key, data) {
  ensureCacheDir();
  fs.writeFileSync(getCachePath(key), JSON.stringify({
    timestamp: Date.now(),
    data
  }, null, 2));
}

function loadCache(key, ttlMs) {
  const file = getCachePath(key);

  if (!fs.existsSync(file)) return null;

  const content = JSON.parse(fs.readFileSync(file, 'utf-8'));

  const isExpired = Date.now() - content.timestamp > ttlMs;

  if (isExpired) return null;

  return content.data;
}

module.exports = {
  saveCache,
  loadCache
};