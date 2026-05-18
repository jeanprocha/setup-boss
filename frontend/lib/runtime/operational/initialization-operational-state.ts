import type { RunOperationalUxContract } from "./operational-ux-types.ts";

/** Estados operacionais visíveis na fase Inicialização (Fase 2). */
export const INITIALIZATION_OPERATIONAL_STATUSES = [
  "awaiting_start",
  "validating_ia",
  "ia_found",
  "ia_missing",
  "loading_context",
  "awaiting_activity",
  "generating_spec",
  "spec_ready",
] as const;

export type InitializationOperationalStatus =
  (typeof INITIALIZATION_OPERATIONAL_STATUSES)[number];

export const INITIALIZATION_STATUS_LABELS_PT: Record<
  InitializationOperationalStatus,
  string
> = {
  awaiting_start: "Aguardando inicialização",
  validating_ia: "A validar base .IA",
  ia_found: "A analisar projeto",
  ia_missing: "Contexto IA não encontrado",
  loading_context: "A carregar contexto do projeto",
  awaiting_activity: "Aguardar descrição da atividade",
  generating_spec: "A gerar SPEC inicial",
  spec_ready: "SPEC inicial pronta",
};

export type DeriveInitializationOperationalStatusInput = {
  contract: RunOperationalUxContract;
  /** Fluxo nova atividade sem corrida persistida. */
  composeOnly: boolean;
  /** Antes do primeiro submit — sem validação `.IA` na UI. */
  preSubmitCompose?: boolean;
  /** GET /projects/:id/governance em curso. */
  governanceLoading?: boolean;
  /** POST /runs ou intake async em curso. */
  submissionBusy?: boolean;
};

export function labelInitializationOperationalStatus(
  status: InitializationOperationalStatus,
): string {
  return INITIALIZATION_STATUS_LABELS_PT[status];
}

/**
 * Deriva o estado operacional único da Inicialização a partir do contrato UX (Fase 1).
 * Não duplica normalização de `.IA` / contexto / SPEC — apenas mapeia para copy UI.
 */
export function deriveInitializationOperationalStatus(
  input: DeriveInitializationOperationalStatusInput,
): InitializationOperationalStatus {
  const {
    contract,
    composeOnly,
    preSubmitCompose,
    governanceLoading,
    submissionBusy,
  } = input;

  if (preSubmitCompose) return "awaiting_activity";

  if (contract.initialSpecReady) return "spec_ready";

  if (contract.iaValidated === false) return "ia_missing";

  if (governanceLoading || contract.iaValidated === null) {
    return "validating_ia";
  }

  if (composeOnly) {
    if (contract.iaValidated === true && !submissionBusy) {
      return "awaiting_activity";
    }
    if (contract.iaValidated === true && submissionBusy) {
      return "loading_context";
    }
    return "awaiting_start";
  }

  if (!contract.contextLoaded || submissionBusy) {
    if (contract.iaValidated === true && !contract.contextLoaded) {
      return "loading_context";
    }
    if (submissionBusy) return "generating_spec";
  }

  if (contract.iaValidated === true && contract.contextLoaded) {
    return "generating_spec";
  }

  if (contract.iaValidated === true) return "ia_found";

  return "awaiting_start";
}

/** Ordem narrativa dos passos na UI (checklist). */
export const INITIALIZATION_STATUS_ORDER: readonly InitializationOperationalStatus[] =
  [
    "awaiting_start",
    "validating_ia",
    "ia_found",
    "ia_missing",
    "loading_context",
    "awaiting_activity",
    "generating_spec",
    "spec_ready",
  ] as const;

export function initializationStatusIndex(
  status: InitializationOperationalStatus,
): number {
  const idx = INITIALIZATION_STATUS_ORDER.indexOf(status);
  return idx >= 0 ? idx : 0;
}
