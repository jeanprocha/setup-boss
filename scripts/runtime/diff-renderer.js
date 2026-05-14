/**
 * Diffs compactos estilo unified para artefactos humanos (preview).
 */

function normalizeLines(text) {
  return String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

/**
 * Diff simples linha-a-linha (LCS greedy por igualdade de string).
 * Limita número de linhas de saída e marca truncagem.
 */
function simpleTruncatedDiff(beforeText, afterText, maxChars) {
  const cap = Number(maxChars) > 0 ? Number(maxChars) : 12000;
  const hb = String(beforeText ?? "");
  const ha = String(afterText ?? "");
  const half = Math.floor(cap / 2) - 80;
  const head = Math.max(400, half);
  const b =
    hb.length <= cap
      ? hb
      : `${hb.slice(0, head)}\n\n… [antes truncado: ${hb.length} chars] …\n\n${hb.slice(-head)}`;
  const a =
    ha.length <= cap
      ? ha
      : `${ha.slice(0, head)}\n\n… [depois truncado: ${ha.length} chars] …\n\n${ha.slice(-head)}`;
  return [`--- before`, b, `+++ after`, a].join("\n");
}

function buildUnifiedDiffSnippet(beforeText, afterText, options = {}) {
  const maxLines = Number(options.maxLines) > 0 ? Number(options.maxLines) : 80;
  const maxChars = Number(options.maxChars) > 0 ? Number(options.maxChars) : 12000;
  const context = Number(options.context) >= 0 ? Number(options.context) : 3;

  const a = normalizeLines(beforeText);
  const b = normalizeLines(afterText);

  const LINE_CAP = 420;
  if (a.length > LINE_CAP || b.length > LINE_CAP) {
    return {
      text: simpleTruncatedDiff(beforeText, afterText, maxChars),
      truncated: true,
    };
  }

  const m = a.length;
  const n = b.length;

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ type: " ", line: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "-", line: a[i] });
      i += 1;
    } else {
      out.push({ type: "+", line: b[j] });
      j += 1;
    }
  }
  while (i < m) {
    out.push({ type: "-", line: a[i] });
    i += 1;
  }
  while (j < n) {
    out.push({ type: "+", line: b[j] });
    j += 1;
  }

  let hunks = [];
  let cur = [];
  let lastType = null;

  const flush = () => {
    if (!cur.length) return;
    hunks.push(cur);
    cur = [];
  };

  for (const row of out) {
    const t = row.type === " " ? "same" : "chg";
    if (lastType !== null && t !== lastType) flush();
    cur.push(row);
    lastType = t;
  }
  flush();

  const formatted = [];
  let omitted = false;
  let totalOutLines = 0;

  const pushTruncMarker = () => {
    formatted.push("...");
    omitted = true;
    totalOutLines += 1;
  };

  for (let hi = 0; hi < hunks.length; hi++) {
    const hunk = hunks[hi];
    const isChange = hunk.some((r) => r.type !== " ");

    if (!isChange && formatted.length && totalOutLines >= maxLines - context * 2) {
      pushTruncMarker();
      break;
    }

    const padBefore =
      hi > 0 && hunks[hi - 1].some((r) => r.type !== " ") ? context : 0;
    const padAfter =
      hi < hunks.length - 1 && hunks[hi + 1].some((r) => r.type !== " ")
        ? context
        : 0;

    let slice = hunk;
    if (!isChange && hunk.length > padBefore + padAfter + 1) {
      slice = [
        ...hunk.slice(0, padBefore),
        { type: " ", line: `(${hunk.length - padBefore - padAfter} linhas inalteradas omitidas)` },
        ...hunk.slice(-padAfter),
      ];
    }

    for (const row of slice) {
      if (totalOutLines >= maxLines) {
        pushTruncMarker();
        break;
      }
      formatted.push(`${row.type}${row.line}`);
      totalOutLines += 1;
    }

    if (totalOutLines >= maxLines) break;
  }

  let body = formatted.join("\n");
  if (body.length > maxChars) {
    body = `${body.slice(0, maxChars)}\n... [diff truncado por maxChars=${maxChars}]`;
    omitted = true;
  }

  return { text: body, truncated: omitted };
}

module.exports = {
  buildUnifiedDiffSnippet,
  normalizeLines,
  simpleTruncatedDiff,
};
