"use client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import type { RunOperationalUxContract } from "@/lib/runtime/operational/operational-ux-types";
import { cn } from "@/lib/utils";

function iaFolderMilestonePassed(c: RunOperationalUxContract): boolean {
  if (c.iaValidated === false) return false;
  if (c.iaValidated === true) return true;
  return c.contextLoaded || c.initialSpecReady || !c.isInitializationPhase;
}

const MILESTONES = [
  {
    id: "ia_folder",
    label: "Carregando conteúdo da pasta .IA",
    isPassed: iaFolderMilestonePassed,
    isActive: (c: RunOperationalUxContract) =>
      c.isInitializationPhase &&
      c.iaValidated === null &&
      !c.contextLoaded &&
      !c.initialSpecReady,
  },
  {
    id: "project_context",
    label: "Carregando contexto do projeto",
    isPassed: (c: RunOperationalUxContract) => c.contextLoaded,
    isActive: (c: RunOperationalUxContract) =>
      c.iaValidated === true && !c.contextLoaded,
  },
  {
    id: "initial_spec",
    label: "Gerando SPEC inicial",
    isPassed: (c: RunOperationalUxContract) => c.initialSpecReady,
    isActive: (c: RunOperationalUxContract) =>
      c.iaValidated === true && c.contextLoaded && !c.initialSpecReady,
  },
] as const;

function StepIcon({ active, passed }: { active: boolean; passed: boolean }) {
  if (active) {
    return <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />;
  }
  if (passed) {
    return (
      <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
    );
  }
  return <Circle className="size-3.5 shrink-0 text-muted-foreground/50" />;
}

export function InitializationSetupMilestones({
  operationalUx,
}: {
  operationalUx: RunOperationalUxContract;
}) {
  return (
    <ol className="flex flex-col gap-1 border-l border-border/60 pl-3">
      {MILESTONES.map((step) => {
        const passed = step.isPassed(operationalUx);
        const active = !passed && step.isActive(operationalUx);
        return (
          <li
            key={step.id}
            className={cn(
              "flex items-center gap-2 text-[11px] font-mono",
              active ? "font-medium text-foreground" : "text-muted-foreground",
              passed && !active && "text-foreground/75",
            )}
          >
            <StepIcon active={active} passed={passed} />
            <span>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
