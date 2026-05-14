/**
 * Diagnóstico operacional do runtime Setup-Boss (Fase 2.8).
 */

const fs = require("fs");
const path = require("path");
const { getCliPaths } = require("../lib/paths");
const { discoverRuns } = require("../lib/runs-discovery");
const { loadMergedPolicy } = require("../../runtime/governance/policy-loader");
const { validateRunArtifacts } = require("../../runtime/validation/run-artifacts-validator");
const { validateLifecycleConsistency } = require("../../runtime/validation/lifecycle-consistency");
const { buildTemporalInspectReport } = require("../../runtime/replay/temporal-status");
const { lockIsStale } = require("../../daemon/lib/project-lock");
const {
  deriveProjectId,
  canonicalProjectRoot,
  resolveProjectSelector,
} = require("../../daemon/lib/project-registry");

/** @param {{ projectId?: string|null, projectRootCanonical?: string|null }} ctx @param {object} j */
function jobMatchesProjectContext(ctx, j) {
  if (!ctx || (!ctx.projectId && !ctx.projectRootCanonical)) return true;

  const pid =
    j.projectId != null && String(j.projectId).trim()
      ? String(j.projectId).trim()
      : j.projectRoot
        ? deriveProjectId(String(j.projectRoot))
        : null;

  if (ctx.projectId && pid !== ctx.projectId) return false;

  if (ctx.projectRootCanonical) {
    if (canonicalProjectRoot(String(j.projectRoot || "")) !== ctx.projectRootCanonical) return false;
  }

  return true;
}

/**
 * Diagnóstico daemon/fila (Fase 3.5) — não altera ficheiros.
 * @param {string} cliRoot
 * @param {{ ok: boolean, checks: object, warnings: string[] }} report
 * @param {{ projectId?: string|null, projectRootCanonical?: string|null }} [projectCtx]
 */
