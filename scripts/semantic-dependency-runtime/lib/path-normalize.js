"use strict";

/**
 * Normalização relativa tipo POSIX (sem escanear disco).
 */

function normalizePathPOSIX(p) {
  const s = String(p ?? "").trim().replace(/\\/g, "/");
  if (!s) return "";
  return s.replace(/\/+/g, "/");
}

module.exports = { normalizePathPOSIX };
