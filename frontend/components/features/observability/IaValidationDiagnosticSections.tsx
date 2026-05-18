"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  iaCheckStatusLabel,
  iaSectionVisible,
  type IaValidationPayload,
} from "@/lib/runtime/intake/ia-validation";
import { cn } from "@/lib/utils";

function PolicyContentBlock({ policy }: { policy: Record<string, unknown> }) {
  const secretScan =
    policy.secretScan && typeof policy.secretScan === "object"
      ? (policy.secretScan as Record<string, unknown>)
      : null;
  const languageScan =
    policy.languageScan && typeof policy.languageScan === "object"
      ? (policy.languageScan as Record<string, unknown>)
      : null;

  const matchedFiles = Array.isArray(policy.matchedFiles)
    ? policy.matchedFiles.map(String)
    : Array.isArray(secretScan?.matchedFiles)
      ? secretScan!.matchedFiles!.map(String)
      : [];
  const ruleIds = Array.isArray(policy.ruleIds)
    ? policy.ruleIds.map(String)
    : Array.isArray(secretScan?.ruleIds)
      ? secretScan!.ruleIds!.map(String)
      : [];
  const redactedSamples = Array.isArray(policy.redactedSamples)
    ? policy.redactedSamples.map(String)
    : Array.isArray(secretScan?.redactedSamples)
      ? secretScan!.redactedSamples!.map(String)
      : [];

  const suspectedFiles = Array.isArray(policy.suspectedFiles)
    ? policy.suspectedFiles.map(String)
    : Array.isArray(languageScan?.suspectedFiles)
      ? languageScan!.suspectedFiles!.map(String)
      : [];

  const hasSecrets = matchedFiles.length > 0 || ruleIds.length > 0;
  const hasLanguage =
    suspectedFiles.length > 0 || languageScan?.ok === false;

  if (!hasSecrets && !hasLanguage) {
    return <JsonBlock data={policy} />;
  }

  return (
    <div className="space-y-2">
      {hasSecrets ? (
        <div className="space-y-1">
          <p className="text-[8px] font-medium text-destructive/90">
            Possível dado sensível na `.IA`
          </p>
          <p className="text-[8px] text-muted-foreground">
            A Knowledge Base contém conteúdo que parece ser segredo ou credencial.
          </p>
          {matchedFiles.length ? (
            <p className="font-mono text-[8px]">
              <span className="text-muted-foreground">arquivos: </span>
              {matchedFiles.join(", ")}
            </p>
          ) : null}
          {ruleIds.length ? (
            <p className="font-mono text-[8px]">
              <span className="text-muted-foreground">ruleIds: </span>
              {ruleIds.join(", ")}
            </p>
          ) : null}
          {redactedSamples.length ? (
            <ul className="list-disc space-y-0.5 pl-4 font-mono text-[8px] text-foreground/85">
              {redactedSamples.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {hasLanguage ? (
        <div className="space-y-1">
          <p className="text-[8px] font-medium text-amber-800/90 dark:text-amber-200/90">
            Aviso de idioma da `.IA`
          </p>
          <p className="text-[8px] text-muted-foreground">
            A SPEC v1.0 espera documentação em inglês. Foram encontrados indícios de outro
            idioma.
          </p>
          {suspectedFiles.length ? (
            <p className="font-mono text-[8px]">
              <span className="text-muted-foreground">arquivos: </span>
              {suspectedFiles.join(", ")}
            </p>
          ) : null}
          {policy.confidence != null ? (
            <p className="font-mono text-[8px]">
              <span className="text-muted-foreground">confidence: </span>
              {String(policy.confidence)}
            </p>
          ) : null}
          {policy.sampleReason ? (
            <p className="font-mono text-[8px]">
              <span className="text-muted-foreground">motivo: </span>
              {String(policy.sampleReason)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function JsonBlock({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([k]) => k !== "ok");
  if (!entries.length) {
    return <p className="text-[8px] text-muted-foreground">Sem detalhes.</p>;
  }
  return (
    <ul className="space-y-0.5 font-mono text-[8px] text-foreground/85">
      {entries.map(([key, val]) => (
        <li key={key}>
          <span className="text-muted-foreground">{key}: </span>
          {Array.isArray(val)
            ? val.join(", ")
            : typeof val === "object" && val !== null
              ? JSON.stringify(val)
              : String(val)}
        </li>
      ))}
    </ul>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  surface = "default",
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  surface?: "default" | "sidebar";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={cn(
        "rounded border",
        surface === "sidebar"
          ? "border-sidebar-border/50 bg-sidebar-accent/6"
          : "border-border/40 bg-muted/10",
      )}
    >
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}
        <span className="text-[8px] font-medium text-foreground/90">{title}</span>
      </button>
      {open ? (
        <div
          className={cn(
            "border-t px-2 py-1.5",
            surface === "sidebar"
              ? "border-sidebar-border/40"
              : "border-border/30",
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function IaValidationDiagnosticSections({
  ia,
  className,
  surface = "default",
}: {
  ia: IaValidationPayload;
  className?: string;
  surface?: "default" | "sidebar";
}) {
  const checkById = Object.fromEntries(ia.checks.map((c) => [c.id, c]));

  return (
    <div className={cn("mt-2 space-y-2", className)}>
      <div className="space-y-1">
        <p className="text-[8px] font-medium text-foreground/80">Checks SPEC v{ia.specVersion}</p>
        <ul className="space-y-0.5">
          {ia.checks.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 font-mono text-[8px]"
            >
              <span className="text-foreground/85">{c.label}</span>
              <span
                className={cn(
                  "shrink-0 rounded px-1 py-0.5 text-[8px] font-semibold uppercase",
                  c.status === "ok" && "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
                  c.status === "fail" && "bg-destructive/15 text-destructive",
                  c.status === "warn" && "bg-amber-500/15 text-amber-900 dark:text-amber-100",
                  c.status === "skip" && "bg-muted text-muted-foreground",
                )}
              >
                {iaCheckStatusLabel(c.status)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {ia.errors.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[8px] font-medium text-destructive/90">Erros</p>
          <ul className="list-disc space-y-0.5 pl-4 text-[8px] text-destructive/95">
            {ia.errors.map((e) => (
              <li key={`${e.check}-${e.code}`}>
                [{e.check}] {e.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {ia.warnings.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[8px] font-medium text-amber-800/90 dark:text-amber-200/90">
            Avisos
          </p>
          <ul className="list-disc space-y-0.5 pl-4 text-[8px] text-amber-900/95 dark:text-amber-100/90">
            {ia.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-1.5">
        {iaSectionVisible(ia.git, checkById.git?.status) ? (
          <CollapsibleSection
            title="Git"
            surface={surface}
            defaultOpen={checkById.git?.status === "fail"}
          >
            <JsonBlock data={ia.git} />
          </CollapsibleSection>
        ) : null}
        {iaSectionVisible(ia.seed, checkById.seed?.status) ? (
          <CollapsibleSection
            title="Seed"
            surface={surface}
            defaultOpen={checkById.seed?.status === "fail"}
          >
            <JsonBlock data={ia.seed} />
          </CollapsibleSection>
        ) : null}
        {iaSectionVisible(ia.version, checkById.version?.status) ? (
          <CollapsibleSection
            title="Version"
            surface={surface}
            defaultOpen={checkById.version?.status === "fail"}
          >
            <JsonBlock data={ia.version} />
          </CollapsibleSection>
        ) : null}
        {iaSectionVisible(ia.structure, checkById.structure?.status) ? (
          <CollapsibleSection
            title="Structure"
            surface={surface}
            defaultOpen={checkById.structure?.status === "fail"}
          >
            <JsonBlock data={ia.structure} />
          </CollapsibleSection>
        ) : null}
        {iaSectionVisible(ia.drift, checkById.drift?.status) ? (
          <CollapsibleSection
            title="Drift"
            surface={surface}
            defaultOpen={
              checkById.drift?.status === "fail" || checkById.drift?.status === "warn"
            }
          >
            <JsonBlock data={ia.drift} />
          </CollapsibleSection>
        ) : null}
        {iaSectionVisible(ia.policy, checkById.policy?.status) ? (
          <CollapsibleSection
            title="Content Policy"
            surface={surface}
            defaultOpen={
              checkById.policy?.status === "fail" || checkById.policy?.status === "warn"
            }
          >
            <PolicyContentBlock policy={ia.policy} />
          </CollapsibleSection>
        ) : null}
      </div>
    </div>
  );
}
