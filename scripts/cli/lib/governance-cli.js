/** @param {string[]} rest */
function parseGovernanceCliFlags(rest) {
  const arr = Array.isArray(rest) ? rest : [];
  let policyProfile = null;

  const pr = arr.find((a) => /^--policy-profile=/i.test(a));

  if (pr) {
    const v = String(pr.replace(/^[^=]+=/i, "")).trim();
    policyProfile = v || null;
  }

  return {
    forcePolicyBypass: arr.includes("--force-policy-bypass"),
    disableGovernance: arr.includes("--disable-governance"),
    policyProfile,
  };
}

module.exports = {
  parseGovernanceCliFlags,
};
