/** Fases operacionais da validação `docs/.IA` antes de SPEC / clarificação. */
export type KnowledgeBootstrapPhase =
  | "knowledge_bootstrap_running"
  | "knowledge_bootstrap_missing"
  | "knowledge_bootstrap_untracked"
  | "knowledge_bootstrap_wrong_path"
  | "knowledge_bootstrap_ready";

const KNOWLEDGE_BOOTSTRAP_PHASES: KnowledgeBootstrapPhase[] = [
  "knowledge_bootstrap_running",
  "knowledge_bootstrap_missing",
  "knowledge_bootstrap_untracked",
  "knowledge_bootstrap_wrong_path",
  "knowledge_bootstrap_ready",
];

export function isKnowledgeBootstrapPhase(
  value: string | null | undefined,
): value is KnowledgeBootstrapPhase {
  return (
    value != null &&
    (KNOWLEDGE_BOOTSTRAP_PHASES as string[]).includes(String(value))
  );
}
