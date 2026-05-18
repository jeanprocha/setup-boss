/**
 * Sanitização de texto para o plano operacional exibido ao utilizador.
 * Remove resíduos de markdown e normaliza fragmentos quebrados.
 */

const WEAK_LABEL_ONLY =
  /^(respostas de clarifica[cç][aã]o|contexto|crit[eé]rio de sucesso|escopo refinado|decis[oõ]es confirmadas|passos propostos|consideradas?|nenhuma al[eé]m)\s*:?\s*$/i;

const LABEL_PREFIX =
  /^(fora do escopo|fora|inclu[ií]do|exclu[ií]do|escopo|contexto|objetivo|crit[eé]rio)\s*:\s*>?\s*/i;

/** Remove marcadores markdown e normaliza espaços. */
export function stripMarkdownArtifacts(text: string): string {
  let t = text.trim();
  if (!t) return "";

  t = t.replace(/\r\n/g, "\n");
  t = t.replace(/^(?:>\s*)+/gm, "");
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/(?:^|\s)#{1,6}\s+/g, " ");
  t = t.replace(LABEL_PREFIX, "");
  t = t.replace(/^[-*•]\s+/, "");
  t = t.replace(/^\d+\.\s+/, "");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

export function isMarkdownResidue(text: string): boolean {
  const raw = text.trim();
  if (!raw || raw.length < 2) return true;
  if (/^>\s*#{1,6}/.test(raw)) return true;
  if (/^#{1,6}\s*[\w\s]{0,32}$/.test(raw)) return true;
  if (/^>\s*$/.test(raw)) return true;
  if (/^[\s>#*_-]+$/.test(raw)) return true;
  if (/^fora\s*:\s*>?\s*$/i.test(raw)) return true;
  return false;
}

export function isWeakOperationalLabel(text: string): boolean {
  const t = stripMarkdownArtifacts(text);
  if (!t || t.length < 4) return true;
  if (WEAK_LABEL_ONLY.test(t)) return true;
  if (/^[^:]+:\s*$/.test(t) && t.length < 55) return true;
  return false;
}

/** Texto pronto para exibição humana; null se inválido ou vazio. */
export function sanitizeOperationalText(text: string): string | null {
  const t = stripMarkdownArtifacts(text);
  if (!t || t.length < 3) return null;
  if (isMarkdownResidue(text) || isMarkdownResidue(t)) return null;
  if (isWeakOperationalLabel(t)) return null;

  const colonIdx = t.indexOf(":");
  if (colonIdx > 0 && colonIdx < 28 && t.length < 90) {
    const label = t.slice(0, colonIdx).trim();
    const rest = t.slice(colonIdx + 1).trim();
    if (LABEL_PREFIX.test(`${label}:`) || /^(fora|contexto|escopo)$/i.test(label)) {
      if (!rest || rest === ">") return null;
      return sanitizeOperationalText(rest);
    }
  }

  return t;
}

function capitalizeFirst(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function uniqueByLowercase(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Divide respostas compostas (vírgula, ponto-e-vírgula, lista) em itens legíveis. */
export function splitHumanListItems(raw: string): string[] {
  const base = stripMarkdownArtifacts(raw);
  if (!base) return [];

  const segments = base
    .split(/\n|[;]|(?:,\s+(?=[a-záàâãéêíóôõúç]))/i)
    .flatMap((seg) => seg.split(/\s+-\s+/))
    .map((seg) => sanitizeOperationalText(seg))
    .filter((s): s is string => Boolean(s && s.length >= 3));

  return uniqueByLowercase(segments.map(capitalizeFirst));
}

/** Parágrafo único a partir de texto possivelmente multilinha/markdown. */
export function sanitizeOperationalParagraph(text: string): string | null {
  const lines = text
    .split("\n")
    .map((l) => sanitizeOperationalText(l))
    .filter((l): l is string => Boolean(l));

  if (lines.length === 0) {
    return sanitizeOperationalText(text.replace(/\n/g, " "));
  }

  const joined = lines.join(" ").replace(/\s+/g, " ").trim();
  return joined.length >= 3 ? joined : null;
}
