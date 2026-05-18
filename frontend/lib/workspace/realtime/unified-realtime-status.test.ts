import { describe, expect, it } from "vitest";
import {
  computeUnifiedRealtimePhase,
  unifiedRealtimeLabel,
} from "./unified-realtime-status";

describe("computeUnifiedRealtimePhase", () => {
  it("disconnected quando runtime inacessível", () => {
    expect(
      computeUnifiedRealtimePhase({
        reachable: false,
        projectPhase: "connected",
        workspacePhase: "connected",
        hasProjectStream: true,
        hasWorkspaceStream: true,
      }),
    ).toBe("disconnected");
  });

  it("connected quando ambos streams ligados", () => {
    expect(
      computeUnifiedRealtimePhase({
        reachable: true,
        projectPhase: "connected",
        workspacePhase: "connected",
        hasProjectStream: true,
        hasWorkspaceStream: true,
      }),
    ).toBe("connected");
  });

  it("degraded quando um stream reconecta", () => {
    expect(
      computeUnifiedRealtimePhase({
        reachable: true,
        projectPhase: "connected",
        workspacePhase: "reconnecting",
        hasProjectStream: true,
        hasWorkspaceStream: true,
      }),
    ).toBe("degraded");
  });

  it("connected só com workspace quando projeto ausente", () => {
    expect(
      computeUnifiedRealtimePhase({
        reachable: true,
        projectPhase: "idle",
        workspacePhase: "connected",
        hasProjectStream: false,
        hasWorkspaceStream: true,
      }),
    ).toBe("connected");
  });
});

describe("unifiedRealtimeLabel", () => {
  it("mapeia fases para rótulos", () => {
    expect(unifiedRealtimeLabel("connected")).toBe("Realtime connected");
    expect(unifiedRealtimeLabel("degraded")).toBe("Realtime degraded");
    expect(unifiedRealtimeLabel("disconnected")).toBe("Realtime disconnected");
  });
});
