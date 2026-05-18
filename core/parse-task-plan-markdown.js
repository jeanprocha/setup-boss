"use strict";

/**
 * @param {string} title
 */
function normalizeSectionTitle(title) {
  return String(title || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * @param {string} md
 * @returns {{ title: string, body: string }[]}
 */
function parseMarkdownSections(md) {
  const lines = String(md || "").split(/\r?\n/);
  /** @type {{ title: string, body: string[] }[]} */
  const chunks = [];
  let cur = null;
  for (const line of lines) {
    const m = /^##\s+(.+)$/.exec(line);
    if (m) {
      if (cur) chunks.push({ title: cur.title, body: cur.body.join("\n").trim() });
      cur = { title: m[1].trim(), body: [] };
    } else if (cur) {
      cur.body.push(line);
    }
  }
  if (cur) chunks.push({ title: cur.title, body: cur.body.join("\n").trim() });
  return chunks.map((c) => ({ title: c.title, body: c.body }));
}

/**
 * @param {string} body
 * @returns {string[]}
 */
function bulletsFromBody(body) {
  return String(body || "")
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, "").trim())
    .filter((l) => l.length > 0)
    .slice(0, 24);
}

/**
 * @param {string} md
 */
function parseTaskPlanMarkdown(md) {
  const sections = parseMarkdownSections(md);
  /** @type {string[]} */
  let executionOrder = [];
  /** @type {string[]} */
  let completionCriteria = [];
  /** @type {string[]} */
  let outOfScope = [];
  /** @type {string[]} */
  let risks = [];
  let objective = "";
  let summary = "";

  for (const { title, body } of sections) {
    const norm = normalizeSectionTitle(title);
    if ((norm === "objetivo" || norm === "resumo") && !objective) {
      const text = String(body || "").trim();
      if (norm === "resumo") summary = text.slice(0, 2000);
      else objective = text.slice(0, 2000);
    }
    if (
      norm === "passos propostos" ||
      norm === "passos" ||
      norm.startsWith("passos ") ||
      norm.includes("o que sera feito") ||
      norm.includes("sera feito")
    ) {
      executionOrder = bulletsFromBody(body);
    }
    if (
      norm.includes("criterio") ||
      norm.includes("critério") ||
      norm.includes("aceite") ||
      norm.includes("conclusao")
    ) {
      completionCriteria = bulletsFromBody(body);
    }
    if (norm.includes("fora") && norm.includes("escopo")) {
      outOfScope = bulletsFromBody(body);
    }
    if (norm.startsWith("risco")) {
      risks = bulletsFromBody(body);
    }
  }

  return {
    summary: summary || null,
    objective: objective || null,
    executionOrder,
    completionCriteria,
    outOfScope,
    risks,
  };
}

module.exports = {
  normalizeSectionTitle,
  parseMarkdownSections,
  bulletsFromBody,
  parseTaskPlanMarkdown,
};
