"use strict";

const {
  OPERATIONAL_PLAN_SCHEMA_VERSION,
  planV2NeedsRegeneration,
} = require("../../../../core/operational-plan-staleness.js");

function parseIsoMs(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

function isLocalUpdatedPlanStale(plan, basePlan) {
  if (!plan?.presentation || !basePlan?.hasContent) return false;
  return planV2NeedsRegeneration(plan.presentation, basePlan, {
    schemaVersion: plan.schemaVersion,
    canonicalized: plan.canonicalized,
  });
}

function shouldRemoteUpdatedPlanReplaceLocal(local, remote, basePlan) {
  if (!remote?.presentation) return false;
  if (!local?.presentation) return true;
  if (basePlan?.hasContent && isLocalUpdatedPlanStale(local, basePlan)) {
    return true;
  }
  const remoteSchema = Number(remote.schemaVersion) || 0;
  const localSchema = Number(local.schemaVersion) || 0;
  if (remoteSchema > localSchema) return true;
  if (localSchema > remoteSchema) return false;
  if (remote.canonicalized === true && local.canonicalized !== true) return true;
  if (local.canonicalized === true && remote.canonicalized !== true) return false;
  const remoteVersion = Number(remote.planVersion) || 0;
  const localVersion = Number(local.planVersion) || 0;
  if (remoteVersion > localVersion) return true;
  if (localVersion > remoteVersion) return false;
  const remoteAt = parseIsoMs(remote.generatedAt);
  const localAt = parseIsoMs(local.generatedAt);
  if (remoteAt > localAt) return true;
  if (localAt > remoteAt) return false;
  if (remote.canonicalized === true) return true;
  return false;
}

module.exports = {
  OPERATIONAL_PLAN_SCHEMA_VERSION,
  planV2NeedsRegeneration,
  isLocalUpdatedPlanStale,
  shouldRemoteUpdatedPlanReplaceLocal,
};
