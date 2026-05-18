import type {
  ActionAvailability,
  RuntimeActionContext,
  RuntimeActionId,
} from "@/lib/runtime/actions/runtime-action-types";

const CONFIRM_ACTIONS = new Set<RuntimeActionId>([
  "cancel-run",
  "retry-run",
  "resume-run",
]);

function baseUnavailable(ctx: RuntimeActionContext): string | null {
  if (!ctx.runtimeReachable) return "Runtime offline.";
  if (!ctx.jobId) return "Seleccione um job/corrida.";
  return null;
}

function cancelRule(ctx: RuntimeActionContext): ActionAvailability {
  const block = baseUnavailable(ctx);
  if (block) {
    return {
      available: false,
      unsupported: false,
      disabledReason: block,
      requiresConfirmation: true,
    };
  }
  const st = (ctx.jobStatus || "").toLowerCase();
  if (st === "running" || st === "pending") {
    return {
      available: true,
      unsupported: false,
      disabledReason: null,
      requiresConfirmation: true,
    };
  }
  if (st === "cancelling") {
    return {
      available: false,
      unsupported: false,
      disabledReason: "Cancelamento já solicitado.",
      requiresConfirmation: true,
    };
  }
  return {
    available: false,
    unsupported: false,
    disabledReason: `Cancelar indisponível (estado: ${st || "—"}).`,
    requiresConfirmation: true,
  };
}

function retryRule(ctx: RuntimeActionContext): ActionAvailability {
  const block = baseUnavailable(ctx);
  if (block) {
    return {
      available: false,
      unsupported: false,
      disabledReason: block,
      requiresConfirmation: true,
    };
  }
  const st = (ctx.jobStatus || "").toLowerCase();
  if (ctx.retryable || st === "failed" || st === "failed_cancel") {
    return {
      available: true,
      unsupported: false,
      disabledReason: null,
      requiresConfirmation: true,
    };
  }
  return {
    available: false,
    unsupported: false,
    disabledReason: "Retry só para jobs falhados/retryable.",
    requiresConfirmation: true,
  };
}

function resumeRule(ctx: RuntimeActionContext): ActionAvailability {
  const block = baseUnavailable(ctx);
  if (block) {
    return {
      available: false,
      unsupported: true,
      disabledReason: block,
      requiresConfirmation: true,
    };
  }
  return {
    available: true,
    unsupported: true,
    disabledReason:
      "Resume via API ainda não disponível — use CLI `setup-boss resume`.",
    requiresConfirmation: true,
  };
}

function refreshRule(ctx: RuntimeActionContext): ActionAvailability {
  if (!ctx.runtimeReachable) {
    return {
      available: false,
      unsupported: false,
      disabledReason: "Runtime offline.",
      requiresConfirmation: false,
    };
  }
  return {
    available: true,
    unsupported: false,
    disabledReason: null,
    requiresConfirmation: false,
  };
}

function integrityRule(ctx: RuntimeActionContext): ActionAvailability {
  const block = baseUnavailable(ctx);
  if (block) {
    return {
      available: false,
      unsupported: true,
      disabledReason: block,
      requiresConfirmation: false,
    };
  }
  return {
    available: true,
    unsupported: true,
    disabledReason: "Validação de integridade via API — próxima fase.",
    requiresConfirmation: false,
  };
}

function observabilityRule(ctx: RuntimeActionContext): ActionAvailability {
  const block = baseUnavailable(ctx);
  if (block) {
    return {
      available: false,
      unsupported: true,
      disabledReason: block,
      requiresConfirmation: false,
    };
  }
  return {
    available: true,
    unsupported: true,
    disabledReason:
      "Rebuild de observabilidade via API — não exposto no daemon.",
    requiresConfirmation: false,
  };
}

export function getActionAvailability(
  actionId: RuntimeActionId,
  ctx: RuntimeActionContext,
): ActionAvailability {
  switch (actionId) {
    case "refresh":
      return refreshRule(ctx);
    case "cancel-run":
      return cancelRule(ctx);
    case "retry-run":
      return retryRule(ctx);
    case "resume-run":
      return resumeRule(ctx);
    case "validate-integrity":
      return integrityRule(ctx);
    case "rebuild-observability":
      return observabilityRule(ctx);
    default:
      return {
        available: false,
        unsupported: true,
        disabledReason: "Acção desconhecida.",
        requiresConfirmation: false,
      };
  }
}

export function actionRequiresConfirmation(actionId: RuntimeActionId): boolean {
  return CONFIRM_ACTIONS.has(actionId);
}

export function actionLabel(actionId: RuntimeActionId): string {
  switch (actionId) {
    case "refresh":
      return "Actualizar";
    case "validate-integrity":
      return "Validar integridade";
    case "rebuild-observability":
      return "Rebuild observability";
    case "retry-run":
      return "Retry";
    case "resume-run":
      return "Resume";
    case "cancel-run":
      return "Cancelar";
    default:
      return actionId;
  }
}
