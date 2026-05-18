import type { RunUxState } from "./runtime-ux-types.ts";
import {
  mapInternalActiveStepToVisual,
  needsVersioningPrepareCta,
  visualStepLabel,
  type VersioningCheckpointContext,
} from "./operational-visual-model.ts";

export type ActiveStepBannerVariant =
  | "running"
  | "waiting_user_action"
  | "stalled"
  | "completed"
  | "failed";

export type ActiveStepBannerView = {
  variant: ActiveStepBannerVariant;
  headline: string;
  detail: string;
  stepLabel: string;
  showObservabilityFooter: boolean;
  showPrepareBranchCta: boolean;
};

export type ResolveActiveStepBannerViewOptions = {
  attentionHint?: string | null;
  versioning?: VersioningCheckpointContext;
};

/**
 * Resolve texto e variante visual dominante do banner (prioridade única).
 * Usa apenas passos do modelo visual simplificado.
 */
export function resolveActiveStepBannerView(
  ux: RunUxState,
  options: ResolveActiveStepBannerViewOptions = {},
): ActiveStepBannerView {
  const versioning = options.versioning ?? {};
  const visual =
    ux.visualStep === "failed"
      ? "failed"
      : ux.visualStep;
  const stepLabel =
    ux.status === "waiting_user_action" || ux.hasHumanAction
      ? visualStepLabel("waiting_action")
      : visualStepLabel(visual);

  const hint = options.attentionHint?.trim() || null;
  const showPrepareBranchCta =
    needsVersioningPrepareCta(versioning) &&
    (ux.visualStep === "versioning" ||
      mapInternalActiveStepToVisual(ux.activeStep) === "versioning" ||
      ux.activeStep === "git");

  if (ux.status === "failed") {
    return {
      variant: "failed",
      headline: "Execução falhou",
      detail:
        ux.detail.trim() ||
        "A execução foi interrompida. Consulte os logs abaixo.",
      stepLabel: visualStepLabel("failed"),
      showObservabilityFooter: false,
      showPrepareBranchCta: false,
    };
  }

  if (ux.status === "completed") {
    return {
      variant: "completed",
      headline: "Corrida concluída",
      detail:
        ux.detail.trim() ||
        "Todas as etapas finalizaram com sucesso.",
      stepLabel: visualStepLabel("completed"),
      showObservabilityFooter: false,
      showPrepareBranchCta: false,
    };
  }

  if (ux.status === "waiting_user_action" || ux.hasHumanAction) {
    return {
      variant: "waiting_user_action",
      headline: showPrepareBranchCta
        ? "Branch ainda não preparada"
        : "Ação necessária",
      detail:
        hint ||
        ux.detail.trim() ||
        "Aguardando ação humana para continuar.",
      stepLabel,
      showObservabilityFooter: false,
      showPrepareBranchCta,
    };
  }

  if (ux.isStalled && ux.status === "running") {
    return {
      variant: "stalled",
      headline: "Ainda processando…",
      detail:
        "O runtime continua ativo; nenhuma ação necessária.",
      stepLabel,
      showObservabilityFooter: true,
      showPrepareBranchCta: false,
    };
  }

  return {
    variant: "running",
    headline: ux.headline.trim() || "Em progresso",
    detail: ux.detail.trim() || `Etapa actual: ${stepLabel}.`,
    stepLabel,
    showObservabilityFooter: false,
    showPrepareBranchCta,
  };
}
