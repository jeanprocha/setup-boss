import { OPERATIONAL_UX_PHASES } from "./operational-ux-types.ts";
import type { OperationalUxPhase, RunOperationalUxContract } from "./operational-ux-types.ts";
import { labelOperationalUxPhase } from "./operational-ux-labels.ts";

export type OperationalPhaseStackMode = "active" | "history";

export type OperationalPhaseStackEntry = {
  phase: OperationalUxPhase;
  mode: OperationalPhaseStackMode;
  title: string;
};

/**
 * Fases visíveis na esteira central — inclui histórico (colapsado) até à fase actual.
 */
export function deriveOperationalPhaseStackEntries(
  contract: RunOperationalUxContract,
): OperationalPhaseStackEntry[] {
  const current = contract.uxPhase;
  const curIdx = OPERATIONAL_UX_PHASES.indexOf(current);
  if (curIdx < 0) {
    return [
      {
        phase: current,
        mode: "active",
        title: labelOperationalUxPhase(current),
      },
    ];
  }

  const out: OperationalPhaseStackEntry[] = [];
  for (let i = 0; i <= curIdx; i++) {
    const phase = OPERATIONAL_UX_PHASES[i]!;
    const mode: OperationalPhaseStackMode = i === curIdx ? "active" : "history";
    if (phase === "initialization" && mode === "history") {
      continue;
    }
    out.push({
      phase,
      mode,
      title: labelOperationalUxPhase(phase),
    });
  }
  return out;
}
