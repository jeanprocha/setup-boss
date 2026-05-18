"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/primitives/Surface";
import type {
  ApprovalStateDto,
  ClarificationAvailability,
} from "@/lib/runtime/clarification/clarification-types";
import { Check, RotateCcw, X } from "lucide-react";

export function ApprovalFlow({
  approval,
  availability,
  onApprove,
  onReject,
  onRequestRefinement,
  isPending,
}: {
  approval: ApprovalStateDto;
  availability: ClarificationAvailability;
  onApprove: () => void;
  onReject: () => void;
  onRequestRefinement: () => void;
  isPending: boolean;
}) {
  const [confirm, setConfirm] = useState<
    null | "approve" | "reject" | "refine"
  >(null);

  const statusLabel =
    approval.status === "approved"
      ? "Aprovado — próximo: strategy"
      : approval.status === "rejected"
        ? "Rejeitado"
        : approval.status === "pending"
          ? "Decisão pendente"
          : "Sem decisão";

  return (
    <Surface className="space-y-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">
          Você aprova este plano para execução?
        </p>
        <span className="rounded-md border border-border/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {statusLabel}
        </span>
      </div>
      {approval.notes ? (
        <p className="text-[11px] text-muted-foreground">{approval.notes}</p>
      ) : null}
      {approval.decidedAt ? (
        <p className="font-mono text-[10px] text-muted-foreground">
          {approval.decidedAt}
        </p>
      ) : null}

      {confirm ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-cyan-500/30 bg-cyan-500/5 px-2 py-1.5 text-[11px]">
          <span>Confirmar {confirm}?</span>
          <Button
            type="button"
            size="sm"
            className="h-6 px-2 text-[10px]"
            disabled={isPending}
            onClick={() => {
              if (confirm === "approve") onApprove();
              if (confirm === "reject") onReject();
              if (confirm === "refine") onRequestRefinement();
              setConfirm(null);
            }}
          >
            Sim
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            disabled={isPending}
            onClick={() => setConfirm(null)}
          >
            Voltar
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1 text-[10px]"
            disabled={!availability.canApprove || isPending}
            data-runtime-focus="refined-plan-approval"
            onClick={() => setConfirm("approve")}
          >
            <Check className="size-3.5" />
            Aprovar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-[10px]"
            disabled={!availability.canReject || isPending}
            onClick={() => setConfirm("reject")}
          >
            <X className="size-3.5" />
            Rejeitar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 gap-1 text-[10px]"
            disabled={!availability.canRequestRefinement || isPending}
            onClick={() => setConfirm("refine")}
          >
            <RotateCcw className="size-3.5" />
            Pedir refinamento
          </Button>
        </div>
      )}
    </Surface>
  );
}
