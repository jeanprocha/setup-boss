// core/config.js

module.exports = {
    MAX_CORRECTIONS: 3,
    MAX_TOTAL_STEPS: 20,
  
    ENABLE_SCAN_CACHE: true,
    SCAN_CACHE_TTL_MS: 1000 * 60 * 10, // 10 minutos
  
    COST_ESTIMATION: {
      enabled: true,
      average_tokens_per_step: 1500,
      cost_per_1k_tokens: 0.002 // ajuste conforme modelo
    }
  };