/**
 * Artefacto patch-preview.md — visão consolidada para revisão humana.
 */

const fs = require("fs");
const path = require("path");
const { normalizeRelativePath } = require("../shared-utils");
const { buildUnifiedDiffSnippet } = require("./diff-renderer");

const MAX_SEARCH_REPLACE_CHARS = Number(
  process.env.PATCH_PREVIEW_SEARCH_REPLACE_CHARS || 8000,
);
const MICRO_DIFF_MAX_LINES = Number(process.env.PATCH_PREVIEW_MICRO_DIFF_LINES || 48);
const LARGE_REPLACE_THRESHOLD = Number(
  process.env.PATCH_PREVIEW_LARGE_REPLACE || 2000,
);

function truncateMiddle(text, maxLen) {
  const s = String(text ?? "");
  if (s.length <= maxLen) return s;
  const head = Math.floor(maxLen * 0.45);
  const tail = maxLen - head - 50;
  return `${s.slice(0, head)}\n\n… [truncado ${s.length - maxLen} chars] …\n\n${s.slice(-tail)}`;
}

function uniquePaths(applied) {
  const seen = new Set();
  const order = [];
  if (!Array.isArray(applied)) return order;
  for (const item of applied) {
    const p = normalizeRelativePath(item?.path || "");
    if (!p || seen.has(p)) continue;
    seen.add(p);
    order.push(p);
  }
  return order;
}

function computeRiskIndicators(applied) {
  const paths = uniquePaths(applied);
  const ops = Array.isArray(applied) ? applied.length : 0;
  let largeReplacements = 0;
  let patchChars = 0;

  if (Array.isArray(applied)) {
    for (const ch of applied) {
      const rl = Number(ch?.replace_length) || String(ch?.replace || "").length;
      const sl = Number(ch?.search_length) || String(ch?.search || "").length;
      patchChars += sl + rl;
      if (rl >= LARGE_REPLACE_THRESHOLD || sl >= LARGE_REPLACE_THRESHOLD) {
        largeReplacements += 1;
      }
    }
  }

  let risk = "LOW";
  if (
    largeReplacements >= 3 ||
    ops > 25 ||
    paths.length > 15 ||
    patchChars > 120_000
  ) {
    risk = "HIGH";
  } else if (
    ops > 10 ||
    paths.length > 6 ||
    largeReplacements >= 1 ||
    patchChars > 40_000
  ) {
    risk = "MEDIUM";
  }

  return {
    files_changed: paths.length,
    patch_operations: ops,
    large_replacements: largeReplacements,
    approximate_patch_chars: patchChars,
    risk_level: risk,
    touched_paths: paths,
  };
}

function renderAppliedMicroDiff(appliedItem) {
  const search = truncateMiddle(appliedItem?.search ?? "", MAX_SEARCH_REPLACE_CHARS);
  const replace = truncateMiddle(appliedItem?.replace ?? "", MAX_SEARCH_REPLACE_CHARS);
  const { text, truncated } = buildUnifiedDiffSnippet(search, replace, {
    maxLines: MICRO_DIFF_MAX_LINES,
    maxChars: 9000,
    context: 2,
  });
  const fence = "```diff";
  const tail = truncated ? "\n_(diff micro truncado — ver executor-changes.json para texto integral)_\n" : "";
  return `${fence}\n${text}\n\`\`\`${tail}`;
}

