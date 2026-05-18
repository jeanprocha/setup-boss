/** Scroll suave até elemento `id` no feed central da actividade. */
export function scrollToExecutionAnchor(scrollTargetId: string | null) {
  if (!scrollTargetId) return;
  document
    .getElementById(scrollTargetId)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}
