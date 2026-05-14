/**
 * Preflight: analise + governanca (Fase 2.7) + artefactos + gates interativos.
 */

const { analyzePreflight } = require("./analyzer");
const { writePreflightArtifacts } = require("./artifacts");
const {
  confirmPreflightIfNeeded,
  confirmGovernanceIfNeeded,
} = require("./interactive");
const {
  evaluateRuntimeGovernance,
  mergeGovernanceIntoPreflight,
  writeGovernanceArtifacts,
} = require("../governance/policy-engine");
const { RuntimeTerminalError } = require("../runtime-errors");

function addPreflightGeneratedFiles(logger, runId) {
  if (!logger || !runId) return;
  logger.addGeneratedFile({
    path: `.IA/outputs/${runId}/preflight-analysis.json`,
    type: "preflight_analysis",
  });
  logger.addGeneratedFile({
    path: `.IA/outputs/${runId}/preflight-summary.md`,
    type: "preflight_summary",
  });
  logger.addGeneratedFile({
    path: `.IA/outputs/${runId}/policy-report.json`,
    type: "policy_report",
  });
  logger.addGeneratedFile({
    path: `.IA/outputs/${runId}/governance-decisions.json`,
    type: "governance_decisions",
  });
}

function formatUsdRange(report) {
  const c = report.cost || {};
  if (!c.pricing_available) return "(precos nao configurados)";
  const lo = c.estimated_cost_usd_low;
  const hi = c.estimated_cost_usd_high;
  const mid = c.estimated_cost_usd_mid;
  if (lo != null && hi != null)
    return `~$${lo}-$${hi} (mid ~$${mid})`;
  return mid != null ? `~$${mid}` : "---";
}

function printGovernanceBanner(report) {
  console.log("");
  console.log("----------------------------------------------------------------");
  console.log("RUNTIME POLICY CHECK");
  console.log("----------------------------------------------------------------");
  const gov = report && report.governance;
  if (!gov || gov.governance_disabled === true) {
    console.log("Governanca neutra/desativada.");
    console.log("");
    return;
  }
  console.log(`Policy profile: ${gov.profile_resolved}`);
  console.log(`Sensiveis (heuristica): ${gov.sensitive_runtime_signals_task === true ? "SIM" : "NAO"}`);
  console.log(
    `Dry-run obrigatorio pela politica: ${gov.dry_run_policy_mandatory === true && gov.dry_run_satisfied_flow === false ? "SIM" : "NAO"}`,
  );
  console.log(`Bypass registado esta corrida: ${gov.bypass_used_this_run === true ? "SIM" : "NAO"}`);
  console.log(`Bloqueios (decisions): ${gov.policy_violations_blockers}`);
  console.log("");
}

function printPreflightConsole(report) {
  console.log("");
  console.log("================================================================");
  console.log("PRE-FLIGHT ANALYSIS");
  console.log("================================================================");
  console.log(`Task complexity: ${report.complexity.tier} (score ${report.complexity.score})`);
  console.log(
    `Estimated scope: ${report.scope.estimated_files_min}-${report.scope.estimated_files_max} files`,
  );
  console.log(`Estimated prompt size: ~${report.prompts.totals.est_prompt_chars_sum} chars`);
  console.log(
    `Estimated token usage: ~${report.prompts.totals.est_tokens_band_low}-${report.prompts.totals.est_tokens_band_high}`,
  );
  console.log(`Estimated cost: ${formatUsdRange(report)}`);
  console.log("");
  console.log(`Risk level: ${report.risk.tier}`);
  console.log(`Correction probability: ${report.correction.probability_label}`);
  console.log(`Operational severity: ${report.operational_severity}`);
  console.log("");
  if (report.warnings && report.warnings.length) {
    console.log("Warnings:");
    for (const w of report.warnings) console.log(`- ${w.message}`);
    console.log("");
  }
  printGovernanceBanner(report);
}

async function executePreflightPhase(opts) {
  const {
    taskPathAbs,
    taskContent,
    projectRootAbs,
    setupBossRepoRoot,
    outputDir,
    logger,
    runId,
    scanUsesCache,
    pipelineMetrics,
    telemetry = null,
    dryRun = false,
    envMaxCorrections = null,
    flowOptions = {},
  } = opts;

  const t0 = Date.now();
  const report = analyzePreflight({
    taskPath: taskPathAbs,
    taskContent,
    projectRootAbs,
    setupBossRepoRoot,
    scanUsesCache,
  });

  let corrEv = Number(envMaxCorrections);
  if (!Number.isFinite(corrEv) || corrEv < 0) {
    corrEv = Number(process.env.MAX_CORRECTIONS || 3);
    if (!Number.isFinite(corrEv) || corrEv < 0) corrEv = 3;
  }

  const gov = evaluateRuntimeGovernance({
    projectRootAbs,
    preflightReport: report,
    taskContent,
    dryRun: dryRun === true,
    telemetry,
    envMaxCorrections: corrEv,
    flowOptions: {
      policyProfile: flowOptions.policyProfile || null,
      forcePolicyBypass: flowOptions.forcePolicyBypass === true,
      disableGovernance: flowOptions.disableGovernance === true,
    },
  });

  mergeGovernanceIntoPreflight(report, gov);
  writeGovernanceArtifacts(outputDir, gov);
  writePreflightArtifacts(outputDir, report);
  addPreflightGeneratedFiles(logger, runId);
  printPreflightConsole(report);

  if (gov.block_pipeline) {
    logger.addWarning("[POLICY_BLOCKED]", {
      blocker_codes:
        gov.decisions_payload && Array.isArray(gov.decisions_payload.blocker_codes)
          ? gov.decisions_payload.blocker_codes
          : [],
    });
    logger.finish("partial");
    console.error("\nPolitica POLICY_BLOCKED — governance-decisions.json");
    throw new RuntimeTerminalError("POLICY_BLOCKED — governance-decisions.json", {

      code: "POLICY_BLOCKED",

      exitCode: 1,

      loggerHandled: true,

    });
  }

  const okGov = await confirmGovernanceIfNeeded(gov, flowOptions);

  if (!okGov) {
    logger.finish("partial");

    console.error("\nConfirmacao governance cancelada.");
    throw new RuntimeTerminalError("Confirmacao governance cancelada.", {
      code: "GOVERNANCE_CANCELLED",

      exitCode: 1,

      loggerHandled: true,

    });
  }

  const proceed = await confirmPreflightIfNeeded(report, flowOptions);

  if (!proceed) {
    logger.finish("partial");

    console.error("\nPreflight cancelado pelo operador.");
    throw new RuntimeTerminalError("Preflight cancelado pelo operador.", {
      code: "PREFLIGHT_CANCELLED",

      exitCode: 1,

      loggerHandled: true,

    });
  }

  if (pipelineMetrics && typeof pipelineMetrics === "object") {
    pipelineMetrics.preflight_analysis_ms = Date.now() - t0;
  }

  return report;
}

module.exports = { executePreflightPhase, printPreflightConsole };
