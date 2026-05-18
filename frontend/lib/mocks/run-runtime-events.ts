import type { RuntimeEventDto } from "@/lib/api/runtime-types";
import type { MockRun } from "@/lib/mocks/runs";

function isoToday(h: number, m: number, s: number) {
  const d = new Date();
  d.setHours(h, m, s, 0);
  return d.toISOString();
}

/** Eventos sintéticos read-only por corrida mock — alinhados à fase/estado. */
export function mockRunRuntimeEvents(run: MockRun): RuntimeEventDto[] {
  const base = run.startedAt;
  const parts = base.split(":").map(Number);
  const h = Number.isFinite(parts[0]) ? parts[0] : 12;
  const mi = Number.isFinite(parts[1]) ? parts[1] : 0;
  const se = Number.isFinite(parts[2]) ? parts[2] : 0;

  const t0 = isoToday(h, mi, se);
  const t1 = isoToday(h, mi, Math.min(59, se + 2));
  const t2 = isoToday(h, mi, Math.min(59, se + 5));
  const t3 = isoToday(h, mi, Math.min(59, se + 8));

  const mk = (
    id: string,
    iso: string,
    type: string,
    message: string,
    sev: RuntimeEventDto["severity"],
    ch: RuntimeEventDto["channel"],
  ): RuntimeEventDto => ({
    id: `${run.id}-${id}`,
    tsIso: iso,
    ts: new Date(iso).toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
    channel: ch,
    message,
    severity: sev,
    type,
    jobId: run.id,
    runId: run.id,
    phaseHint: run.phase,
  });

  const flow: RuntimeEventDto[] = [
    mk("e0", t0, "job_enqueued", `Enfileirado · ${run.label}`, "info", "orchestrator"),
    mk("e1", t1, "job_started", "Worker reclamou o job", "info", "runtime"),
    mk(
      "e2",
      t2,
      "phase_started",
      `Fase activa · ${run.phase}`,
      "info",
      "orchestrator",
    ),
  ];

  const phase = run.phase.toLowerCase();
  if (
    phase === "execution" ||
    phase === "correction" ||
    run.state === "retrying" ||
    run.state === "correcting"
  ) {
    const t4 = isoToday(h, mi, Math.min(59, se + 11));
    flow.push(
      mk(
        "ex0",
        t2,
        "execution_started",
        "Sessão de execução iniciada (mock)",
        "info",
        "runtime",
      ),
      mk(
        "ex1",
        t3,
        "subtask_running",
        "Subtask activa no executor (mock)",
        "info",
        "runtime",
      ),
    );
    if (run.state === "retrying") {
      flow.push(
        mk(
          "ex2",
          t4,
          "retry_started",
          "Retry operacional iniciado (mock)",
          "warn",
          "runtime",
        ),
      );
    }
    if (run.state === "correcting") {
      flow.push(
        mk(
          "ex3",
          t4,
          "correction_started",
          "Loop de correcção aberto (mock)",
          "warn",
          "policy",
        ),
      );
    }
  }

  if (run.state === "failed") {
    flow.push(
      mk("e3", t3, "job_failed", "Pipeline reportou falha (mock)", "error", "policy"),
    );
  } else if (run.state === "waiting_approval") {
    flow.push(
      mk(
        "e3",
        t3,
        "phase_completed",
        "Revisão aguarda decisão humana (mock)",
        "warn",
        "orchestrator",
      ),
    );
  } else {
    flow.push(
      mk(
        "e3",
        t3,
        "runtime_finished",
        "Último passo operacional sincronizado (mock)",
        "info",
        "runtime",
      ),
    );
  }

  return flow;
}
