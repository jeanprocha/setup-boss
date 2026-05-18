export const mockConsoleLines: string[] = [
  "[14:04:01] orchestrator: session=run-1024 phase=execution",
  "[14:04:02] executor: subtask validate-execution-patch START",
  "[14:04:03] executor: stdout — artefacto .setup-boss/runs/…json escrito",
  "[14:04:04] review: verdict=changes_requested (mock)",
  "[14:04:05] policy: HITL gate observação — sem mutação",
];

export const mockArtifactEntries: {
  name: string;
  kind: string;
  size: string;
}[] = [
  { name: "strategy-manifest.json", kind: "json", size: "12.4 KB" },
  { name: "execution-session.md", kind: "markdown", size: "4.1 KB" },
  { name: "integrity-report.json", kind: "json", size: "2.0 KB" },
];

export const mockDiagnostics: {
  level: "error" | "warn" | "info";
  code: string;
  message: string;
}[] = [
  {
    level: "warn",
    code: "LAT-P50",
    message: "Latência acima do p50 no último ciclo (não bloqueante).",
  },
  {
    level: "info",
    code: "HITL-OBS",
    message: "Gate humano em modo observação.",
  },
  {
    level: "error",
    code: "REV-CR",
    message: "Review rejeitado — changes_requested (mock).",
  },
];
