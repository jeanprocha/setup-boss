/**
 * Limites de retry por categoria (fase 2.6) — evita loops infinitos.
 */

function numEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function createRetryBudgetsFromEnv() {
  return {
    executor_micro_retry: Math.max(
      0,
      numEnv("SETUP_BOSS_EXECUTOR_MICRO_RETRY_MAX", 2),
    ),
    provider_retry: Math.max(0, numEnv("SETUP_BOSS_PROVIDER_RETRY_MAX", 3)),
    correction_retry: Math.max(0, numEnv("SETUP_BOSS_CORRECTION_RETRY_BUDGET", 1)),
  };
}

function createBudgetSession(limits = createRetryBudgetsFromEnv()) {
  const used = {
    executor_micro_retry: 0,
    provider_retry: 0,
    correction_retry: 0,
  };

  return {
    limits: { ...limits },
    used: { ...used },

    canConsume(category) {
      const lim = this.limits[category];
      if (lim === undefined) return false;
      return this.used[category] < lim;
    },

    consume(category) {
      if (!this.canConsume(category)) return false;
      this.used[category] += 1;
      return true;
    },

    snapshot() {
      return {
        limits: { ...this.limits },
        used: { ...this.used },
      };
    },
  };
}

module.exports = {
  createRetryBudgetsFromEnv,
  createBudgetSession,
};
