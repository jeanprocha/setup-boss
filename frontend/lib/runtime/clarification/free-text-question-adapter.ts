import type { ClarificationQuestionDto } from "@/lib/runtime/clarification/clarification-types";

/** Adapta pergunta livre operacional para o cartão de clarificação (modo minimal). */
export function toClarificationFreeTextQuestion(input: {
  id: string;
  prompt: string;
  blocking?: boolean;
}): ClarificationQuestionDto {
  return {
    id: input.id,
    prompt: input.prompt,
    kind: "free_text",
    blocking: input.blocking ?? true,
    options: [],
    status: "pending",
    answer: null,
  };
}
