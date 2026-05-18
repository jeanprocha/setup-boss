"use client";

import type { CreateRunResultDto } from "@/lib/runtime/intake/intake-types";
import { Card } from "@/components/ui/card";
import { IntakeStateBadge } from "@/components/features/intake/IntakeStateBadge";
import { Badge } from "@/components/ui/badge";

export function TaskSubmissionCard({ result }: { result: CreateRunResultDto }) {
  return (
    <Card className="border-sb-success/25 bg-sb-success/5 p-2.5 shadow-none">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Corrida criada
      </p>
      <p className="mt-1 truncate font-mono text-xs text-foreground">{result.runId}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <IntakeStateBadge phase={result.initialState} />
        {result.classification ? (
          <Badge variant="outline" className="font-mono text-[9px]">
            {result.classification}
          </Badge>
        ) : null}
      </div>
      {result.clarificationRequired ? (
        <p className="mt-2 text-[11px] text-amber-200/90">
          Clarificação aberta automaticamente — responda às perguntas na tab
          Clarificação.
        </p>
      ) : null}
    </Card>
  );
}
