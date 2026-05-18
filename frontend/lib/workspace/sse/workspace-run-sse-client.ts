import { SSE_RECONNECT_BACKOFF_MS } from "@/lib/runtime/sse/runtime-sse-types";
import {
  WORKSPACE_RUN_SSE_EVENT_TYPES,
  type WorkspaceRunSseHandlers,
  type WorkspaceRunSsePhase,
} from "@/lib/workspace/sse/workspace-run-sse-types";
import { parseWorkspaceRunSsePayload } from "@/lib/workspace/sse/workspace-run-sse-events";

export class WorkspaceRunSseClient {
  private es: EventSource | null = null;

  private closed = false;

  private attempt = 0;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(url: string, handlers: WorkspaceRunSseHandlers): void {
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

  private setPhase(handlers: WorkspaceRunSseHandlers, phase: WorkspaceRunSsePhase) {
    handlers.onPhase(phase);
  }

  private open(url: string, handlers: WorkspaceRunSseHandlers) {
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

    for (const eventType of WORKSPACE_RUN_SSE_EVENT_TYPES) {
      es.addEventListener(eventType, (ev) => {
        const payload = parseWorkspaceRunSsePayload(
          (ev as MessageEvent).data,
          eventType,
        );
        if (payload) handlers.onWorkspaceRunEvent(payload);
      });
    }

    es.onerror = () => {
      handlers.onError("SSE connection error");
      this.scheduleReconnect(url, handlers);
    };
  }

  private scheduleReconnect(url: string, handlers: WorkspaceRunSseHandlers) {
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
