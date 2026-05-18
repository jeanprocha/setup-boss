/**
 * Resolve chave em notação "a.b.c" sobre um objecto de mensagens.
 * Suporta interpolação simples: "Olá, {name}" + vars { name: "x" }.
 */
export function translate(
  messages: Record<string, unknown>,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const parts = key.split(".").filter(Boolean);
  let cur: unknown = messages;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") {
      return key;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  if (typeof cur !== "string") {
    return key;
  }
  if (!vars) return cur;
  return cur.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = vars[name];
    return v != null ? String(v) : `{${name}}`;
  });
}
