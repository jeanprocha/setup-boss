const crypto = require("crypto");

/**
 * Serialização determinística por chaves ordenadas (apenas objetos planos/array primitivos).
 */
function stableStringify(val) {
  if (val === null || typeof val !== "object") return JSON.stringify(val);
  if (Array.isArray(val)) {
    return `[${val.map((x) => stableStringify(x)).join(",")}]`;
  }
  const keys = Object.keys(val).sort();
  const parts = [];
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(val, k)) {
      parts.push(`${JSON.stringify(k)}:${stableStringify(val[k])}`);
    }
  }
  return `{${parts.join(",")}}`;
}

function sha256HexOfObject(obj) {
  return crypto.createHash("sha256").update(stableStringify(obj)).digest("hex");
}

module.exports = { stableStringify, sha256HexOfObject };
