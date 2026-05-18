import type { RuntimeUiState } from "./runtime-states";

export type StreamChannel = "orchestrator" | "runtime" | "policy" | "integrity";

export type StreamLineEvent = {
  kind: "line";
  id: string;
  ts: string;
  channel: StreamChannel;
  message: string;
  /** estado visual opcional na linha */
  hintState?: RuntimeUiState;
};

export type StreamCardEvent = {
  kind: "card";
  id: string;
  ts: string;
  cardKind: string;
  title: string;
  detail?: string;
  state?: RuntimeUiState;
};

export type StreamEvent = StreamLineEvent | StreamCardEvent;

export type StreamGroup = {
  id: string;
  label: string;
  events: StreamEvent[];
};

export const mockStreamGroups: StreamGroup[] = [
  {
    id: "g-strategy",
    label: "Strategy",
    events: [
      {
        kind: "card",
        id: "c-strat",
        ts: "14:00:02",
        cardKind: "strategy",
        title: "Strategy generated",
        detail: "Plano com 7 subtasks, ordem parcial respeitada (mock).",
        state: "success",
      },
      {
        kind: "line",
        id: "l1",
        ts: "14:00:08",
        channel: "orchestrator",
        message: "Handoff para strategy-runtime: manifesto versionado",
      },
    ],
  },
  {
    id: "g-exec",
    label: "Execution",
    events: [
      {
        kind: "card",
        id: "c-exec",
        ts: "14:01:10",
        cardKind: "execution",
        title: "Execution started",
        detail: "Executor MVP ligado ao grafo linear (mock).",
        state: "running",
      },
      {
        kind: "line",
        id: "l2",
        ts: "14:01:44",
        channel: "runtime",
        message: "Subtask 2/7 — validate-execution-patch em curso",
        hintState: "running",
      },
      {
        kind: "line",
        id: "l3",
        ts: "14:02:01",
        channel: "runtime",
        message: "Review rejected — veredicto: changes_requested",
        hintState: "failed",
      },
      {
        kind: "card",
        id: "c-corr",
        ts: "14:02:06",
        cardKind: "correction",
        title: "Correction started",
        detail: "Loop de correcção com orçamento de tentativas (mock).",
        state: "correcting",
      },
      {
        kind: "line",
        id: "l4",
        ts: "14:02:19",
        channel: "orchestrator",
        message: "Retrying subtask após patch sintético",
        hintState: "retrying",
      },
      {
        kind: "card",
        id: "c-rec",
        ts: "14:03:40",
        cardKind: "recovery",
        title: "Recovered",
        detail: "Estado consistente após rollback parcial (mock).",
        state: "recovered",
      },
    ],
  },
  {
    id: "g-integrity",
    label: "Integrity",
    events: [
      {
        kind: "line",
        id: "l5",
        ts: "14:04:02",
        channel: "integrity",
        message: "Integrity validated — runtime-integrity-report OK",
        hintState: "success",
      },
      {
        kind: "line",
        id: "l6",
        ts: "14:04:05",
        channel: "policy",
        message: "Gate HITL: aguardando aprovação humana",
        hintState: "waiting_approval",
      },
      {
        kind: "line",
        id: "l7",
        ts: "14:04:11",
        channel: "policy",
        message: "Política bloqueou avanço — revisão obrigatória",
        hintState: "blocked",
      },
      {
        kind: "line",
        id: "l8",
        ts: "14:04:18",
        channel: "runtime",
        message: "Advertência: latência acima do p50 (não bloqueante)",
        hintState: "warning",
      },
    ],
  },
];
