import type { IaValidationPayload } from "@/lib/runtime/intake/ia-validation";

export type ExecutionReadiness = "ready" | "warning" | "blocked";

export type GovernanceTimelineStage = {
  id: string;
  label: string;
  status: string;
  durationMs: number | null;
  message: string | null;
  details: Record<string, unknown> | null;
};

export type IaOnboardingUx = {
  title: string;
  requiredStructure: string[];
  requiredSeedFiles: string[];
  bootstrapDoc: string;
  nextSteps: string[];
  docsLinks: { label: string; path: string }[];
};

export type ProjectGovernanceUx = {
  ok: boolean;
  readiness: ExecutionReadiness;
  headline: string;
  summary: string;
  specVersion: string | null;
  supportedVersions: string[];
  validationDurationMs: number | null;
  warningsCount: number;
  errorsCount: number;
  timeline: GovernanceTimelineStage[];
  onboarding: IaOnboardingUx | null;
  performance: {
    validationDurationMs: number | null;
    fileCount: number | null;
    contentLoadMs: number | null;
    gitListMs: number | null;
  };
  reportText: string;
  validationSnapshot: Record<string, unknown> | null;
  iaValidation: IaValidationPayload | Record<string, unknown> | null;
  code: string | null;
  phase: string | null;
  validatedAt: string;
};

export function parseProjectGovernanceUx(raw: unknown): ProjectGovernanceUx | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const readiness = String(v.readiness || "blocked") as ExecutionReadiness;
  if (!["ready", "warning", "blocked"].includes(readiness)) return null;
  return {
    ok: Boolean(v.ok),
    readiness,
    headline: String(v.headline || ""),
    summary: String(v.summary || ""),
    specVersion:
      v.specVersion != null && String(v.specVersion).trim()
        ? String(v.specVersion).trim()
        : null,
    supportedVersions: Array.isArray(v.supportedVersions)
      ? v.supportedVersions.map((s) => String(s)).filter(Boolean)
      : [],
    validationDurationMs:
      typeof v.validationDurationMs === "number" ? v.validationDurationMs : null,
    warningsCount: typeof v.warningsCount === "number" ? v.warningsCount : 0,
    errorsCount: typeof v.errorsCount === "number" ? v.errorsCount : 0,
    timeline: Array.isArray(v.timeline)
      ? v.timeline.map((row) => {
          const r = row as Record<string, unknown>;
          return {
            id: String(r.id || ""),
            label: String(r.label || r.id || ""),
            status: String(r.status || "skip"),
            durationMs: typeof r.durationMs === "number" ? r.durationMs : null,
            message: r.message != null ? String(r.message) : null,
            details:
              r.details && typeof r.details === "object"
                ? (r.details as Record<string, unknown>)
                : null,
          };
        })
      : [],
    onboarding:
      v.onboarding && typeof v.onboarding === "object"
        ? (v.onboarding as IaOnboardingUx)
        : null,
    performance:
      v.performance && typeof v.performance === "object"
        ? (v.performance as ProjectGovernanceUx["performance"])
        : {
            validationDurationMs: null,
            fileCount: null,
            contentLoadMs: null,
            gitListMs: null,
          },
    reportText: String(v.reportText || ""),
    validationSnapshot:
      v.validationSnapshot && typeof v.validationSnapshot === "object"
        ? (v.validationSnapshot as Record<string, unknown>)
        : null,
    iaValidation:
      v.iaValidation && typeof v.iaValidation === "object"
        ? (v.iaValidation as IaValidationPayload)
        : null,
    code: v.code != null ? String(v.code) : null,
    phase: v.phase != null ? String(v.phase) : null,
    validatedAt: String(v.validatedAt || ""),
  };
}

export function readinessShortLabel(readiness: ExecutionReadiness): string {
  switch (readiness) {
    case "ready":
      return "Ready";
    case "warning":
      return "Warning";
    default:
      return "Blocked";
  }
}

export function readinessBadgeClass(readiness: ExecutionReadiness): string {
  switch (readiness) {
    case "ready":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
    case "warning":
      return "bg-amber-500/15 text-amber-900 dark:text-amber-100";
    default:
      return "bg-destructive/15 text-destructive";
  }
}

export function timelineStatusClass(status: string): string {
  switch (status) {
    case "ok":
      return "text-emerald-700 dark:text-emerald-300";
    case "warn":
      return "text-amber-800 dark:text-amber-200";
    case "fail":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}
