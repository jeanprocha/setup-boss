/**
 * Prefixo same-origin para o proxy Next (`app/api/runtime/...`).
 * Nunca apontar o browser directamente ao daemon (CORS).
 */
export const RUNTIME_API_PROXY_PREFIX = "/api/runtime";

export function runtimeUpstreamUrl(): string {
  const raw =
    process.env.SETUP_BOSS_RUNTIME_API_URL ??
    process.env.NEXT_PUBLIC_SETUP_BOSS_RUNTIME_API_URL;
  const base = (raw && String(raw).trim()) || "http://127.0.0.1:3210";
  return base.replace(/\/+$/, "");
}