function augmentDoctorOperational(cliRoot, report, projectCtx = null) {
  const prev = process.env.SETUP_BOSS_CLI_ROOT;
  process.env.SETUP_BOSS_CLI_ROOT = cliRoot;
  try {
    const {
      validateQueueStrict,
      loadQueueUnsafe,
      jobIsDelayedPending,
      parseIsoMs,
      jobRecordLooksStuck,
      jobIsRetryable,
    } = require("../../daemon/lib/queue-store");
    const { validateRuntimeEventsReadable, readRuntimeEventsFiltered } = require(
      "../../daemon/lib/runtime-events",
    );
    const { readDaemonPidRaw, isPidAlive } = require("../../daemon/lib/pid-file");
    const { readDaemonStatus } = require("../../daemon/lib/daemon-status");
    const { getDaemonDirs } = require("../../daemon/lib/daemon-paths");

    const qv = validateQueueStrict();
    report.checks.queue_json = qv.ok ? "OK" : "INVALID";
    if (!qv.ok) {
      report.ok = false;
      report.warnings.push(`queue.json inválido: ${qv.error || ""}`);
    }

    const ev = validateRuntimeEventsReadable();
    report.checks.events_jsonl = ev.ok ? "OK" : "INVALID";
    if (!ev.ok) report.warnings.push(`events.jsonl: ${ev.error || ""}`);

    const pidRaw = readDaemonPidRaw();
    let pidLabel = "no_pid_file";
    if (pidRaw != null && Number.isFinite(Number(pidRaw))) {
      pidLabel = isPidAlive(Number(pidRaw)) ? "daemon_pid_alive" : "daemon_pid_stale";
    }
    report.checks.daemon_pid = pidLabel;
    if (pidLabel === "daemon_pid_stale")
      report.warnings.push("Ficheiro pid do daemon aponta para processo inexistente.");

    const { locksDir } = getDaemonDirs();
    let staleLocks = 0;
    if (fs.existsSync(locksDir)) {
      for (const f of fs.readdirSync(locksDir)) {
        if (!f.endsWith(".lock")) continue;
        const full = path.join(locksDir, f);
        let existing = null;
        try {
          existing = JSON.parse(fs.readFileSync(full, "utf8"));
        } catch (_) {
          existing = null;
        }
        if (projectCtx && existing && typeof existing.projectRoot === "string") {
          if (projectCtx.projectRootCanonical) {
            if (canonicalProjectRoot(existing.projectRoot) !== projectCtx.projectRootCanonical)
              continue;
          } else if (projectCtx.projectId) {
            if (deriveProjectId(existing.projectRoot) !== projectCtx.projectId) continue;
          }
        }

        if (!existing || lockIsStale(existing)) staleLocks += 1;
      }
    }
    report.checks.stale_project_locks = staleLocks;
    if (staleLocks) report.warnings.push(`${staleLocks} lock(s) de projeto stale ou inválido(s).`);

    report.checks.project_scope =
      projectCtx && (projectCtx.projectId || projectCtx.projectRootCanonical)
        ? {
            projectId: projectCtx.projectId || null,
            projectRoot: projectCtx.projectRootCanonical || null,
          }
        : null;

    const q = loadQueueUnsafe();

    const jobs =
      projectCtx && (projectCtx.projectId || projectCtx.projectRootCanonical)
        ? q.jobs.filter((j) => jobMatchesProjectContext(projectCtx, j))
        : q.jobs;

    const stuckN = jobs.filter((j) => jobRecordLooksStuck(j)).length;

    let retryN = 0;

    for (const j of jobs) {
      if (jobIsRetryable(j)) retryN += 1;
    }

    let delayedPending = 0;

    let overduePending = 0;

    let malformedRecurring = 0;

    const nowMs = Date.now();

    for (const j of jobs) {
      if (jobIsDelayedPending(j)) delayedPending += 1;

      if (
        String(j.status || "") === "pending" &&
        j.availableAt &&
        typeof j.availableAt === "string"
      ) {
        const av = parseIsoMs(j.availableAt);

        if (Number.isFinite(av) && av < nowMs - 60000) overduePending += 1;
      }

      if (j.recurring != null) {
        const iv = Number(/** @type {any} */ (j.recurring).intervalMs);

        if (!Number.isFinite(iv) || iv < 1000) malformedRecurring += 1;
      }
    }

    if (projectCtx && projectCtx.projectId) {
      try {
        const evp = readRuntimeEventsFiltered({
          projectId: projectCtx.projectId,
          limit: 30,
        });

        report.checks.events_recent_project = evp.length;
      } catch (_) {
        report.checks.events_recent_project = null;
      }
    }
    report.checks.delayed_jobs_pending = delayedPending;

    report.checks.pending_overdue_1m = overduePending;
    report.checks.recurring_malformed = malformedRecurring;

    if (overduePending)
      report.warnings.push(
        `${overduePending} job(s) pending com availableAt vencido (>60s) — scheduler/worker pode estar atrasado.`,
      );

    if (malformedRecurring)
      report.warnings.push(`${malformedRecurring} job(s) com recurring.intervalMs inválido.`);

    const st = readDaemonStatus();

    const sched = st && st.scheduler && typeof st.scheduler === "object" ? st.scheduler : null;

    report.checks.scheduler_last_tick =
      sched && typeof sched.lastTickAt === "string" ? sched.lastTickAt : "unknown";

    if (pidLabel === "daemon_pid_alive" && sched) {
      const lt = Date.parse(String(sched.lastTickAt || ""));

      if (
        Number.isFinite(lt) &&
        nowMs - lt > 120000 &&
        (delayedPending > 0 || overduePending > 0)
      )
        report.warnings.push(
          "Scheduler parece estagnado (lastTick antigo) com carga temporal pendente.",
        );

    }
    report.checks.stuck_jobs_suspected = stuckN;
    report.checks.retryable_jobs = retryN;
    if (stuckN) report.warnings.push(`${stuckN} job(s) com suspeita de stuck (heartbeat/progresso).`);
  } catch (e) {
    report.warnings.push(`operational_doctor: ${String((e && e.message) || e)}`);
  } finally {
    if (prev == null) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prev;
  }
}