function buildPatchPreviewMarkdown(applied, executionMeta = {}) {
  const ind = computeRiskIndicators(applied);
  const mode =
    executionMeta && executionMeta.mode === "dry_run" ? "DRY RUN" : "APPLY";

  const lines = [];
  lines.push("# Patch preview");
  lines.push("");
  lines.push("Resumo gerado automaticamente para revisão humana (não substitui `executor-changes.json`).");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Execution mode:** ${mode}`);
  lines.push(
    `- **Applied to project:** ${executionMeta.applied_to_project === true ? "YES" : executionMeta.applied_to_project === false ? "NO" : "—"}`,
  );
  lines.push(
    `- **Pending physical apply:** ${executionMeta.pending_apply === true ? "YES" : executionMeta.pending_apply === false ? "NO" : "—"}`,
  );
  lines.push(`- **Files changed:** ${ind.files_changed}`);
  lines.push(`- **Patch operations:** ${ind.patch_operations}`);
  lines.push(`- **Large replacements (≥ ${LARGE_REPLACE_THRESHOLD} chars):** ${ind.large_replacements}`);
  lines.push(`- **Approx. patch payload size (chars):** ${ind.approximate_patch_chars}`);
  lines.push(`- **Risk level:** ${ind.risk_level}`);
  lines.push("");
  lines.push("## Risk indicators");
  lines.push("");
  lines.push(
    `Level **${ind.risk_level}** — baseado em contagem de ficheiros, operações, substituições grandes e tamanho agregado dos patches.`,
  );
  lines.push("");

  if (!Array.isArray(applied) || applied.length === 0) {
    lines.push("## Operations");
    lines.push("");
    lines.push("_Nenhuma operação aplicável registada nesta passagem._");
    lines.push("");
    return lines.join("\n");
  }

  lines.push("## Operations by file");
  lines.push("");

  const byPath = new Map();
  for (let i = 0; i < applied.length; i++) {
    const item = applied[i];
    const p = normalizeRelativePath(item?.path || "");
    if (!p) continue;
    if (!byPath.has(p)) byPath.set(p, []);
    byPath.get(p).push({ idx: i + 1, item });
  }

  for (const p of ind.touched_paths) {
    const ops = byPath.get(p) || [];
    lines.push(`### \`${p}\``);
    lines.push("");
    for (const { idx, item } of ops) {
      lines.push(`#### Operation ${idx} (${item.operation || "patch"})`);
      lines.push("");
      lines.push(`- **Reason:** ${String(item.reason || "(not provided)").slice(0, 800)}`);
      lines.push(
        `- **Lengths:** before ${item.before_length ?? "—"} → after ${item.after_length ?? "—"} | search ${item.search_length ?? "—"} | replace ${item.replace_length ?? "—"}`,
      );
      lines.push("");
      lines.push("Micro-diff (`search` → `replace`, linhas):");
      lines.push("");
      lines.push(renderAppliedMicroDiff(item));
      lines.push("");
    }
  }

  lines.push("## Apply-later hints");
  lines.push("");
  lines.push(
    "- Manifesto reproduzível: use `executor-changes.json` + estado inicial do projeto no momento da run.",
  );
  lines.push(
    "- Overlay opcional: ver `virtual-project-overlay.json` quando gerado em dry-run.",
  );
  lines.push("");

  return lines.join("\n");
}

function writePatchPreviewArtifact(outputDir, applied, executionMeta, outFs = null) {
  const md = buildPatchPreviewMarkdown(applied, executionMeta);
  const target = path.join(outputDir, "patch-preview.md");
  if (outFs && typeof outFs.writeUtf8 === "function") {
    outFs.writeUtf8(target, md);
  } else {
    fs.writeFileSync(target, md, "utf-8");
  }

  const summaryPath = path.join(outputDir, "patch-preview-summary.json");
  const ind = computeRiskIndicators(applied);
  const payload = {
    generated_at: new Date().toISOString(),
    execution: executionMeta || {},
    ...ind,
  };
  if (outFs && typeof outFs.writeJson === "function") {
    outFs.writeJson(summaryPath, payload);
  } else {
    fs.writeFileSync(summaryPath, JSON.stringify(payload, null, 2), "utf-8");
  }

  return { mdPath: target, summaryPath };
}

module.exports = {
  buildPatchPreviewMarkdown,
  computeRiskIndicators,
  writePatchPreviewArtifact,
};
