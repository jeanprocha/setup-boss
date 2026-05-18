"use strict";

const fs = require("fs");
const path = require("path");

const { PLAN_REFINED } = require("./analyze-complexity");

const MAX_SUBTASKS = 8;

/** @type {readonly string[]} */
const RELEVANT_SECTION_SLUGS = Object.freeze([
  "objetivo",
  "escopo refinado",
  "escopo",
  "passos propostos",
  "passos",
  "decisões confirmadas",
  "decisoes confirmadas",
  "decisões",
  "decisoes",
  "critérios de aceite",
  "criterios de aceite",
  "critérios",
  "criterios",
]);

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
 * @param {string} titleNorm
 */
function isRelevantSection(titleNorm) {
  if (!titleNorm) return false;
  if (/^fora de escopo/.test(titleNorm)) return false;
  if (/^riscos restantes/.test(titleNorm)) return false;
  if (/^riscos\b/.test(titleNorm)) return false;
  for (const slug of RELEVANT_SECTION_SLUGS) {
    if (titleNorm === slug || titleNorm.startsWith(slug + " ")) return true;
  }
  return false;
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
  return chunks;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function extractFilePaths(text) {
  const out = new Set();
  const re = /`([^`]+)`/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const inner = String(m[1] || "").trim();
    if (
      /[/\\]/.test(inner) ||
      /\.(js|ts|tsx|jsx|mjs|cjs|json|md|yml|yaml|toml|xml|html|css|scss)$/i.test(inner)
    ) {
      out.add(inner.replace(/\\/g, "/"));
    }
  }
  return [...out];
}

/**
 * @param {string} fp
 */
function domainFromPath(fp) {
  const p = String(fp || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const i = p.indexOf("/");
  return i === -1 ? p || "root" : p.slice(0, i) || "root";
}

/**
 * @param {string[]} files
 * @returns {Map<string, string[]>}
 */
function groupFilesByDomain(files) {
  const m = new Map();
  for (const f of files) {
    const d = domainFromPath(f);
    if (!m.has(d)) m.set(d, []);
    m.get(d).push(f);
  }
  return m;
}

/**
 * @param {number} n
 * @param {number} lo
 * @param {number} hi
 */
function clampInt(n, lo, hi) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

/**
 * @param {string} id
 */
function padSubtaskId(id) {
  const n = parseInt(String(id), 10);
  if (!Number.isFinite(n) || n < 1) return "001";
  return String(n).padStart(3, "0");
}

/**
 * @param {Record<string, unknown>} complexityDoc
 */
function scoresFromComplexity(complexityDoc) {
  const s = /** @type {Record<string, unknown>} */ (
    complexityDoc && typeof complexityDoc === "object" && !Array.isArray(complexityDoc)
      ? complexityDoc.scores
      : {}
  );
  const sc =
    s && typeof s === "object" && !Array.isArray(s) ? /** @type {Record<string, unknown>} */ (s) : {};
  return {
    overall: clampInt(sc.overall, 0, 10),
    risk: clampInt(sc.risk, 0, 10),
    scope: clampInt(sc.scope, 0, 10),
  };
}

/**
 * @param {Record<string, unknown>} aiDoc
 * @returns {"basic"|"standard"|"expert"}
 */
function aiModeFromStrategy(aiDoc) {
  const m = String(
    aiDoc && typeof aiDoc === "object" && !Array.isArray(aiDoc)
      ? /** @type {Record<string, unknown>} */ (aiDoc).recommended_mode || ""
      : "",
  );
  if (m === "basic" || m === "standard" || m === "expert") return m;
  return "standard";
}

/**
 * @param {string} body
 * @returns {string[]}
 */
function bulletsAsCriteria(body) {
  const lines = String(body || "").split(/\r?\n/);
  /** @type {string[]} */
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    const m = /^[-*]\s+(.+)$/.exec(t) || /^\d+\.\s+(.+)$/.exec(t);
    if (m && m[1]) out.push(m[1].trim());
  }
  return out.slice(0, 12);
}

/**
 * @param {{
 *   outputDirAbs: string,
 *   complexityDoc: Record<string, unknown>,
 *   aiDoc: Record<string, unknown>,
 * }} p
 * @returns {{
 *   ok: true,
 *   decomposition: Record<string, unknown>,
 *   subtaskFiles: { id: string, relPath: string, doc: Record<string, unknown> }[],
 * } | { ok: false, error: { code: string, message: string } }}
 */
function decomposeTask(p) {
  const root = path.resolve(String(p.outputDirAbs || ""));
  const complexityDoc = p.complexityDoc;
  const aiDoc = p.aiDoc;
  if (!complexityDoc || typeof complexityDoc !== "object" || Array.isArray(complexityDoc)) {
    return { ok: false, error: { code: "DECOMPLEXITY", message: "complexityDoc inválido." } };
  }
  if (!aiDoc || typeof aiDoc !== "object" || Array.isArray(aiDoc)) {
    return { ok: false, error: { code: "DECOAI", message: "aiDoc inválido." } };
  }

  let plan = "";
  try {
    const planPath = path.join(root, PLAN_REFINED);
    if (fs.existsSync(planPath)) plan = fs.readFileSync(planPath, "utf-8");
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    return { ok: false, error: { code: "DECOPLAN", message: msg } };
  }

  const { overall, risk } = scoresFromComplexity(complexityDoc);
  const mode = aiModeFromStrategy(aiDoc);
  const allFiles = extractFilePaths(plan);
  const fileRefs = allFiles.length;

  /** @type {string[]} */
  const rationale = [];
  /** @type {{ title: string, goal: string, body: string, files: string[], domains: string[] }[]} */
  let rawTasks = [];

  let strategy = "single";

  if (overall <= 3) {
    strategy = "single";
    rationale.push("overall<=3: subtask única (MVP).");
    const doms = [...new Set(allFiles.map(domainFromPath))].filter(Boolean);
    rawTasks.push({
      title: "Execução consolidada",
      goal: "Implementar o plano refinado como unidade única de entrega.",
      body: plan.trim(),
      files: allFiles,
      domains: doms,
    });
  } else {
    const sections = parseMarkdownSections(plan);
    const relevant = sections.filter((s) => {
      const norm = normalizeSectionTitle(s.title);
      if (!isRelevantSection(norm)) return false;
      return String(s.body || "").trim().length >= 12;
    });

    if (relevant.length >= 2) {
      strategy = "section_based";
      rationale.push(`Plano com ${relevant.length} secções relevantes (## …).`);
      for (const s of relevant.slice(0, MAX_SUBTASKS)) {
        const files = extractFilePaths(s.body);
        const doms = [...new Set(files.map(domainFromPath))];
        rawTasks.push({
          title: s.title,
          goal: `Cumprir a secção «${s.title}» do plano refinado.`,
          body: s.body,
          files,
          domains: doms,
        });
      }
    } else if (fileRefs >= 6) {
      strategy = "file_group_based";
      rationale.push(`Muitas referências a ficheiros (${fileRefs}): agrupamento por domínio/path.`);
      const groups = groupFilesByDomain(allFiles);
      const keys = [...groups.keys()].sort();
      for (const k of keys.slice(0, MAX_SUBTASKS)) {
        const files = groups.get(k) || [];
        rawTasks.push({
          title: `Alterações em «${k}»`,
          goal: `Aplicar mudanças nos ficheiros do domínio «${k}».`,
          body: files.map((f) => `- \`${f}\``).join("\n"),
          files,
          domains: [k],
        });
      }
    } else {
      strategy = "single";
      rationale.push("Sem secções suficientes e poucos ficheiros citados: subtask única.");
      const doms = [...new Set(allFiles.map(domainFromPath))].filter(Boolean);
      rawTasks.push({
        title: "Execução consolidada",
        goal: "Implementar o plano refinado como unidade única de entrega.",
        body: plan.trim(),
        files: allFiles,
        domains: doms,
      });
    }
  }

  rawTasks = rawTasks.filter((t) => String(t.title || "").trim() !== "" && String(t.goal || "").trim() !== "");
  if (!rawTasks.length) {
    return { ok: false, error: { code: "DECOEMPTY", message: "Decomposição gerou zero subtasks válidas." } };
  }

  if (risk >= 7) {
    const hasVal = rawTasks.some((t) => {
      const n = normalizeSectionTitle(t.title);
      return (
        n.includes("valid") ||
        n.includes("validação") ||
        n.includes("validacao") ||
        n.includes("teste") ||
        n.includes("critério") ||
        n.includes("criterio")
      );
    });
    if (!hasVal && rawTasks.length < MAX_SUBTASKS) {
      rationale.push("risk>=7: subtask dedicada a validação/testes.");
      if (strategy === "single" && rawTasks.length === 1) strategy = "risk_based";
      const lastImplIndex = rawTasks.length;
      rawTasks.push({
        title: "Validação, revisão e testes",
        goal: "Validar mudanças, correr verificações mínimas e fechar riscos residuais.",
        body: "",
        files: [],
        domains: ["validation"],
        _depsFromCount: lastImplIndex,
      });
    }
  }

  if (rawTasks.length > MAX_SUBTASKS) {
    rawTasks = rawTasks.slice(0, MAX_SUBTASKS);
    rationale.push(`Limite MVP: no máximo ${MAX_SUBTASKS} subtasks.`);
  }

  /** @type {Record<string, unknown>[]} */
  const decompositionSubtasks = [];
  /** @type { { id: string, relPath: string, doc: Record<string, unknown> }[] } */
  const subtaskFiles = [];

  let idx = 0;
  for (const t of rawTasks) {
    idx += 1;
    const id = padSubtaskId(String(idx));
    const crit =
      normalizeSectionTitle(t.title).includes("criterio") ||
      normalizeSectionTitle(t.title).includes("critério")
        ? bulletsAsCriteria(t.body)
        : bulletsAsCriteria(t.body).length
          ? bulletsAsCriteria(t.body)
          : ["Entrega alinhada ao plano refinado.", "Sem regressões conhecidas nas áreas tocadas."];

    /** @type {string[]} */
    let dependencies = [];
    if (t.domains && t.domains.includes("validation") && /** @type {any} */ (t)._depsFromCount) {
      const prev = padSubtaskId(String(/** @type {number} */ (/** @type {any} */ (t)._depsFromCount)));
      dependencies = [prev];
    }

    const est = clampInt(overall, 0, 10);
    const doc = {
      version: 1,
      id,
      title: t.title,
      goal: t.goal,
      scope: {
        files: t.files,
        domains: t.domains && t.domains.length ? t.domains : [...new Set(t.files.map(domainFromPath))],
      },
      dependencies,
      complexity: {
        estimated_score: est,
        risk: clampInt(risk, 0, 10),
      },
      ai_mode: mode,
      acceptance_criteria: crit.length ? crit : ["Critérios definidos no plano refinado."],
      status: "planned",
    };
    decompositionSubtasks.push({ id, title: t.title });
    subtaskFiles.push({
      id,
      relPath: `strategy/subtasks/${id}.json`,
      doc,
    });
  }

  const decomposition = {
    version: 1,
    phase: "3.4",
    status: "decomposition_completed",
    subtask_count: subtaskFiles.length,
    strategy,
    rationale,
    subtasks: decompositionSubtasks,
  };

  return { ok: true, decomposition, subtaskFiles };
}

module.exports = {
  decomposeTask,
  parseMarkdownSections,
  extractFilePaths,
  MAX_SUBTASKS,
};
