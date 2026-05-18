import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";
import type { ExecutionBundleDto } from "../execution/execution-types.ts";
import type { RunSummaryDto } from "../../api/runtime-types.ts";
import type { RunEvidenceBundle } from "../evidence-types.ts";
import type { OperationalReviewHitlDto } from "./operational-review-types.ts";
import type {
  OperationalFinalizationChecklistRow,
  OperationalFinalizationSummary,
} from "./operational-finalization-types.ts";
import { buildOperationalReviewDocument } from "./build-operational-review-document.ts";
import { isExecutionOperationallyComplete } from "./review-operational-state.ts";
import { isVersioningOperationallyComplete } from "./execution-operational-state.ts";

const HUMAN_NEXT_STEPS =
  "O Setup Boss pode publicar a branch no remoto com a sua confirmação. Abertura de PR, merge e deploy continuam consigo — não são automatizados.";

function row(
  id: string,
  label: string,
  state: OperationalFinalizationChecklistRow["state"],
  stateLabelPt: string,
  detail: string | null,
): OperationalFinalizationChecklistRow {
  return { id, label, state, stateLabelPt, detail };
}

function planApprovedRow(
  bundle: ClarificationBundleDto | null | undefined,
): OperationalFinalizationChecklistRow {
  const st = bundle?.approval.status ?? "none";
  if (st === "approved") {
    return row(
      "plan-approved",
      "Plano aprovado",
      "done",
      "Confirmado",
      bundle?.approval.decidedAt
        ? `Aprovado em ${bundle.approval.decidedAt}`
        : null,
    );
  }
  if (st === "pending") {
    return row(
      "plan-approved",
      "Plano aprovado",
      "partial",
      "Pendente",
      "Aguarda confirmação explícita do plano.",
    );
  }
  return row(
    "plan-approved",
    "Plano aprovado",
    "attention",
    "A verificar",
    st === "rejected" ? "Plano rejeitado anteriormente." : null,
  );
}

function branchPreparedRow(
  summary: RunSummaryDto | null | undefined,
): OperationalFinalizationChecklistRow {
  const git = summary?.git;
  const branch =
    git?.activityBranch?.trim() ||
    summary?.branchHint?.trim() ||
    null;
  const gitStatus = String(git?.status ?? "");

  if (gitStatus === "git_branch_ready" && branch) {
    return row("branch", "Branch preparada", "done", "Pronta", branch);
  }
  if (gitStatus === "git_branch_pending") {
    return row(
      "branch",
      "Branch preparada",
      "partial",
      "Em preparação",
      branch ?? "A preparar workspace Git.",
    );
  }
  if (branch) {
    return row("branch", "Branch preparada", "done", "Pronta", branch);
  }
  if (summary && isVersioningOperationallyComplete(summary)) {
    return row(
      "branch",
      "Branch preparada",
      "done",
      "Pronta",
      "Versionamento concluído; nome da branch não exposto na corrida.",
    );
  }
  return row(
    "branch",
    "Branch preparada",
    "attention",
    "A verificar",
    git?.errorMessage ?? "Estado Git indisponível na corrida.",
  );
}

function branchPublishedRow(
  summary: RunSummaryDto | null | undefined,
): OperationalFinalizationChecklistRow {
  const git = summary?.git;
  const branch =
    git?.pushBranch?.trim() ||
    git?.activityBranch?.trim() ||
    summary?.branchHint?.trim() ||
    null;
  const pushStatus = String(git?.pushStatus ?? "");
  if (pushStatus === "pushed" && branch) {
    const remote = git?.pushRemote?.trim() || "origin";
    return row(
      "branch-published",
      "Branch publicada",
      "done",
      "No remoto",
      `${remote}/${branch}`,
    );
  }
  if (pushStatus === "failed") {
    return row(
      "branch-published",
      "Branch publicada",
      "attention",
      "Falhou",
      git?.pushErrorMessage ?? "Push não concluído.",
    );
  }
  return row(
    "branch-published",
    "Branch publicada",
    "partial",
    "Pendente",
    branch
      ? `Use «Publicar branch» para enviar ${branch} ao remoto.`
      : "Confirme a publicação quando estiver pronto.",
  );
}

function executionCompletedRow(
  execution: ExecutionBundleDto | null | undefined,
  summary: RunSummaryDto | null | undefined,
  lifecyclePhase: string | null | undefined,
): OperationalFinalizationChecklistRow {
  const complete = isExecutionOperationallyComplete(
    lifecyclePhase as Parameters<typeof isExecutionOperationallyComplete>[0],
    summary,
  );
  if (complete) {
    const p = execution?.summary.progress;
    const detail =
      p && p.total > 0 && p.completed > 0
        ? `${p.completed}/${p.total} etapas concluídas`
        : "Execução concluída.";
    return row("execution", "Execução concluída", "done", "Concluída", detail);
  }
  const phase = lifecyclePhase ?? execution?.summary.lifecycle.phase ?? null;
  return row(
    "execution",
    "Execução concluída",
    "partial",
    "Em curso",
    phase ? `Fase atual: ${phase}` : null,
  );
}

function reviewConfirmedRow(
  reviewHitl: OperationalReviewHitlDto | null | undefined,
  reviewConfirmedAt: string | null | undefined,
): OperationalFinalizationChecklistRow {
  if (reviewHitl?.status === "confirmed") {
    return row(
      "review",
      "Review confirmado",
      "done",
      "Confirmado",
      reviewConfirmedAt ?? reviewHitl.confirmedAt ?? null,
    );
  }
  return row(
    "review",
    "Review confirmado",
    "attention",
    "Pendente",
    "Confirme o review antes de finalizar.",
  );
}

export function buildOperationalFinalizationSummary(input: {
  clarification: ClarificationBundleDto | null | undefined;
  execution: ExecutionBundleDto | null | undefined;
  evidence: RunEvidenceBundle | null | undefined;
  summary: RunSummaryDto | null | undefined;
  reviewHitl: OperationalReviewHitlDto | null | undefined;
  reviewConfirmedAt?: string | null;
  activityLabel?: string | null;
  executionLifecyclePhase?: string | null;
}): OperationalFinalizationSummary {
  const {
    clarification,
    execution,
    evidence,
    summary,
    reviewHitl,
    reviewConfirmedAt,
    activityLabel,
    executionLifecyclePhase,
  } = input;

  const reviewDoc = buildOperationalReviewDocument({
    clarification,
    execution,
    evidence,
    activityLabel,
  });

  const checklist: OperationalFinalizationChecklistRow[] = [
    planApprovedRow(clarification),
    branchPreparedRow(summary),
    branchPublishedRow(summary),
    executionCompletedRow(execution, summary, executionLifecyclePhase),
    reviewConfirmedRow(reviewHitl, reviewConfirmedAt),
  ];

  const knownPending = [...reviewDoc.risksAndPending];

  if (knownPending.length > 0) {
    checklist.push(
      row(
        "pending",
        "Pendências conhecidas",
        "attention",
        `${knownPending.length} item(ns)`,
        knownPending.slice(0, 3).join(" · "),
      ),
    );
  } else {
    checklist.push(
      row("pending", "Pendências conhecidas", "done", "Nenhuma", null),
    );
  }

  return {
    activityLabel: activityLabel?.trim() || null,
    checklist,
    knownPending,
    changedFiles: reviewDoc.changedFiles,
    humanNextStepsNote: HUMAN_NEXT_STEPS,
    hasContent: checklist.length > 0 || reviewDoc.hasContent,
  };
}
