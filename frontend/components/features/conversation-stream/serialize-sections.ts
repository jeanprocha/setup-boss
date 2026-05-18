import type { ExecutionTimelineCardSection } from "@/lib/runtime/execution/execution-timeline-card-types";

export function serializeTimelineSections(
  sections: readonly ExecutionTimelineCardSection[],
): string {
  const parts: string[] = [];
  for (const s of sections) {
    parts.push(`## ${s.title}`);
    switch (s.kind) {
      case "text":
      case "markdown":
      case "logPreview":
      case "warning":
      case "error":
      case "actionRequired":
      case "metrics":
        if (s.body) parts.push(s.body);
        break;
      case "keyValue":
        for (const it of s.items ?? []) {
          parts.push(`${it.key}: ${it.value}`);
        }
        break;
      case "list":
      case "fileList":
        for (const line of s.lines ?? []) {
          parts.push(`- ${line}`);
        }
        break;
      case "checklist":
        for (const c of s.checklist ?? []) {
          parts.push(`${c.done ? "[x]" : "[ ]"} ${c.label}`);
        }
        break;
      case "clarificationQa":
        for (const pair of s.qaPairs ?? []) {
          parts.push(`**Q:** ${pair.question}`);
          parts.push(`**A:** ${pair.answer}`);
        }
        break;
      case "semanticSubsteps":
        for (const st of s.substeps ?? []) {
          parts.push(`- ${st.label} (${st.status}): ${st.detail}`);
        }
        break;
      default:
        break;
    }
    parts.push("");
  }
  return parts.join("\n").trim();
}
