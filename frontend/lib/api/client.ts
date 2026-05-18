import { RUNTIME_API_PROXY_PREFIX } from "@/lib/api/runtime-config";
import { RuntimeApiError } from "@/lib/api/runtime-errors";
import { parseStructuredPreRunError } from "@/lib/runtime/intake/pre-run-error";

const DEFAULT_TIMEOUT_MS = 4500;

function joinUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${RUNTIME_API_PROXY_PREFIX}${p}`;
}

export type RuntimeRequestInit = RequestInit & {
  timeoutMs?: number;
};

async function runtimeFetchJson<T>(
  path: string,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  init: RuntimeRequestInit = {},
  body?: unknown,
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(joinUrl(path), {
      method,
      cache: "no-store",
      ...rest,
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        ...(body != null ? { "Content-Type": "application/json" } : {}),
        ...(rest.headers ?? {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const txt = await res.text();
    let json: unknown = null;
    try {
      json = txt ? JSON.parse(txt) : null;
    } catch {
      throw new RuntimeApiError("Resposta não-JSON", "parse", res.status);
    }
    if (!res.ok) {
      const errObj =
        json &&
        typeof json === "object" &&
        json !== null &&
        "error" in json &&
        (json as { error?: unknown }).error != null
          ? (json as { error: unknown }).error
          : null;
      const structured = parseStructuredPreRunError(errObj);
      const msg = structured?.message
        ? structured.message
        : errObj &&
            typeof errObj === "object" &&
            "message" in errObj &&
            typeof (errObj as { message?: string }).message === "string"
          ? String((errObj as { message: string }).message)
          : `HTTP ${res.status}`;
      throw new RuntimeApiError(msg, "http", res.status, structured ?? undefined);
    }
    return json as T;
  } catch (e) {
    if (e instanceof RuntimeApiError) throw e;
    const abortMsg = e instanceof Error ? e.message : String(e);
    if (
      (e instanceof DOMException && e.name === "AbortError") ||
      /aborted due to timeout|signal timed out/i.test(abortMsg)
    ) {
      throw new RuntimeApiError("Timeout ao contactar runtime", "timeout");
    }
    throw new RuntimeApiError(
      e instanceof Error ? e.message : "Falha de rede",
      "network",
    );
  } finally {
    clearTimeout(t);
  }
}

export async function runtimeGetJson<T>(
  path: string,
  init: RuntimeRequestInit = {},
): Promise<T> {
  return runtimeFetchJson<T>(path, "GET", init);
}

export async function runtimePostJson<T>(
  path: string,
  body: unknown = {},
  init: RuntimeRequestInit = {},
): Promise<T> {
  return runtimeFetchJson<T>(path, "POST", init, body);
}

export async function runtimePatchJson<T>(
  path: string,
  body: unknown = {},
  init: RuntimeRequestInit = {},
): Promise<T> {
  return runtimeFetchJson<T>(path, "PATCH", init, body);
}

export async function runtimePutJson<T>(
  path: string,
  body: unknown = {},
  init: RuntimeRequestInit = {},
): Promise<T> {
  return runtimeFetchJson<T>(path, "PUT", init, body);
}

export async function runtimeDeleteJson<T>(
  path: string,
  init: RuntimeRequestInit = {},
): Promise<T> {
  return runtimeFetchJson<T>(path, "DELETE", init);
}