function parseDoctorArgs(argv) {
  const json = argv.includes("--json");
  const strictRuns = argv.includes("--strict-runs");
  const fixSafe = argv.includes("--fix-safe");
  let runsLimit = 3;
  const lim = argv.find((a) => /^--runs-limit=/i.test(a));
  if (lim) {
    const n = parseInt(String(lim.replace(/^[^=]+=/i, "")), 10);
    if (Number.isFinite(n) && n >= 0) runsLimit = n;
  }
  const pArg = argv.find((a) => a.startsWith("--project="));
  const projectSel = pArg ? String(pArg.slice("--project=".length)).trim() : null;
  return { json, runsLimit, strictRuns, projectSel, fixSafe };
}

/**
 * Acções conservadoras: locks de projeto stale/corruptos e pid file órfão (daemon morto).
 * @param {string} cliRoot
 * @returns {{ staleLocksCleared: number, stalePidFileCleared: boolean }}
 */
function applyDoctorSafeFixes(cliRoot) {
  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;
  process.env.SETUP_BOSS_CLI_ROOT = cliRoot;
  /** @type {{ staleLocksCleared: number, stalePidFileCleared: boolean }} */
  const out = { staleLocksCleared: 0, stalePidFileCleared: false };
  try {
    const { recoverStaleLocksOnDisk } = require("../../daemon/lib/project-lock");
    const {
      readDaemonPidRaw,
      isPidAlive,
      deletePidFile,
    } = require("../../daemon/lib/pid-file");
    const n = recoverStaleLocksOnDisk();
    out.staleLocksCleared = typeof n === "number" && Number.isFinite(n) ? n : 0;
    const pidRaw = readDaemonPidRaw();
    const pid = pidRaw != null ? Number(pidRaw) : NaN;
    if (Number.isFinite(pid) && !isPidAlive(pid)) {
      deletePidFile();
      out.stalePidFileCleared = true;
    }
  } finally {
    if (prevRoot == null) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
  }
  return out;
}

/**
 * @param {string[]} argv
 * @param {{ repoRoot?: string|null }} opts
 */
