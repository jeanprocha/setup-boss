"use strict";

const { stripAccents, normalizeOperationalPhrase } = require("./normalize-operational-plan-language.js");
const { isInternalOperationalLine } = require("./sanitize-operational-plan-content.js");

/** @typedef {{ kind: string, label: string }} OperationalAtom */

const METALANGUAGE =
  /^(adicionar ao plano|incluir no plano|incluir no escopo|atualizar escopo|modificar atividade|alterar o plano|executar ajustes|incorporar pedido)/i;

const PT_FIXES = [
  [/\bfecho\b/gi, "fechamento"],
  [/\babertura e fecho\b/gi, "abertura e fechamento"],
  [/\bfechar e fecho\b/gi, "abrir e fechar"],
];

/**
 * @param {string} text
 */
function isMetalanguageLine(text) {
  const t = String(text || "").trim();
  if (!t || METALANGUAGE.test(t)) return true;
  if (/^incluir no escopo:/i.test(t)) return true;
  if (/^a tarefa foi avaliada como.*porque a tarefa foi avaliada/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * @param {string} raw
 */
function preprocessRawLine(raw) {
  const original = String(raw || "").trim();
  if (!original) return "";
  if (isMetalanguageLine(original)) return "";

  let t = normalizeOperationalPhrase(original);
  if (!t) return "";

  for (const [re, rep] of PT_FIXES) {
    t = t.replace(re, rep);
  }

  t = t
    .replace(
      /^(adicionar ao plano|incluir no plano|incluir no escopo|atualizar escopo)\s*(a\s+)?/i,
      "",
    )
    .replace(/^a criação de\s+/i, "criar ")
    .replace(/^criação de\s+/i, "criar ")
    .replace(/^implementação de\s+/i, "implementar ")
    .replace(/^modificar\s+/i, "alterar ")
    .trim();

  if (/^criar\s+/i.test(t)) {
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }

  return t;
}

/**
 * Sinais transversais (reutilização, responsividade, tema) extraídos da linha inteira.
 * @param {string} n linha normalizada sem acentos
 * @param {string} t linha pré-processada
 * @returns {OperationalAtom[]}
 */
function extractSemanticSignalAtoms(n, t) {
  /** @type {OperationalAtom[]} */
  const atoms = [];

  if (/\breutiliz/.test(n)) {
    atoms.push({ kind: "flag:reusable", label: "reutilizável" });
  }
  if (/\bresponsiv|mobile|desktop\b/.test(n) || /^garantir\s+responsiv/i.test(t)) {
    atoms.push({
      kind: "task:validate_responsive",
      label: "Validar responsividade.",
    });
  }
  if (
    (/\btema\b/.test(n) && /\b(claro|escuro|dark)\b/.test(n)) ||
    /^garantir\s+.*tema/i.test(t) ||
    /\bclaro\s*\/\s*escuro\b/.test(n) ||
    /\bmodo\s+(claro|escuro)\b/.test(n)
  ) {
    atoms.push({
      kind: "task:validate_theme",
      label: "Validar compatibilidade com tema claro/escuro.",
    });
  }

  return atoms;
}

/**
 * Átomo principal da linha (entregável, exclusão, anexo, etc.).
 * @param {string} line
 * @param {boolean} visualOnly
 * @returns {OperationalAtom|null}
 */
function parseLineToAtomPrimary(line, visualOnly) {
  const t = preprocessRawLine(line);
  if (!t || t.length < 4 || isInternalOperationalLine(t) || isMetalanguageLine(t)) {
    return null;
  }

  const n = stripAccents(t.toLowerCase());

  if (/\bfora\s+do\s+escopo\b/.test(n) || /^confirmar que permanecem/i.test(n)) {
    return null;
  }

  if (
    /^implementar\s+componentes\s+visuais\s+de\s+forma\s+incremental/i.test(n) ||
    /^executar\s+entregas\s+na\s+ordem\s+definida/i.test(n)
  ) {
    return null;
  }

  if (/\bbackend\b/.test(n) && !/^implementar backend/i.test(n)) {
    return { kind: "scope_out:backend", label: "Backend do chat." };
  }
  if (/\bwebsocket\b/.test(n)) {
    return { kind: "scope_out:websocket", label: "WebSocket." };
  }
  if (/\bpersist/.test(n)) {
    return { kind: "scope_out:persistence", label: "Persistência." };
  }
  if (/\b(envio real|mensagens reais|funcionalidade real).*(mensagens|chat)/i.test(n)) {
    return { kind: "scope_out:messaging", label: "Envio real de mensagens." };
  }
  if (/\b(api externa|integra[cç][aã]o com ia|ia\/api|apis externas)/i.test(n)) {
    return { kind: "scope_out:external_api", label: "Integração com IA ou APIs externas." };
  }
  if (
    /\b(comunica[cç][aã]o|mensagens?).{0,24}tempo\s+real|tempo\s+real\b/i.test(n)
  ) {
    return { kind: "scope_out:websocket", label: "WebSocket." };
  }

  if (
    /\bfuncionalidade\b.*\bchat\b/i.test(n) ||
    (/\bchat\b/.test(n) && /\b(só|somente|agora|apenas)\b.*\bvisual\b/i.test(n))
  ) {
    return {
      kind: "deliverable:chat_visual",
      label: "Criar componente visual reutilizável do chat.",
    };
  }

  if (/\b(bot[aã]o|btn)\b/.test(n) && /\b(abrir|fechar|fechamento|toggle)\b/.test(n)) {
    return {
      kind: "deliverable:button_toggle",
      label: "Criar componente de botão para abrir/fechar o chat.",
    };
  }

  if (/\bchat\b/.test(n) && /\b(visual|componente|interface|ui)\b/.test(n)) {
    return {
      kind: "deliverable:chat_visual",
      label: "Criar componente visual reutilizável do chat.",
    };
  }

  if (/\bchat\b/.test(n) && /\b(criar|componente|somente|apenas|visual)\b/.test(n)) {
    return {
      kind: "deliverable:chat_visual",
      label: "Criar componente visual reutilizável do chat.",
    };
  }

  if (/\bintegra/.test(n) && /\b(tela|integra|componente|bot[aã]o|chat)\b/.test(n)) {
    return {
      kind: "deliverable:integrate",
      label: "Integrar os componentes na tela de Integrações.",
    };
  }

  if (/\b(anexo|upload)\b/.test(n)) {
    if (/\b(estrutural|visual|prepar|futur|sem\s+funcional)\b/.test(n)) {
      return {
        kind: "deliverable:attachments_structural",
        label:
          "Preparar estrutura visual e de dados para suporte futuro a anexos (sem upload funcional nesta fase).",
      };
    }
    return {
      kind: "deliverable:attachments",
      label: "Incluir suporte a anexos no fluxo conforme pedido.",
    };
  }

  if (/\bestrutura\s+visual\b/.test(n) && /\banexo/i.test(n)) {
    return {
      kind: "deliverable:attachments_structural",
      label:
        "Preparar apenas estrutura visual/dados para anexos futuros (sem integração funcional agora).",
    };
  }

  if (/^criar\s+/i.test(t) || /^implementar\s+/i.test(t) || /^integrar\s+/i.test(t)) {
    let label = t.endsWith(".") ? t : `${t}.`;
    if (visualOnly && /\bfuncionalidade\b/i.test(label)) {
      label = label.replace(/\bfuncionalidade\b/gi, "interface visual");
    }
    return { kind: `generic:${semanticKeyShort(n)}`, label };
  }

  return null;
}

const SIGNAL_ONLY_KINDS = new Set([
  "flag:reusable",
  "task:validate_responsive",
  "task:validate_theme",
]);

/**
 * @param {string} line
 * @param {boolean} visualOnly
 * @returns {OperationalAtom[]}
 */
function parseLineToAtoms(line, visualOnly) {
  const t = preprocessRawLine(line);
  if (!t || t.length < 4 || isInternalOperationalLine(t) || isMetalanguageLine(t)) {
    return [];
  }

  const n = stripAccents(t.toLowerCase());
  if (/\bfora\s+do\s+escopo\b/.test(n) || /^confirmar que permanecem/i.test(n)) {
    return [];
  }

  /** @type {OperationalAtom[]} */
  const atoms = [...extractSemanticSignalAtoms(n, t)];
  const primary = parseLineToAtomPrimary(line, visualOnly);
  if (primary) {
    const hasKind = atoms.some((a) => a.kind === primary.kind);
    if (!hasKind) atoms.push(primary);
  }

  return mergeAtomsByKind(atoms);
}

/**
 * Compatibilidade: devolve o átomo principal mais relevante da linha.
 * @param {string} line
 * @param {boolean} visualOnly
 */
function parseLineToAtom(line, visualOnly) {
  const atoms = parseLineToAtoms(line, visualOnly);
  const priority = [
    (a) => a.kind.startsWith("scope_out:"),
    (a) => a.kind.startsWith("deliverable:"),
    (a) => a.kind.startsWith("generic:"),
    (a) => a.kind.startsWith("task:"),
    (a) => a.kind.startsWith("flag:"),
  ];
  for (const pred of priority) {
    const hit = atoms.find(pred);
    if (hit) return hit;
  }
  return atoms[0] ?? null;
}

/**
 * @param {string} n
 */
function semanticKeyShort(n) {
  if (/\bchat\b/.test(n)) return "chat";
  if (/\bbot[aã]o\b/.test(n)) return "button";
  return n.slice(0, 24).replace(/\s+/g, "_");
}

/**
 * @param {OperationalAtom[]} atoms
 */
function mergeAtomsByKind(atoms) {
  /** @type {Map<string, OperationalAtom>} */
  const map = new Map();
  for (const atom of atoms) {
    if (!atom?.kind) continue;
    const prev = map.get(atom.kind);
    if (!prev || atom.label.length < prev.label.length) {
      map.set(atom.kind, atom);
    } else if (atom.label.length === prev.label.length && /^Criar/.test(atom.label)) {
      map.set(atom.kind, atom);
    }
  }
  return [...map.values()];
}

/**
 * Remove duplicação sintática em parágrafos (ex.: "na tela X na tela X").
 * @param {string} text
 */
function dedupeSentenceSyntax(text) {
  let t = String(text || "").trim();
  if (!t) return t;

  t = t.replace(
    /\bna tela de Integrações\s+na tela de Integrações\b/gi,
    "na tela de Integrações",
  );
  t = t.replace(
    /\bna tela integrações\s+na tela de Integrações\b/gi,
    "na tela de Integrações",
  );
  t = t.replace(
    /\b(Será criado um [^.]{8,}?)\s+na tela de Integrações\s+na tela de Integrações/gi,
    "$1 na tela de Integrações",
  );
  t = t.replace(/\s+/g, " ").trim();
  if (t && !/[.!?]$/.test(t)) t += ".";
  return t;
}

module.exports = {
  isMetalanguageLine,
  preprocessRawLine,
  extractSemanticSignalAtoms,
  parseLineToAtomPrimary,
  parseLineToAtom,
  parseLineToAtoms,
  mergeAtomsByKind,
  dedupeSentenceSyntax,
  SIGNAL_ONLY_KINDS,
};
