export type IaValidationCheckStatus = "ok" | "fail" | "skip" | "warn";

export type IaValidationCheck = {
  id: string;
  label: string;
  status: IaValidationCheckStatus;
};

export type IaValidationError = {
  check: string;
  code: string;
  message: string;
};

export type IaValidationPayload = {
  valid: boolean;
  specVersion: string | null;
  supportedVersions?: string[];
  checks: IaValidationCheck[];
  errors: IaValidationError[];
  warnings: string[];
  git: Record<string, unknown>;
  seed: Record<string, unknown>;
  version: Record<string, unknown>;
  structure: Record<string, unknown>;
  drift: Record<string, unknown>;
  policy: Record<string, unknown>;
};

export function parseIaValidation(raw: unknown): IaValidationPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (!Array.isArray(v.checks)) return null;
  return {
    valid: Boolean(v.valid),
    specVersion:
      v.specVersion != null && String(v.specVersion).trim()
        ? String(v.specVersion).trim()
        : null,
    supportedVersions: Array.isArray(v.supportedVersions)
      ? v.supportedVersions.map((s) => String(s)).filter(Boolean)
      : [],
    checks: v.checks.map((c) => {
      const row = c as Record<string, unknown>;
      return {
        id: String(row.id || ""),
        label: String(row.label || row.id || ""),
        status: (String(row.status || "skip") as IaValidationCheckStatus) || "skip",
      };
    }),
    errors: Array.isArray(v.errors)
      ? v.errors.map((e) => {
          const row = e as Record<string, unknown>;
          return {
            check: String(row.check || ""),
            code: String(row.code || ""),
            message: String(row.message || ""),
          };
        })
      : [],
    warnings: Array.isArray(v.warnings)
      ? v.warnings.map((w) => String(w)).filter(Boolean)
      : [],
    git: v.git && typeof v.git === "object" ? (v.git as Record<string, unknown>) : {},
    seed:
      v.seed && typeof v.seed === "object" ? (v.seed as Record<string, unknown>) : {},
    version:
      v.version && typeof v.version === "object"
        ? (v.version as Record<string, unknown>)
        : {},
    structure:
      v.structure && typeof v.structure === "object"
        ? (v.structure as Record<string, unknown>)
        : {},
    drift:
      v.drift && typeof v.drift === "object" ? (v.drift as Record<string, unknown>) : {},
    policy:
      v.policy && typeof v.policy === "object"
        ? (v.policy as Record<string, unknown>)
        : {},
  };
}

export function iaCheckStatusLabel(status: IaValidationCheckStatus): string {
  switch (status) {
    case "ok":
      return "OK";
    case "fail":
      return "Falha";
    case "warn":
      return "Aviso";
    default:
      return "—";
  }
}

function sectionHasContent(section: Record<string, unknown>): boolean {
  return Object.keys(section).some((k) => k !== "ok" && section[k] != null);
}

export function iaSectionVisible(
  section: Record<string, unknown>,
  checkStatus?: IaValidationCheckStatus,
): boolean {
  if (checkStatus === "fail" || checkStatus === "warn") return true;
  return sectionHasContent(section);
}
