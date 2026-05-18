"use strict";

const { stripAccents, normalizeOperationalPhrase } = require("./normalize-operational-plan-language.js");

const STOP = new Set([
  "para",
  "com",
  "sem",
  "uma",
  "um",
  "uns",
  "umas",
  "de",
  "do",
  "da",
  "dos",
  "das",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "ao",
  "aos",
  "que",
  "por",
  "ser",
  "são",
  "esta",
  "este",
  "essa",
  "esse",
  "apenas",
  "também",
  "visual",
]);

/**
 * @param {string} line
 */
function scoreLine(line) {
  let s = 0;
  if (/^Criar\s+/i.test(line)) s += 4;
  if (/^Integrar\s+/i.test(line)) s += 3;
  if (/^Garantir\s+/i.test(line)) s += 2;
  if (/^Validar\s+/i.test(line)) s += 2;
  if (/^Adicionar\s+um\s+/i.test(line)) s -= 2;
  if (/que permita|que possa/i.test(line)) s -= 3;
  if (line.length <= 90) s += 1;
  if (line.length > 120) s -= 1;
  return s;
}

/**
 * @param {string} line
 */
function semanticKey(line) {
  const n = stripAccents(line.toLowerCase());

  if (/\b(bot[aã]o|btn)\b/.test(n) && /\b(abrir|fechar|toggle)\b/.test(n)) {
    return "intent:button-toggle-chat";
  }
  if (/\b(bot[aã]o|btn)\b/.test(n) && /\bchat\b/.test(n)) {
    return "intent:button-chat";
  }
  if (/\bchat\b/.test(n) && /\b(visual|componente|interface|ui)\b/.test(n)) {
    return "intent:chat-visual-component";
  }
  if (/\bchat\b/.test(n) && /\b(criar|componente)\b/.test(n)) {
    return "intent:chat-visual-component";
  }
  if (/\bintegra/.test(n) && /\b(tela|integra|interface)\b/.test(n)) {
    return "intent:integrate-screen";
  }
  if (/\bresponsiv|mobile|desktop\b/.test(n)) {
    return "quality:responsive";
  }
  if (/\btema\b/.test(n) && /\b(claro|escuro|dark)\b/.test(n)) {
    return "quality:theme";
  }
  if (/\breutiliz/.test(n)) {
    return "quality:reusable";
  }
  if (/\bbackend\b/.test(n)) return "scope-out:backend";
  if (/\bmensagens?\b/.test(n) && /\b(envio|real|funcional)\b/.test(n)) {
    return "scope-out:messaging";
  }
  if (/\bwebsocket\b/.test(n)) return "scope-out:websocket";
  if (/\bpersist/.test(n)) return "scope-out:persistence";
  if (/\b(anexo|upload)\b/.test(n)) return "feature:attachments";

  const tokens = n
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w))
    .sort()
    .slice(0, 6)
    .join("|");
  return `misc:${tokens || n.slice(0, 40)}`;
}

/**
 * @param {string[]} items
 */
function dedupeOperationalItems(items) {
  /** @type {Map<string, string>} */
  const byKey = new Map();

  for (const raw of items || []) {
    const line = normalizeOperationalPhrase(String(raw || "").trim());
    if (!line || line.length < 3) continue;
    const key = semanticKey(line);
    const prev = byKey.get(key);
    if (!prev || scoreLine(line) > scoreLine(prev)) {
      byKey.set(key, line);
    }
  }

  return [...byKey.values()];
}

module.exports = {
  semanticKey,
  scoreLine,
  dedupeOperationalItems,
};
