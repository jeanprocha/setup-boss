import type { ArtifactVm, RunEvidenceBundle } from "@/lib/runtime/evidence-types";
import {
  inferArtifactCategory,
  normalizeMimeFromName,
} from "@/lib/runtime/adapters/artifact-adapters";

function art(
  partial: Omit<ArtifactVm, "category" | "mime"> & { displayName: string },
): ArtifactVm {
  const mime = normalizeMimeFromName(partial.displayName);
  return {
    ...partial,
    mime,
    category: inferArtifactCategory(
      partial.virtualPath,
      partial.displayName,
    ),
  };
}

const REVIEW_MD = `## Review gate (mock)

**Veredicto:** \`changes_requested\`

### Observações
- Cobertura de testes aceitável para MVP.
- Ajustar mensagens de erro públicas antes de merge.

> Evidência ligada ao diagnostic \`REV-CR\`.
`;

const STRATEGY_JSON = JSON.stringify(
  {
    version: 1,
    subtasks: [
      { id: "st-1", title: "Validar patch", state: "done" },
      { id: "st-2", title: "Aplicar correções de review", state: "running" },
    ],
    partialOrder: [["st-1", "st-2"]],
  },
  null,
  2,
);

const INTEGRITY_JSON = JSON.stringify(
  {
    ok: true,
    validatedAt: "2026-05-15T12:08:00Z",
    source: "runtime-integrity-bundle",
    continuity: "pass",
    crossValidation: "pass",
    warnings: 0,
  },
  null,
  2,
);

