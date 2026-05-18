import { describe, expect, it } from "vitest";
import {
  normalizeRefinementPreview,
  parseRefinedPlanPresentation,
} from "./parse-refined-plan";

describe("parseRefinedPlanPresentation", () => {
  it("não rebenta com refinement parcial (arrays undefined)", () => {
    const model = parseRefinedPlanPresentation({
      available: true,
      refinedTask: "Criar chat lateral",
    });
    expect(model.scopeChanges).toEqual([]);
    expect(model.acceptanceCriteria).toEqual([]);
    expect(model.risks).toEqual([]);
    expect(model.scopeIncluded).toEqual([]);
  });

  it("normaliza arrays opcionais", () => {
    const n = normalizeRefinementPreview({
      scopeChanges: undefined,
      acceptanceCriteria: undefined,
      risks: null as unknown as string[],
    });
    expect(n.scopeChanges).toEqual([]);
    expect(n.acceptanceCriteria).toEqual([]);
    expect(n.risks).toEqual([]);
  });

  it("combina markdown H2 com DTO", () => {
    const model = parseRefinedPlanPresentation(
      { available: true },
      "## Objetivo\nImplementar toggle\n\n## Critérios de Aceite\n- UI responsiva",
    );
    expect(model.objective).toContain("toggle");
    expect(model.acceptanceCriteria.length).toBeGreaterThan(0);
  });
});
