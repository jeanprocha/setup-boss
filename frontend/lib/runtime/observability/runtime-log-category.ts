import type { RuntimeEventDto } from "@/lib/api/runtime-types";

/**
 * Categorias de log na UI (filtros + badges).
 * Mantém nomes estáveis para evoluir para OTel sem quebrar filtros guardados.
 */
export function runtimeEventLogCategory(ev: RuntimeEventDto): string {
  const t = (ev.type || "").toLowerCase();
  if (
    t.includes("commit") ||
    t.includes("pull_request") ||
    t.includes("pr_") ||
    t.includes("branch") ||
    t.includes("git")
  )
    return "git";
  if (
    t.includes("lint") ||
    t.includes("test") ||
    t.includes("validat") ||
    t.includes("semantic")
  )
    return "validation";
  if (
    t.includes("provider") ||
    t.includes("model") ||
    t.includes("openai") ||
    t.includes("anthropic") ||
    t.includes("llm")
  )
    return "provider";
  if (t.includes("strategy")) return "strategy";
  if (t.includes("execution") || t.includes("subtask")) return "execution";
  if (t.includes("review")) return "review";
  if (t.includes("correct")) return "correction";
  if (t.includes("clarif") || t.includes("answer") || t.includes("approve"))
    return "clarification";
  if (t.includes("sse") || t.includes("stream")) return "sse";
  if (ev.channel === "policy") return "policy";
  if (ev.channel === "integrity") return "integrity";
  return "runtime";
}
