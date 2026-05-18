"use strict";

const {
  detectVisualOnlyScope,
  normalizeOperationalPhrase,
  stripAccents,
} = require("./normalize-operational-plan-language.js");
const {
  parseLineToAtoms,
  mergeAtomsByKind,
} = require("./normalize-operational-plan-structure.js");
const { isInternalOperationalLine } = require("./sanitize-operational-plan-content.js");
const { inferCanonicalComplexity } = require("./infer-operational-plan-complexity.js");

/**
 * @typedef {object} OperationalPlanCanonical
 * @property {string|null} understanding
 * @property {string|null} objective
 * @property {Array<{ kind: string, label: string }>} deliverables
 * @property {string[]} outOfScope
 * @property {Array<{ kind: string, label: string }>} tasks
 * @property {string[]} risks
 * @property {string[]} completionCriteria
 * @property {{ level: "low"|"medium"|"high", factors: string[] }} complexity
 * @property {boolean} visualOnly
 * @property {{ reusable: boolean, responsive: boolean, theme: boolean, chat: boolean, button: boolean, integrate: boolean }} flags
 */

/**
 * @param {object} presentation
 * @returns {string[]}
 */
function collectSourceLines(presentation) {
  /** @type {string[]} */
  const lines = [];
  const push = (v) => {
    const t = String(v || "").trim();
    if (t) lines.push(t);
  };

  push(presentation.understanding?.summary);
  push(presentation.understanding?.mainObjective);
  for (const x of presentation.whatWillBeDone || []) push(x);
  for (const x of presentation.whatWillChange || []) push(x);
  for (const x of presentation.outOfScope || []) push(x);
  for (const x of presentation.completionCriteria || []) push(x);
  for (const x of presentation.executionStrategy?.macroOrder || []) push(x);
  push(presentation.executionStrategy?.approach);
  for (const x of presentation.executionStrategy?.dependencies || []) push(x);
  for (const r of presentation.risks || []) {
    push(typeof r === "string" ? r : r?.label);
  }
  for (const t of presentation.miniTasks?.tasks || []) push(t?.title);

  return lines;
}

/**
 * @param {ReturnType<typeof mergeAtomsByKind>} atoms
 * @param {boolean} visualOnly
 * @param {string[]} sourceLines
 */
function buildFlags(atoms, visualOnly, sourceLines = []) {
  const kinds = new Set(atoms.map((a) => a.kind));
  const corpus = stripAccents(
    [...sourceLines, ...atoms.map((a) => a.label)].join(" ").toLowerCase(),
  );
  return {
    reusable:
      kinds.has("flag:reusable") ||
      atoms.some((a) => /reutiliz/i.test(a.label)) ||
      /\breutiliz/.test(corpus),
    responsive:
      kinds.has("task:validate_responsive") ||
      atoms.some((a) => /responsiv/i.test(a.label)) ||
      /\bresponsiv|mobile|desktop\b/.test(corpus),
    theme:
      kinds.has("task:validate_theme") ||
      atoms.some((a) => /tema|claro|escuro/i.test(a.label)) ||
      (/\btema\b/.test(corpus) && /\b(claro|escuro|dark)\b/.test(corpus)) ||
      /\bclaro\s*\/\s*escuro\b/.test(corpus),
    chat: kinds.has("deliverable:chat_visual"),
    button: kinds.has("deliverable:button_toggle"),
    integrate: kinds.has("deliverable:integrate"),
    visualOnly,
  };
}

/**
 * @param {ReturnType<typeof mergeAtomsByKind>} atoms
 */
function extractDeliverables(atoms) {
  const order = [
    "deliverable:chat_visual",
    "deliverable:button_toggle",
    "deliverable:integrate",
    "deliverable:attachments_structural",
    "deliverable:attachments",
  ];
  /** @type {Array<{ kind: string, label: string }>} */
  const out = [];
  for (const kind of order) {
    const atom = atoms.find((a) => a.kind === kind);
    if (atom) out.push({ kind: atom.kind, label: atom.label });
  }
  for (const atom of atoms) {
    if (
      atom.kind.startsWith("generic:") &&
      !out.some((d) => d.label.toLowerCase() === atom.label.toLowerCase())
    ) {
      out.push({ kind: atom.kind, label: atom.label });
    }
  }
  return out;
}

/**
 * @param {ReturnType<typeof mergeAtomsByKind>} atoms
 * @param {{ chat: boolean, button: boolean, integrate: boolean, responsive: boolean, theme: boolean }} flags
 */
function extractTasks(atoms, flags) {
  /** @type {Array<{ kind: string, label: string }>} */
  const tasks = [];

  if (flags.chat) {
    tasks.push({
      kind: "task:chat_visual",
      label: "Criar componente visual do chat.",
    });
  }
  if (flags.button) {
    tasks.push({
      kind: "task:button_toggle",
      label: "Criar componente de botão para abertura e fechamento.",
    });
  }
  if (flags.integrate || (flags.chat && flags.button)) {
    if (!tasks.some((t) => t.kind === "task:integrate")) {
      tasks.push({
        kind: "task:integrate",
        label: "Integrar chat e botão na tela de Integrações.",
      });
    }
  }
  if (flags.responsive) {
    tasks.push({
      kind: "task:validate_responsive",
      label: "Validar responsividade.",
    });
  }
  if (flags.theme) {
    tasks.push({
      kind: "task:validate_theme",
      label: "Validar tema claro/escuro.",
    });
  }

  return tasks;
}

