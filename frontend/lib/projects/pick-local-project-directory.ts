/**
 * Selecção de pasta local (fluxo avançado na UI; registo via POST /projects/register).
 * Preferimos a Directory Picker API; caminho absoluto só existe em ambientes com extensões
 * não standard ao handle (ex.: alguns wrappers desktop).
 */

export type LocalProjectHostKind =
  | "web-chromium"
  | "web-webkit"
  | "electron"
  | "tauri"
  | "unknown";

export type LocalProjectPickResult =
  | { kind: "ok"; path: string; displayName: string }
  | {
      kind: "need_manual";
      displayName?: string;
      reason: string;
    }
  | { kind: "unsupported"; reason: string }
  | { kind: "aborted" };

function getWindowProcess(win: Window): { versions?: { electron?: string } } | undefined {
  return (win as unknown as { process?: { versions?: { electron?: string } } }).process;
}

/** Deteção best-effort para relatório e mensagens; não altera capacidade do picker. */
export function getLocalProjectHostKind(): LocalProjectHostKind {
  if (typeof window === "undefined") return "unknown";

  const w = window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  if (w.__TAURI__ != null || w.__TAURI_INTERNALS__ != null) return "tauri";

  const electronVer = getWindowProcess(window)?.versions?.electron;
  if (typeof electronVer === "string" && electronVer.length > 0) return "electron";

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/\b(Chrome|Chromium|Edg|OPR)\b/i.test(ua)) return "web-chromium";
  if (/\bSafari\b/i.test(ua) && !/\bChrome\b/i.test(ua)) return "web-webkit";

  return "unknown";
}

function tryDirectoryHandleAbsolutePath(
  handle: FileSystemDirectoryHandle,
): string | null {
  const extended = handle as FileSystemDirectoryHandle & { path?: unknown };
  if (typeof extended.path === "string" && extended.path.trim().length > 0) {
    return extended.path.trim();
  }
  return null;
}

function isAbortError(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === "AbortError" || e.code === DOMException.ABORT_ERR)
  );
}

type WindowWithDirectoryPicker = Window &
  typeof globalThis & {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
      startIn?: FileSystemHandle | "desktop" | "documents" | "downloads";
    }) => Promise<FileSystemDirectoryHandle>;
  };

/**
 * Abre o seletor nativo de pasta quando disponível.
 * Deve ser chamado a partir de um gesto do utilizador (clique), caso contrário o browser pode bloquear.
 */
export async function pickLocalProjectDirectory(): Promise<LocalProjectPickResult> {
  if (typeof window === "undefined") {
    return {
      kind: "unsupported",
      reason: "Ambiente sem window (SSR).",
    };
  }

  const w = window as WindowWithDirectoryPicker;
  const picker = w.showDirectoryPicker;

  if (typeof picker !== "function") {
    return {
      kind: "unsupported",
      reason:
        "Este browser não expõe showDirectoryPicker() (File System Access API).",
    };
  }

  try {
    const handle = await picker.call(w, { mode: "read" });
    const displayName = handle.name || "pasta";
    const absolute = tryDirectoryHandleAbsolutePath(handle);

    if (absolute) {
      return { kind: "ok", path: absolute, displayName };
    }

    const host = getLocalProjectHostKind();
    const hostHint =
      host === "electron" || host === "tauri"
        ? " Neste ambiente desktop foi detectado um wrapper; mesmo assim o handle não incluiu caminho absoluto."
        : " Em browsers Web padrão, por política de segurança, o handle normalmente não inclui caminho absoluto no disco.";

    return {
      kind: "need_manual",
      displayName,
      reason:
        `O seletor nativo não devolveu um caminho local utilizável para o daemon (apenas o nome «${displayName}»).${hostHint} Introduza ou cole o caminho absoluto abaixo.`,
    };
  } catch (e) {
    if (isAbortError(e)) {
      return { kind: "aborted" };
    }
    const msg =
      e instanceof Error ? e.message : "Falha desconhecida ao abrir o seletor.";
    return {
      kind: "need_manual",
      reason: `O seletor nativo falhou (${msg}). Pode indicar o caminho manualmente.`,
    };
  }
}
