/**
 * Confirmacao interativa antes da execucao (TTY apenas).
 */

const readline = require("readline");

function envTruthy(name) {
  const v = String(process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function shouldSkipConfirmation(flowOptions = {}) {
  if (flowOptions.skipPreflightConfirm === true) return true;
  if (envTruthy("SETUP_BOSS_NO_CONFIRM")) return true;
  if (envTruthy("CI")) return true;
  return false;
}

function needsConfirmation(report) {
  if (!report || !report.complexity) return false;
  const tier = String(report.complexity.tier || "");
  return tier === "MEDIUM" || tier === "HIGH" || tier === "EXTREME";
}

function promptProceedQuestion() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question("Proceed? [Y/n] ", (answer) => {
      rl.close();
      const a = String(answer || "").trim().toLowerCase();
      if (!a || a === "y" || a === "yes") resolve(true);
      else resolve(false);
    });
  });
}

async function confirmGovernanceIfNeeded(govPack, flowOptions = {}) {
  if (!govPack || govPack.needs_operator_confirmation !== true) return true;
  if (shouldSkipConfirmation(flowOptions)) return true;

  try {
    if (!process.stdin || !process.stdin.isTTY) return true;
  } catch (_) {
    return true;
  }

  console.log("");
  console.log("[GOVERNANCE] Perfil/policy marcou confirmacao antes de usar LLMs/custos continuados.");
  return promptProceedQuestion();
}

async function confirmPreflightIfNeeded(report, flowOptions = {}) {
  if (shouldSkipConfirmation(flowOptions)) return true;
  if (!needsConfirmation(report)) return true;

  try {
    if (!process.stdin || !process.stdin.isTTY) return true;
  } catch (_) {
    return true;
  }

  return promptProceedQuestion();
}

module.exports = {
  shouldSkipConfirmation,
  needsConfirmation,
  confirmGovernanceIfNeeded,
  confirmPreflightIfNeeded,
};
