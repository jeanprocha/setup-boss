"use client";

import { useMemo } from "react";
import { Loader2, FileText } from "lucide-react";
import { useRunEvidence } from "@/hooks/use-run-evidence";
import { useArtifactContent } from "@/hooks/use-artifact-content";
import { cn } from "@/lib/utils";

const INITIAL_SPEC_NAMES = [
  "task-plan-initial.md",
  "task_plan_initial.md",
];

function findInitialSpecArtifact(
  artifacts: { id: string; displayName: string; virtualPath: string }[],
) {
  return (
    artifacts.find((a) =>
      INITIAL_SPEC_NAMES.some(
        (n) =>
          a.displayName.toLowerCase() === n ||
          a.virtualPath.toLowerCase().endsWith(n),
      ),
    ) ?? null
  );
}

export function InitialSpecBlock({
  projectId,
  runId,
  className,
}: {
  projectId: string | null;
  runId: string | null;
  className?: string;
}) {
  const evidence = useRunEvidence(projectId, runId);
  const artifact = useMemo(
    () => findInitialSpecArtifact(evidence.bundle.artifacts),
    [evidence.bundle.artifacts],
  );

  const contentQ = useArtifactContent({
    evidenceKey: evidence.evidenceKey,
    artifact,
    evidenceSource: evidence.evidenceSource,
  });

  const loading = evidence.isLoading || contentQ.loading;
  const body = contentQ.content.trim();

  return (
    <section
      className={cn(
        "rounded-lg border border-emerald-600/30 bg-emerald-500/8 px-3 py-2.5",
        className,
      )}
      aria-label="SPEC inicial"
    >
      <header className="mb-2 flex items-center gap-2">
        <FileText className="size-4 text-emerald-700 dark:text-emerald-300" />
        <h3 className="text-sm font-semibold text-foreground">SPEC inicial</h3>
      </header>

      {loading ? (
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          A carregar SPEC inicial…
        </p>
      ) : !artifact ? (
        <p className="text-[11px] text-muted-foreground">
          SPEC inicial registada no fluxo. O ficheiro{" "}
          <span className="font-mono">task-plan-initial.md</span> ainda não está
          disponível na evidência desta corrida.
        </p>
      ) : contentQ.unsupported ? (
        <p className="text-[11px] text-muted-foreground">
          SPEC disponível como{" "}
          <span className="font-mono">{artifact.displayName}</span> — pré-visualização
          não suportada neste formato.
        </p>
      ) : body ? (
        <pre className="max-h-[min(420px,50vh)] overflow-auto whitespace-pre-wrap rounded-md border border-border/50 bg-background/80 p-2.5 font-mono text-[11px] leading-relaxed text-foreground">
          {body}
        </pre>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Artefacto encontrado; conteúdo vazio ou indisponível.
        </p>
      )}
    </section>
  );
}
