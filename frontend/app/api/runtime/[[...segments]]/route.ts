import { NextRequest, NextResponse } from "next/server";
import { runtimeUpstreamUrl } from "@/lib/api/runtime-config";
import { resolveRuntimeProxyTimeoutMs } from "@/lib/api/runtime-proxy-timeouts";

const UPSTREAM = runtimeUpstreamUrl();

const SSE_PATH = "events/stream";

function isSseStream(segments: string[]): boolean {
  return segments.join("/") === SSE_PATH;
}

async function proxySse(req: NextRequest, segments: string[]) {
  const path = `/${segments.map((s) => encodeURIComponent(s)).join("/")}`;
  const target = `${UPSTREAM}${path}${req.nextUrl.search}`;

  try {
    const res = await fetch(target, {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      cache: "no-store",
    });
    if (!res.ok || !res.body) {
      const text = await res.text();
      return new NextResponse(text, {
        status: res.status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type":
          res.headers.get("content-type") || "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        error: { code: "upstream_unreachable", message: msg },
      },
      { status: 502 },
    );
  }
}

async function proxyRuntime(
  req: NextRequest,
  segments: string[],
  method: "GET" | "POST" | "PUT" | "DELETE",
) {
  const path =
    segments.length > 0
      ? `/${segments.map((s) => encodeURIComponent(s)).join("/")}`
      : "/";
  const target = `${UPSTREAM}${path}${req.nextUrl.search}`;

  try {
    const proxyTimeoutMs = resolveRuntimeProxyTimeoutMs(method, segments);
    const ctrl = AbortSignal.timeout(proxyTimeoutMs);
    const headers: Record<string, string> = { Accept: "application/json" };
    let body: string | undefined;
    if (method === "POST" || method === "PUT") {
      const raw = await req.text();
      body = raw || undefined;
      if (body) headers["Content-Type"] = "application/json";
    }
    const res = await fetch(target, {
      method,
      headers,
      body,
      cache: "no-store",
      signal: ctrl,
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "Content-Type":
          res.headers.get("content-type") || "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        error: { code: "upstream_unreachable", message: msg },
      },
      { status: 502 },
    );
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ segments?: string[] }> },
) {
  const { segments = [] } = await ctx.params;
  if (isSseStream(segments)) {
    return proxySse(req, segments);
  }
  return proxyRuntime(req, segments, "GET");
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ segments?: string[] }> },
) {
  const { segments = [] } = await ctx.params;
  return proxyRuntime(req, segments, "POST");
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ segments?: string[] }> },
) {
  const { segments = [] } = await ctx.params;
  return proxyRuntime(req, segments, "PUT");
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ segments?: string[] }> },
) {
  const { segments = [] } = await ctx.params;
  return proxyRuntime(req, segments, "DELETE");
}