const VISUAL_ONLY_OUT_OF_SCOPE_DEFAULTS = [
  "Envio real de mensagens.",
  "Backend do chat.",
  "Persistência.",
  "WebSocket.",
  "Integração com IA ou APIs externas.",
];

/**
 * @param {string[]} items
 * @param {string} item
 */
function pushUniqueOutOfScope(items, item) {
  const t = String(item || "").trim();
  if (!t) return;
  const key = stripAccents(t.toLowerCase()).slice(0, 24);
  if (items.some((x) => stripAccents(x.toLowerCase()).slice(0, 24) === key)) {
    return;
  }
  items.push(t.endsWith(".") ? t : `${t}.`);
}

/**
 * @param {ReturnType<typeof mergeAtomsByKind>} atoms
 * @param {boolean} visualOnly
 * @param {string[]} originalOutOfScope
 */
function extractOutOfScope(atoms, visualOnly, originalOutOfScope = []) {
  /** @type {string[]} */
  const out = [];

  for (const raw of originalOutOfScope || []) {
    const line = String(raw || "").trim();
    if (!line) continue;
    const lineAtoms = parseLineToAtoms(line, visualOnly).filter((a) =>
      a.kind.startsWith("scope_out:"),
    );
    if (lineAtoms.length) {
      for (const atom of lineAtoms) pushUniqueOutOfScope(out, atom.label);
    } else {
      const normalized = normalizeOperationalPhrase(line);
      if (normalized) pushUniqueOutOfScope(out, normalized);
    }
  }

  for (const atom of atoms) {
    if (atom.kind.startsWith("scope_out:")) {
      pushUniqueOutOfScope(out, atom.label);
    }
  }

  if (visualOnly) {
    for (const d of VISUAL_ONLY_OUT_OF_SCOPE_DEFAULTS) {
      pushUniqueOutOfScope(out, d);
    }
  }

  return [...new Set(out.map((x) => x.trim()))].slice(0, 12);
}

/**
 * @param {{ chat: boolean, button: boolean, responsive: boolean, theme: boolean, reusable: boolean, integrate: boolean, visualOnly: boolean }} flags
 * @param {number} deliverableCount
 * @param {{ visualOnly: boolean, sourceLines: string[], whatWillBeDone: string[], outOfScope: string[] }} ctx
 */
function inferComplexity(flags, deliverableCount, ctx) {
  return inferCanonicalComplexity({
    flags,
    deliverableCount,
    visualOnly: ctx.visualOnly,
    sourceLines: ctx.sourceLines,
    whatWillBeDone: ctx.whatWillBeDone,
    outOfScope: ctx.outOfScope,
  });
}

/**
 * Transforma apresentação (possivelmente poluída) em estrutura canônica.
 * Não propaga texto cru — apenas átomos semânticos inferidos.
 *
 * @param {object|null|undefined} presentation
 * @returns {OperationalPlanCanonical|null}
 */
function canonicalizeOperationalPlanFromPresentation(presentation) {
  if (!presentation || typeof presentation !== "object") return null;

  const sourceLines = collectSourceLines(presentation);
  const provisionalDone = (presentation.whatWillBeDone || []).filter(Boolean);
  const provisionalOut = (presentation.outOfScope || []).filter(Boolean);
  const visualOnly = detectVisualOnlyScope(provisionalDone, provisionalOut);

  /** @type {ReturnType<typeof parseLineToAtoms>[number][]} */
  const parsed = [];
  for (const line of sourceLines) {
    if (isInternalOperationalLine(line)) continue;
    for (const atom of parseLineToAtoms(line, visualOnly)) {
      parsed.push(atom);
    }
  }

  const atoms = mergeAtomsByKind(parsed);
  const flags = buildFlags(atoms, visualOnly, sourceLines);
  const deliverables = extractDeliverables(atoms);

  if (!flags.integrate && flags.chat && flags.button) {
    deliverables.push({
      kind: "deliverable:integrate",
      label: "Integrar os componentes na tela de Integrações.",
    });
    flags.integrate = true;
  }

  const tasks = extractTasks(atoms, flags);
  const outOfScope = extractOutOfScope(atoms, visualOnly, provisionalOut);
  const complexity = inferComplexity(flags, deliverables.length, {
    visualOnly,
    sourceLines,
    whatWillBeDone: provisionalDone,
    outOfScope: provisionalOut,
  });

  const risks = (presentation.risks || [])
    .map((r) => normalizeOperationalPhrase(typeof r === "string" ? r : r?.label || ""))
    .filter((l) => l && !isInternalOperationalLine(l) && !/skip-llm|nuance semântica/i.test(l));

  return {
    understanding: null,
    objective: null,
    deliverables,
    outOfScope,
    tasks,
    risks,
    completionCriteria: [],
    complexity,
    visualOnly,
    flags,
  };
}

module.exports = {
  canonicalizeOperationalPlanFromPresentation,
  collectSourceLines,
  buildFlags,
  extractOutOfScope,
  VISUAL_ONLY_OUT_OF_SCOPE_DEFAULTS,
};
