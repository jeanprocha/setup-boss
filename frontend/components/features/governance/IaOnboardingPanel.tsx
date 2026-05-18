"use client";

import type { IaOnboardingUx } from "@/lib/runtime/governance/ia-governance-ux";

export function IaOnboardingPanel({ onboarding }: { onboarding: IaOnboardingUx }) {
  return (
    <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/8 px-2.5 py-2">
      <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-100">
        {onboarding.title}
      </p>
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-foreground/85">Estrutura obrigatória</p>
        <ul className="list-disc space-y-0.5 pl-4 font-mono text-[10px] text-muted-foreground">
          {onboarding.requiredStructure.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-foreground/85">Seed SPEC v1.0</p>
        <ul className="list-disc space-y-0.5 pl-4 font-mono text-[10px] text-muted-foreground">
          {onboarding.requiredSeedFiles.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Bootstrap: <span className="font-mono">{onboarding.bootstrapDoc}</span>
      </p>
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-foreground/85">Próximos passos</p>
        <ol className="list-decimal space-y-0.5 pl-4 text-[10px] text-foreground/90">
          {onboarding.nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      {onboarding.docsLinks.length ? (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {onboarding.docsLinks.map((link) => (
            <span
              key={link.path}
              className="font-mono text-[10px] text-primary/90"
              title={link.path}
            >
              {link.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
