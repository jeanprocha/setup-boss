import type { ArtifactVm } from "@/lib/runtime/evidence-types";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Braces,
  ClipboardList,
  FileQuestion,
  FileText,
  FolderOutput,
  Layers,
  RotateCcw,
  ScrollText,
  Shield,
  Stethoscope,
  Wrench,
} from "lucide-react";
import type { ArtifactCategory } from "@/lib/runtime/evidence-types";

export const ARTIFACT_CATEGORIES: ArtifactCategory[] = [
  "runtime",
  "strategy",
  "execution",
  "review",
  "correction",
  "rollback",
  "diagnostics",
  "integrity",
  "observability",
];

export type ArtifactViewerKind = "json" | "markdown" | "text" | "unsupported";

const CATEGORY_LABELS_PT: Record<ArtifactCategory, string> = {
  runtime: "Runtime",
  strategy: "Estratégia",
  execution: "Execução",
  review: "Revisão",
  correction: "Correcção",
  rollback: "Rollback",
  diagnostics: "Diagnostics",
  integrity: "Integridade",
  observability: "Observabilidade",
};

export function artifactCategoryLabel(c: ArtifactCategory): string {
  return CATEGORY_LABELS_PT[c] ?? c;
}

const CATEGORY_ORDER = new Map(
  ARTIFACT_CATEGORIES.map((c, i) => [c, i]),
);

export function compareArtifactCategories(
  a: ArtifactCategory,
  b: ArtifactCategory,
): number {
  return (
    (CATEGORY_ORDER.get(a) ?? 99) - (CATEGORY_ORDER.get(b) ?? 99)
  );
}

/** Heurística por nome/caminho virtual — sem I/O. */
export function inferArtifactCategory(
  virtualPath: string,
  displayName: string,
): ArtifactCategory {
  const s = `${virtualPath}/${displayName}`.toLowerCase();
  if (s.includes("integrity") || s.includes("validation")) return "integrity";
  if (s.includes("diagnostic") || s.includes("doctor")) return "diagnostics";
  if (s.includes("observability") || s.includes("telemetry"))
    return "observability";
  if (s.includes("rollback") || s.includes("snapshot")) return "rollback";
  if (s.includes("correction") || s.includes("patch-loop"))
    return "correction";
  if (s.includes("review") || s.includes("verdict")) return "review";
  if (s.includes("execution") || s.includes("executor")) return "execution";
  if (s.includes("strategy") || s.includes("manifest")) return "strategy";
  return "runtime";
}

export function normalizeMimeFromName(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith(".json")) return "application/json";
  if (n.endsWith(".md") || n.endsWith(".markdown")) return "text/markdown";
  if (n.endsWith(".txt") || n.endsWith(".log")) return "text/plain";
  if (n.endsWith(".ndjson")) return "application/x-ndjson";
  return "application/octet-stream";
}

export function viewerKindToFileExtension(
  viewer: ArtifactViewerKind,
): string {
  if (viewer === "json") return "json";
  if (viewer === "markdown") return "md";
  if (viewer === "text") return "txt";
  return "bin";
}

/** Nome de ficheiro para download — não duplica extensão (ex. metadata.json.json). */
export function artifactDownloadFilename(
  displayName: string,
  viewer: ArtifactViewerKind,
): string {
  const safe = displayName.replace(/[^\w.-]+/g, "_") || "artifact";
  const ext = viewerKindToFileExtension(viewer);
  const lower = safe.toLowerCase();
  if (lower.endsWith(`.${ext}`)) return safe;
  if (/\.[a-z0-9]+$/i.test(safe)) return safe;
  return `${safe}.${ext}`;
}

export function selectArtifactViewer(
  mime: string,
  displayName: string,
): ArtifactViewerKind {
  const m = mime.toLowerCase();
  const n = displayName.toLowerCase();
  if (m.includes("json") || n.endsWith(".json")) return "json";
  if (m.includes("markdown") || n.endsWith(".md")) return "markdown";
  if (m.includes("text") || n.endsWith(".txt") || n.endsWith(".log"))
    return "text";
  if (m.includes("ndjson")) return "text";
  return "unsupported";
}

const ICON_MAP: Record<ArtifactCategory, LucideIcon> = {
  runtime: FolderOutput,
  strategy: Layers,
  execution: Activity,
  review: ClipboardList,
  correction: Wrench,
  rollback: RotateCcw,
  diagnostics: Stethoscope,
  integrity: Shield,
  observability: Activity,
};

export function artifactCategoryIcon(category: ArtifactCategory): LucideIcon {
  return ICON_MAP[category] ?? FileText;
}

export function artifactTypeIcon(viewer: ArtifactViewerKind): LucideIcon {
  if (viewer === "json") return Braces;
  if (viewer === "markdown") return ScrollText;
  if (viewer === "text") return FileText;
  return FileQuestion;
}

export function artifactStatusLabel(status: ArtifactVm["status"]): string {
  switch (status) {
    case "ready":
      return "Pronto";
    case "stale":
      return "Desactualizado";
    case "pending":
      return "Pendente";
    default:
      return status;
  }
}

export function artifactSourceLabel(source: ArtifactVm["source"]): string {
  switch (source) {
    case "runtime":
      return "Runtime";
    case "bundle":
      return "Pacote";
    case "synthesized":
      return "Sintético";
    default:
      return source;
  }
}

export function findRelatedArtifact(
  artifactId: string | null,
  artifactById: Map<string, ArtifactVm>,
): ArtifactVm | null {
  if (!artifactId) return null;
  return artifactById.get(artifactId) ?? null;
}