const bundles: Record<string, RunEvidenceBundle> = {
  "run-1024": {
    runId: "run-1024",
    isSynthetic: true,
    consoleLines: [
      "[14:04:01] orchestrator: session=run-1024 phase=execution",
      "[14:04:02] executor: subtask validate-execution-patch START",
      "[14:04:03] executor: artefacto strategy-manifest.json lido",
      "[14:04:04] policy: HITL gate observação — read-only",
    ],
    integrity: {
      state: "ok",
      validatedAtLabel: "14:04:00",
      validationSource: "bundle sintético",
      continuity: "pass",
      crossValidation: "pass",
      summary: "Checksums de manifesto e sessão coerentes (mock).",
      warningsCount: 0,
      inconsistenciesCount: 0,
    },
    artifacts: [
      art({
        id: "a-strat-1024",
        runId: "run-1024",
        displayName: "strategy-manifest.json",
        virtualPath: "strategy/",
        sizeLabel: "12 KB",
        status: "ready",
        source: "runtime",
        content: STRATEGY_JSON,
        relatedPhase: "strategy",
        correlationKey: "evidence-strategy",
      }),
      art({
        id: "a-exec-1024",
        runId: "run-1024",
        displayName: "execution-session.md",
        virtualPath: "execution/",
        sizeLabel: "4 KB",
        status: "ready",
        source: "runtime",
        content:
          "# Sessão de execução\n\nSubtask **validate-execution-patch** em curso.\n",
        relatedPhase: "execution",
        correlationKey: "evidence-exec",
      }),
      art({
        id: "a-obs-1024",
        runId: "run-1024",
        displayName: "latency-hints.ndjson",
        virtualPath: "observability/",
        sizeLabel: "1 KB",
        status: "stale",
        source: "synthesized",
        content: '{"hint":"p50 elevado","ts":"14:03:12"}\n',
        relatedPhase: "execution",
        correlationKey: "LAT-P50",
      }),
    ],
    diagnostics: [
      {
        id: "d-lat",
        severity: "warn",
        code: "LAT-P50",
        message: "Latência acima do p50 no último ciclo (não bloqueante).",
        tsLabel: "14:03:44",
        relatedArtifactId: "a-obs-1024",
        relatedPhase: "execution",
        relatedRunId: "run-1024",
        kind: "warning",
      },
      {
        id: "d-hitl",
        severity: "info",
        code: "HITL-OBS",
        message: "Gate humano em modo observação.",
        tsLabel: "14:03:50",
        relatedArtifactId: null,
        relatedPhase: "execution",
        relatedRunId: "run-1024",
        kind: "runtime",
      },
    ],
  },
  "run-1023": {
    runId: "run-1023",
    isSynthetic: true,
    consoleLines: [
      "[13:41:00] intake: formulário normalizado",
      "[13:41:12] clarify: perguntas resolvidas",
      "[13:41:30] pipeline: concluído sem bloqueios",
    ],
    integrity: {
      state: "ok",
      validatedAtLabel: "13:41:28",
      validationSource: "clarify-runtime",
      continuity: "pass",
      crossValidation: "pass",
      summary: "Nenhuma inconsistência detectada na passagem intake→clarify.",
      warningsCount: 0,
      inconsistenciesCount: 0,
    },
    artifacts: [
      art({
        id: "a-intake-1023",
        runId: "run-1023",
        displayName: "intake-normalized.json",
        virtualPath: "runtime/",
        sizeLabel: "3 KB",
        status: "ready",
        source: "bundle",
        content: JSON.stringify(
          { fields: 6, normalized: true, version: 1 },
          null,
          2,
        ),
        relatedPhase: "intake",
        correlationKey: "intake",
      }),
    ],
    diagnostics: [],
  },
  "run-1022": {
    runId: "run-1022",
    isSynthetic: true,
    consoleLines: [
      "[12:08:33] review: gate aberto",
      "[12:09:01] review: verdict=changes_requested",
    ],
    integrity: {
      state: "degraded",
      validatedAtLabel: "12:08:55",
      validationSource: "review-gate",
      continuity: "warn",
      crossValidation: "pass",
      summary: "Veredicto humano pendente; integridade lógica mantida.",
      warningsCount: 1,
      inconsistenciesCount: 0,
    },
    artifacts: [
      art({
        id: "a-review-1022",
        runId: "run-1022",
        displayName: "review-summary.md",
        virtualPath: "review/",
        sizeLabel: "5 KB",
        status: "ready",
        source: "runtime",
        content: REVIEW_MD,
        relatedPhase: "review",
        correlationKey: "REV-CR",
      }),
      art({
        id: "a-int-1022",
        runId: "run-1022",
        displayName: "integrity-report.json",
        virtualPath: "integrity/",
        sizeLabel: "2 KB",
        status: "ready",
        source: "bundle",
        content: INTEGRITY_JSON,
        relatedPhase: "review",
        correlationKey: "integrity-review",
      }),
    ],
    diagnostics: [
      {
        id: "d-rev",
        severity: "error",
        code: "REV-CR",
        message: "Review rejeitado — changes_requested (mock).",
        tsLabel: "12:09:02",
        relatedArtifactId: "a-review-1022",
        relatedPhase: "review",
        relatedRunId: "run-1022",
        kind: "error",
      },
      {
        id: "d-int",
        severity: "integrity",
        code: "INT-WARN",
        message: "Gate de revisão com aviso de continuidade (não bloqueante).",
        tsLabel: "12:08:56",
        relatedArtifactId: "a-int-1022",
        relatedPhase: "review",
        relatedRunId: "run-1022",
        kind: "integrity",
      },
    ],
  },
  "run-1021": {
    runId: "run-1021",
    isSynthetic: true,
    consoleLines: [
      "[11:55:10] correction: patch batch 2 aplicado",
      "[11:55:40] correction: aguardando re-execução",
    ],
    integrity: {
      state: "ok",
      validatedAtLabel: "11:55:05",
      validationSource: "correction-runtime",
      continuity: "pass",
      crossValidation: "warn",
      summary: "Cross-validation com diff anterior com divergências menores.",
      warningsCount: 1,
      inconsistenciesCount: 0,
    },
    artifacts: [
      art({
        id: "a-cor-1021",
        runId: "run-1021",
        displayName: "correction-loop.txt",
        virtualPath: "correction/",
        sizeLabel: "0.8 KB",
        status: "pending",
        source: "runtime",
        content:
          "correction batch=2\nstatus=awaiting_executor\nrisk=low (mock)\n",
        relatedPhase: "correction",
        correlationKey: "correction",
      }),
    ],
    diagnostics: [
      {
        id: "d-cor",
        severity: "warn",
        code: "CORR-REEXEC",
        message: "Correcção aplicada — re-execução recomendada.",
        tsLabel: "11:55:42",
        relatedArtifactId: "a-cor-1021",
        relatedPhase: "correction",
        relatedRunId: "run-1021",
        kind: "warning",
      },
    ],
  },
  "run-1020": {
    runId: "run-1020",
    isSynthetic: true,
    consoleLines: [
      "[10:22:20] execution: falha transitória",
      "[10:22:45] retry: agendado",
    ],
    integrity: {
      state: "failed",
      validatedAtLabel: "10:22:30",
      validationSource: "execution-telemetry",
      continuity: "fail",
      crossValidation: "pass",
      summary: "Falha na validação de continuidade após erro de executor.",
      warningsCount: 2,
      inconsistenciesCount: 1,
    },
    artifacts: [
      art({
        id: "a-exec-1020",
        runId: "run-1020",
        displayName: "executor-failure.json",
        virtualPath: "execution/",
        sizeLabel: "1 KB",
        status: "ready",
        source: "runtime",
        content: JSON.stringify(
          { errorClass: "TransientExecutor", retryable: true },
          null,
          2,
        ),
        relatedPhase: "execution",
        correlationKey: "retry",
      }),
    ],
    diagnostics: [
      {
        id: "d-ex",
        severity: "error",
        code: "EXEC-FAIL",
        message: "Executor reportou falha transitória (mock).",
        tsLabel: "10:22:25",
        relatedArtifactId: "a-exec-1020",
        relatedPhase: "execution",
        relatedRunId: "run-1020",
        kind: "error",
      },
    ],
  },
  "run-1019": {
    runId: "run-1019",
    isSynthetic: true,
    consoleLines: [
      "[09:01:10] integrity: rebuild iniciado",
      "[09:01:45] integrity: relatório emitido",
    ],
    integrity: {
      state: "ok",
      validatedAtLabel: "09:01:44",
      validationSource: "integrity-rebuild",
      continuity: "pass",
      crossValidation: "pass",
      summary: "Rebuild de integridade concluído após recuperação.",
      warningsCount: 0,
      inconsistenciesCount: 0,
    },
    artifacts: [
      art({
        id: "a-int-1019",
        runId: "run-1019",
        displayName: "integrity-rebuild-report.json",
        virtualPath: "integrity/",
        sizeLabel: "6 KB",
        status: "ready",
        source: "bundle",
        content: JSON.stringify(
          { rebuilt: true, segments: 4, ok: true },
          null,
          2,
        ),
        relatedPhase: "integrity",
        correlationKey: "integrity-rebuild",
      }),
    ],
    diagnostics: [
      {
        id: "d-intok",
        severity: "integrity",
        code: "INT-REBUILD-OK",
        message: "Integridade reconstruída com sucesso.",
        tsLabel: "09:01:46",
        relatedArtifactId: "a-int-1019",
        relatedPhase: "integrity",
        relatedRunId: "run-1019",
        kind: "integrity",
      },
    ],
  },
  "run-1018": {
    runId: "run-1018",
    isSynthetic: true,
    consoleLines: [
      "[09:12:50] review: dependência externa bloqueada",
    ],
    integrity: {
      state: "degraded",
      validatedAtLabel: "09:12:48",
      validationSource: "policy-bridge",
      continuity: "warn",
      crossValidation: "warn",
      summary: "Bloqueio operacional; integridade de dados preservada.",
      warningsCount: 2,
      inconsistenciesCount: 0,
    },
    artifacts: [
      art({
        id: "a-rb-1018",
        runId: "run-1018",
        displayName: "rollback-snapshot.json",
        virtualPath: "rollback/",
        sizeLabel: "9 KB",
        status: "stale",
        source: "synthesized",
        content: JSON.stringify(
          { snapshotId: "snap-mock-1018", reason: "blocked_dependency" },
          null,
          2,
        ),
        relatedPhase: "review",
        correlationKey: "rollback",
      }),
    ],
    diagnostics: [
      {
        id: "d-blk",
        severity: "warn",
        code: "BLK-DEP",
        message: "Dependência externa indisponível — review bloqueado.",
        tsLabel: "09:12:51",
        relatedArtifactId: "a-rb-1018",
        relatedPhase: "review",
        relatedRunId: "run-1018",
        kind: "runtime",
      },
    ],
  },
};

const EMPTY: RunEvidenceBundle = {
  runId: "—",
  isSynthetic: true,
  consoleLines: ["(sem linhas de consola para esta corrida)"],
  integrity: null,
  artifacts: [],
  diagnostics: [],
};

export function getRunEvidenceBundle(runId: string | null): RunEvidenceBundle {
  if (!runId) return { ...EMPTY, runId: "—" };
  return bundles[runId] ?? { ...EMPTY, runId };
}

export function hasPresetRunEvidence(runId: string | null): boolean {
  return Boolean(runId && Object.prototype.hasOwnProperty.call(bundles, runId));
}