function runDoctor(argv, { repoRoot = null } = {}) {
  const { json, runsLimit, strictRuns, projectSel, fixSafe } = parseDoctorArgs(argv);
  const { CLI_ROOT, RUNS_DIR } = getCliPaths(repoRoot);

  /** @type {{ projectId?: string|null, projectRootCanonical?: string|null }|null} */
  let projectCtx = null;

  if (projectSel) {
    const r = resolveProjectSelector(projectSel, CLI_ROOT);

    projectCtx = {
      projectId: r.projectId || null,

      projectRootCanonical: r.projectRootCanonical || null,
    };
  }

  /** @type {{ ok: boolean, checks: object, warnings: string[] }} */
  const report = {
    ok: true,
    checks: {},
    warnings: [],
  };

  const okDir = (p, label) => {
    const exists = fs.existsSync(p);
    report.checks[label] = exists ? "OK" : "MISSING";
    if (!exists) {
      report.ok = false;
      report.warnings.push(`${label}: pasta/ficheiro ausente (${p})`);
    }
    return exists;
  };

  okDir(CLI_ROOT, "repo_root");
  okDir(path.join(CLI_ROOT, "scripts", "runtime"), "runtime_scripts");
  okDir(RUNS_DIR, "runs_index_dir");

  if (fixSafe) {
    const fx = applyDoctorSafeFixes(CLI_ROOT);
    report.checks.doctor_safe_fixes_applied = fx;
    if (!json)
      console.error(
        `[doctor] fix-safe: locks removidos=${fx.staleLocksCleared} pid_stale_limpo=${fx.stalePidFileCleared}`,
      );
  }

  augmentDoctorOperational(CLI_ROOT, report, projectCtx || undefined);

  const policyPack = loadMergedPolicy({
    projectRootAbs: CLI_ROOT,
    policyProfileCli: null,
    forcePolicyBypassFlow: false,
    disableGovernanceFlow: false,
  });
  report.checks.policy_loader = policyPack && policyPack.merged ? "OK" : "WARN";
  if (!policyPack || !policyPack.merged) {
    report.warnings.push("policy_loader: merge devolveu estrutura inesperada.");
  }

  report.checks.openai_key = process.env.OPENAI_API_KEY ? "SET" : "UNSET";
  if (!process.env.OPENAI_API_KEY) {
    report.warnings.push(
      "OPENAI_API_KEY não definida — pipelines que chamam LLM vão falhar.",
    );
  }

  const entries = discoverRuns({ includeLegacy: true, repoRoot });
  report.checks.runs_discovered = entries.length;

  const runSamples = [];
  for (let i = 0; i < Math.min(runsLimit, entries.length); i++) {
    const e = entries[i];
    const outDir = e.output_dir;
    const sample = {
      run_id: e.run_id,
      output_dir: outDir,
      exists: fs.existsSync(outDir),
    };

    if (!sample.exists) {
      sample.error = "output_dir ausente no disco (índice órfão)";
      report.ok = false;
      report.warnings.push(`${e.run_id}: índice sem pasta de output.`);
      runSamples.push(sample);
      continue;
    }

    const art = validateRunArtifacts(outDir, { strictProjectRoot: false });
    const life = validateLifecycleConsistency(outDir);
    const temporal = buildTemporalInspectReport(outDir, e.project_root || null);

    sample.artifacts_ok = art.ok;
    sample.lifecycle_ok = life.ok;
    sample.temporal = {
      lifecycle_state: temporal.lifecycle_state,
      stale_manifest: temporal.stale_manifest,
      invalid_checkpoint_doc: temporal.invalid_checkpoint_doc,
      filesystem_drift_summary: temporal.filesystem_drift_summary,
    };

    if (!art.ok || !life.ok) {
      if (strictRuns) report.ok = false;
      const bits = [];
      if (!art.ok) bits.push(`artefactos: ${art.errors.join("; ")}`);
      if (!life.ok) {
        bits.push(
          `lifecycle: ${life.issues
            .filter((x) => x.severity === "error")
            .map((x) => x.message)
            .join("; ")}`,
        );
      }
      report.warnings.push(`${e.run_id}: ${bits.join(" | ")}`);
    }

    sample.errors = [...art.errors];
    sample.lifecycle_issues = life.issues.filter((x) => x.severity === "error");
    runSamples.push(sample);
  }

  report.checks.latest_runs_sampled = runSamples;

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
    return;
  }

  console.log("Setup-Boss doctor");
  console.log("—".repeat(48));
  console.log(`Repo: ${CLI_ROOT}`);
  const sym = (v) => (v === "OK" ? "✔" : v === "INVALID" ? "⚠" : "•");
  console.log(`  ${sym(report.checks.queue_json)} queue json: ${report.checks.queue_json}`);
  console.log(`  ${sym(report.checks.events_jsonl)} events jsonl: ${report.checks.events_jsonl}`);
  console.log(`  • daemon pid: ${report.checks.daemon_pid}`);
  console.log(`  • stale project locks: ${report.checks.stale_project_locks}`);
  console.log(`  • stuck jobs (suspeito): ${report.checks.stuck_jobs_suspected}`);
  console.log(`  • retryable jobs: ${report.checks.retryable_jobs}`);
  for (const [k, v] of Object.entries(report.checks)) {
    if (k === "latest_runs_sampled") continue;
    if (["queue_json", "events_jsonl", "daemon_pid", "stale_project_locks", "stuck_jobs_suspected", "retryable_jobs"].includes(k)) continue;
    console.log(`  ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
  }
  if (runSamples.length) {
    console.log("\nAmostra de runs (mais recentes):");
    for (const s of runSamples) {
      console.log(`  • ${s.run_id}`);
      console.log(`    dir existe: ${s.exists}`);
      if (s.temporal) {
        console.log(
          `    lifecycle: ${s.temporal.lifecycle_state} | drift: ${s.temporal.filesystem_drift_summary} | stale_manifest: ${s.temporal.stale_manifest}`,
        );
      }
      if (s.errors && s.errors.length) {
        console.log(`    erros: ${s.errors.slice(0, 3).join("; ")}`);
      }
    }
  }
  if (report.warnings.length) {
    console.log("\nAvisos:");
    for (const w of report.warnings) console.log(`  ⚠ ${w}`);
  }
  console.log(report.ok ? "\n✅ Doctor: OK" : "\n❌ Doctor: problemas detectados");
  process.exitCode = report.ok ? 0 : 1;
}

module.exports = { runDoctor, applyDoctorSafeFixes };
