import {
  SSE_EVENT_CONNECTED,
  SSE_EVENT_HEARTBEAT,
  SSE_EVENT_RUNTIME,
  parseConnectedPayload,
  parseHeartbeatPayload,
  parseRuntimeEventPayload,
} from "@/lib/runtime/sse/runtime-sse-events";
import type {
  RuntimeSseHandlers,
  RuntimeSsePhase,
} from "@/lib/runtime/sse/runtime-sse-types";
import { SSE_RECONNECT_BACKOFF_MS } from "@/lib/runtime/sse/runtime-sse-types";

export class RuntimeSseClient {
  private es: EventSource | null = null;

  private closed = false;

  private attempt = 0;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(url: string, handlers: RuntimeSseHandlers): void {
    this.closed = false;
    this.open(url, handlers);
  }

  disconnect(): void {
    this.closed = true;
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.es?.close();
    this.es = null;
    this.attempt = 0;
  }

  private setPhase(handlers: RuntimeSseHandlers, phase: RuntimeSsePhase) {
    handlers.onPhase(phase);
  }

  private open(url: string, handlers: RuntimeSseHandlers) {
    if (this.closed) return;
    this.es?.close();
    this.setPhase(
      handlers,
      this.attempt > 0 ? "reconnecting" : "connecting",
    );

    const es = new EventSource(url);
    this.es = es;

    es.addEventListener("open", () => {
      this.attempt = 0;
      this.setPhase(handlers, "connected");
    });

    es.addEventListener(SSE_EVENT_CONNECTED, (ev) => {
      const p = parseConnectedPayload((ev as MessageEvent).data);
      if (p) handlers.onConnected(p);
    });

    es.addEventListener(SSE_EVENT_HEARTBEAT, (ev) => {
      const p = parseHeartbeatPayload((ev as MessageEvent).data);
      handlers.onHeartbeat(p ?? { ts: new Date().toISOString() });
    });

    es.addEventListener(SSE_EVENT_RUNTIME, (ev) => {
      const row = parseRuntimeEventPayload((ev as MessageEvent).data);
      if (row) handlers.onRuntimeEvent(row);
    });

    es.onerror = () => {
      handlers.onError("SSE connection error");
      this.scheduleReconnect(url, handlers);
    };
  }

  private scheduleReconnect(url: string, handlers: RuntimeSseHandlers) {
    if (this.closed) return;
    this.es?.close();
    this.es = null;
    this.setPhase(handlers, "reconnecting");
    const delay =
      SSE_RECONNECT_BACKOFF_MS[
        Math.min(this.attempt, SSE_RECONNECT_BACKOFF_MS.length - 1)
      ];
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open(url, handlers);
    }, delay);
  }
}
