const { discoverRuns } = require("../lib/runs-discovery");
const { summarizeRun, formatDurationMs } = require("../lib/run-summarize");
const { formatRow } = require("../render/table");

function formatMoney(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function runList(argv, { repoRoot = null } = {}) {
  const limitRaw = argv.find((a) => a.startsWith("--limit="));
  const limit = limitRaw
    ? Math.max(1, Number(limitRaw.split("=")[1]) || 50)
    : 50;

  const entries = discoverRuns({ includeLegacy: true, repoRoot }).slice(0, limit);
  const rows = entries.map((e) => summarizeRun(e.output_dir, e));

  const headers = [
    "RUN ID",
    "STATUS",
    "MODE",
    "TASK",
    "DURATION",
    "CORR",
    "FILES",
    "COST",
  ];
  const widths = [22, 18, 10, 22, 10, 5, 6, 8];

  const lines = [];
  lines.push(formatRow(headers, widths));
  lines.push("-".repeat(widths.reduce((a, b) => a + b + 2, 0)));

  for (const r of rows) {
    const rid = String(r.run_id).slice(0, widths[0]);
    const mode =
      String(r.execution_mode || "apply").toLowerCase() === "dry_run"
        ? "DRY_RUN"
        : "APPLY";
    const task = String(r.task_title).slice(0, widths[3]);
    const dur = formatDurationMs(r.duration_ms);
    const corr = String(r.correction_iterations ?? 0);
    const files = String(r.changed_files ?? 0);
    const cost = formatMoney(r.cost_usd);

    lines.push(
      formatRow(
        [rid, r.status, mode, task, dur, corr, files, cost],
        widths,
      ),
    );
  }

  if (rows.length === 0) {
    console.log("(nenhuma run indexada ou pasta de output encontrada)");
    return;
  }

  console.log(lines.join("\n"));
}

module.exports = { runList };
