/**
 * Estados operacionais humanos — camada de apresentação (não altera runtime).
 */

export const HUMAN_OPERATIONAL_KINDS = [
  "processing",
  "waiting_user",
  "completed",
  "blocked",
  "failed",
  "paused",
] as const;

export type HumanOperationalKind = (typeof HUMAN_OPERATIONAL_KINDS)[number];

import type {
  RuntimeActionKind,
  RuntimeActionTarget,
} from "@/lib/runtime/navigation/runtime-action-target";

export type HumanOperationalCta = {
  label: string;
  /** Dica para o painel embutido (não é action id de API). */
  actionHint: string;
  target: RuntimeActionTarget;
  actionKind?: RuntimeActionKind;
};

export type HumanOperationalPresentation = {
  kind: HumanOperationalKind;
  headline: string;
  description: string;
  badge: string;
  cta?: HumanOperationalCta;
  bullets?: string[];
};

/** UX inválida: waiting sem explicação ou CTA. */
export function isInvalidHumanWaitingPresentation(
  p: HumanOperationalPresentation,
): boolean {
  if (p.kind !== "waiting_user") return false;
  const hasExplain = p.description.trim().length > 8;
  const hasCta = Boolean(p.cta?.label?.trim());
  return !hasExplain || !hasCta;
}
