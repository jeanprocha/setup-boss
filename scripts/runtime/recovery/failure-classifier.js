/**
 * Classificação central de falhas para recovery supervisionado.
 */

const Classification = {
  TRANSIENT: "TRANSIENT",
  RETRYABLE: "RETRYABLE",
  DETERMINISTIC: "DETERMINISTIC",
  NON_RECOVERABLE: "NON_RECOVERABLE",
  CONTEXT_INSUFFICIENT: "CONTEXT_INSUFFICIENT",
  PATCH_CONFLICT: "PATCH_CONFLICT",
  PROVIDER_FAILURE: "PROVIDER_FAILURE",
  VALIDATION_FAILURE: "VALIDATION_FAILURE",
};

function normalizeMsg(err) {
  if (!err) return "";
  if (typeof err === "string") return err;
  return String(err.message || err.error || err).trim();
}

function classifyProviderError(err) {
  const msg = normalizeMsg(err);
  const status = err && err.status != null ? Number(err.status) : null;
  const code = err && err.code != null ? String(err.code) : "";
  const type = err && err.type != null ? String(err.type) : "";

  const combined = `${msg} ${code} ${type}`.toLowerCase();

  const isTimeout =
    status === 408 ||
    /timeout|timed out|etimedout|deadline/i.test(msg) ||
    /timeout|timed out/i.test(combined);

  const isRateLimit =
    status === 429 ||
    code === "rate_limit_exceeded" ||
    /rate limit|too many requests|429/i.test(combined);

  const isServerTransient =
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /(^|\s)(?:econnreset|econnrefused|socket hang up|bad gateway|service unavailable|overloaded)(\s|$)/i.test(
      combined,
    );

  if (isTimeout || isRateLimit || isServerTransient) {
    return {
      classification: Classification.PROVIDER_FAILURE,
      tags: [Classification.TRANSIENT, Classification.RETRYABLE],
      retryable: true,
      subtype: isRateLimit
        ? "rate_limit"
        : isTimeout
          ? "timeout"
          : "server_transient",
    };
  }

  return {
    classification: Classification.PROVIDER_FAILURE,
    tags: [Classification.NON_RECOVERABLE],
    retryable: false,
    subtype: "unknown",
  };
}

/**
 * Classifica texto conhecido de falha de patch / pré-validação (alinhado a executor.js).
 */
function classifyFromPatchMessage(message) {
  const m = String(message || "");

  if (m.includes("trecho search não encontrado")) {
    return {
      classification: Classification.CONTEXT_INSUFFICIENT,
      tags: [Classification.RETRYABLE],
      cause: "search_not_found",
      retryable_micro: true,
    };
  }

  if (m.includes("trecho search encontrado") && m.includes("vezes")) {
    return {
      classification: Classification.CONTEXT_INSUFFICIENT,
      tags: [Classification.RETRYABLE],
      cause: "search_not_unique",
      retryable_micro: true,
    };
  }

  if (m.includes("Patch duplicado detectado")) {
    return {
      classification: Classification.PATCH_CONFLICT,
      tags: [Classification.DETERMINISTIC, Classification.NON_RECOVERABLE],
      cause: "duplicate_patch",
      retryable_micro: false,
    };
  }

  if (
    m.includes("Patch no-op detectado") ||
    m.includes("no-op detectado") ||
    m.includes("patch com search vazio")
  ) {
    return {
      classification: Classification.VALIDATION_FAILURE,
      tags: [Classification.DETERMINISTIC],
      cause: "validation",
      retryable_micro: false,
    };
  }

  return {
    classification: Classification.NON_RECOVERABLE,
    tags: [Classification.DETERMINISTIC],
    cause: "other_patch",
    retryable_micro: false,
  };
}

function classifyExecutorBlockedJson(result) {
  if (!result || typeof result !== "object") {
    return {
      classification: Classification.NON_RECOVERABLE,
      tags: [],
      retryable_micro: false,
      failure_type: "invalid_result",
    };
  }

  if (result.status === "success") {
    return {
      classification: Classification.RETRYABLE,
      tags: [],
      retryable_micro: false,
      failure_type: "none",
    };
  }

  const br = String(result.blocked_reason || "");
  const joinedEv = Array.isArray(result.evidence)
    ? result.evidence.join(" ")
    : "";

  if (br === "executor_json_parse_failed" || /invalid json/i.test(br)) {
    return {
      classification: Classification.VALIDATION_FAILURE,
      tags: [Classification.RETRYABLE, Classification.TRANSIENT],
      retryable_micro: true,
      failure_type: "executor_json_parse_failed",
      cause: "json_parse_failed",
    };
  }

  const fromBr = classifyFromPatchMessage(br);
  if (fromBr.cause !== "other_patch") {
    return {
      classification: fromBr.classification,
      tags: fromBr.tags,
      retryable_micro: fromBr.retryable_micro,
      failure_type: fromBr.cause,
      cause: fromBr.cause,
    };
  }

  const fromEv = classifyFromPatchMessage(joinedEv);
  if (fromEv.cause !== "other_patch") {
    return {
      classification: fromEv.classification,
      tags: fromEv.tags,
      retryable_micro: fromEv.retryable_micro,
      failure_type: fromEv.cause,
      cause: fromEv.cause,
    };
  }

  if (/snippet insuficiente|insufficient|contexto/i.test(`${br} ${joinedEv}`)) {
    return {
      classification: Classification.CONTEXT_INSUFFICIENT,
      tags: [Classification.RETRYABLE],
      retryable_micro: true,
      failure_type: "context_insufficient",
      cause: "context_insufficient",
    };
  }

  return {
    classification: Classification.NON_RECOVERABLE,
    tags: [Classification.DETERMINISTIC],
    retryable_micro: false,
    failure_type: "executor_declined",
    cause: "executor_declined",
  };
}

module.exports = {
  Classification,
  classifyProviderError,
  classifyFromPatchMessage,
  classifyExecutorBlockedJson,
};