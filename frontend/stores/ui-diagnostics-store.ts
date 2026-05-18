import { create } from "zustand";

import type { StructuredPreRunError } from "@/lib/runtime/intake/pre-run-error";



export type UiDiagnosticLevel = "ERROR" | "WARN" | "INFO";



export type UiDiagnosticEntry = {

  id: string;

  tsIso: string;

  level: UiDiagnosticLevel;

  category: string;

  origin: "mission_control";

  message: string;

  detail: string | null;

  preRun?: StructuredPreRunError | null;

};



const MAX_ENTRIES = 80;



type UiDiagnosticsState = {

  entries: UiDiagnosticEntry[];

  append: (entry: {

    level: UiDiagnosticLevel;

    message: string;

    detail?: Record<string, unknown> | null;

    preRun?: StructuredPreRunError | null;

    category?: string;

  }) => void;

  clear: () => void;

};



export const useUiDiagnosticsStore = create<UiDiagnosticsState>((set) => ({

  entries: [],

  append: (entry) =>

    set((s) => {

      const row: UiDiagnosticEntry = {

        id: `ui_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,

        tsIso: entry.preRun?.timestamp || new Date().toISOString(),

        level: entry.level,

        category: entry.category?.trim() || "ui",

        origin: "mission_control",

        message: entry.message,

        detail: entry.detail ? JSON.stringify(entry.detail, null, 2) : null,

        preRun: entry.preRun ?? null,

      };

      return { entries: [...s.entries, row].slice(-MAX_ENTRIES) };

    }),

  clear: () => set({ entries: [] }),

}));



export function logIntakeStartFailure(detail: {

  projectId: string;

  selectedProjectId: string | null;

  endpoint: string;

  status: number;

  apiMessage: string;

  phase: "preflight" | "api" | "submit";

  preRun?: StructuredPreRunError | null;

  timeoutMs?: number;

  elapsedMs?: number;

}) {

  const preRun = detail.preRun ?? null;

  const message =

    preRun?.code === "INTAKE_TIMEOUT"

      ? "Tempo limite ao iniciar execução"

      : detail.phase === "preflight"

        ? "Tentativa de iniciar execução bloqueada na UI"

        : preRun?.title?.trim() ||

          (detail.apiMessage.includes("rejeitado") ||

          detail.apiMessage.includes("não encontrado") ||

          detail.apiMessage.includes("not found")

            ? "Falha ao criar corrida — projectId rejeitado pelo runtime"

            : preRun?.title || "Falha ao iniciar execução (POST /runs)");

  useUiDiagnosticsStore.getState().append({

    level: "ERROR",

    message,

    preRun,

    detail: {

      projectIdUsed: detail.projectId,

      selectedProjectIdInShell: detail.selectedProjectId,

      endpoint: detail.endpoint,

      httpStatus: detail.status,

      apiMessage: detail.apiMessage,

      phase: detail.phase,

      ...(detail.timeoutMs != null ? { timeoutMs: detail.timeoutMs } : {}),

      ...(detail.elapsedMs != null ? { elapsedMs: detail.elapsedMs } : {}),

      ...(preRun ? { structured: preRun } : {}),

    },

  });

}


