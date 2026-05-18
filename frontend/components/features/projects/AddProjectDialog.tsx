"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRegisterGitProject } from "@/hooks/use-register-git-project";
import { useRegisterLocalProject } from "@/hooks/use-register-local-project";
import {
  pickLocalProjectDirectory,
  type LocalProjectPickResult,
} from "@/lib/projects/pick-local-project-directory";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import {
  CheckCircle2,
  ChevronDown,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Loader2,
} from "lucide-react";

const MANUAL_PLACEHOLDER =
  "C:\\Users\\pierr\\Documents\\automacao\\setup-boss";

const EXAMPLE_REPO = "git@bitbucket.org:org/repo.git";

function formatGitRegisterUserMessage(raw: unknown): string {
  const fallback =
    "Não foi possível clonar ou registar o repositório. Verifique o URL e a autenticação.";
  if (raw instanceof Error) {
    const m = raw.message.trim();
    if (!m) return fallback;
    if (m === "repo_url_vazio") return "Indique o URL do repositório Git.";
    if (
      m === "git_auth_failed" ||
      m.includes("autenticar no repositório") ||
      m.toLowerCase().includes("permission denied (publickey)")
    ) {
      return "Não foi possível autenticar no repositório. Verifique acesso HTTPS/token ou chave SSH configurada.";
    }
    return m;
  }
  return fallback;
}

export function AddProjectDialog({
  open,
  onOpenChange,
  onRegistered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegistered?: () => void;
}) {
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [gitStatus, setGitStatus] = useState<string | null>(null);
  const [gitError, setGitError] = useState<string | null>(null);

  const [manualPath, setManualPath] = useState("");
  const [localPick, setLocalPick] = useState<LocalProjectPickResult | null>(
    null,
  );
  const [manualError, setManualError] = useState<string | null>(null);
  const [pickerBusy, setPickerBusy] = useState(false);

  const gitMut = useRegisterGitProject();
  const regLocal = useRegisterLocalProject();

  useEffect(() => {
    if (!open) {
      setRepoUrl("");
      setBranch("");
      setGitStatus(null);
      setGitError(null);
      setManualPath("");
      setLocalPick(null);
      setManualError(null);
      setPickerBusy(false);
    }
  }, [open]);

  if (!open) return null;

  const onGitSubmit = () => {
    const trimmedUrl = repoUrl.trim();
    setGitError(null);
    setGitStatus("Clonando repositório…");
    gitMut.mutate(
      { repoUrl: trimmedUrl, branch: branch?.trim() || undefined },
      {
        onSuccess: (res) => {
          const pid = res?.data?.projectId;
          if (pid) {
            useMissionShellStore.getState().setSelectedProject(pid);
          }
          onOpenChange(false);
          onRegistered?.();
        },
        onError: (e) => {
          setGitStatus(null);
          setGitError(formatGitRegisterUserMessage(e));
        },
      },
    );
  };

  const effectiveManualPath =
    localPick?.kind === "ok"
      ? localPick.path.trim()
      : manualPath.trim();
  const canRegisterLocal = effectiveManualPath.length > 0;

  const onLocalSubmit = () => {
    setManualError(null);
    regLocal.mutate(effectiveManualPath, {
      onSuccess: () => {
        setManualPath("");
        setLocalPick(null);
        onOpenChange(false);
        onRegistered?.();
      },
      onError: (e) => {
        setManualError(
          e instanceof Error
            ? e.message
            : "Não foi possível registar o projecto.",
        );
      },
    });
  };

  const onSelectFolderClick = async () => {
    setPickerBusy(true);
    setManualError(null);
    try {
      const next = await pickLocalProjectDirectory();
      if (next.kind === "aborted") return;
      setLocalPick(next);
      if (next.kind === "need_manual" || next.kind === "unsupported") {
        setManualPath("");
      }
    } finally {
      setPickerBusy(false);
    }
  };

  const showManualFields =
    localPick == null ||
    localPick.kind === "need_manual" ||
    localPick.kind === "unsupported";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal
      aria-labelledby="add-project-title"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border/70 bg-card p-4 shadow-xl">
        <h2
          id="add-project-title"
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <FolderPlus className="size-4" aria-hidden />
          Adicionar repositório Git
        </h2>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          O daemon clona ou actualiza o código sob{" "}
          <code className="font-mono text-[10px]">SETUP_BOSS_PROJECTS_DIR</code>{" "}
          e regista com{" "}
          <code className="font-mono text-[10px]">
            POST /projects/git/register
          </code>
          . Suporta{" "}
          <span className="font-medium text-foreground/90">https</span> (incl.
          utilizador no URL) e{" "}
          <span className="font-medium text-foreground/90">SSH</span>{" "}
          (GitHub, GitLab, Bitbucket).
        </p>

        <div className="mt-3 space-y-2">
          <label className="block space-y-1">
            <span className="text-[10px] font-medium uppercase text-muted-foreground">
              URL do repositório
            </span>
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder={EXAMPLE_REPO}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-md border border-border/70 bg-background/50 px-2 py-1.5 font-mono text-[11px]"
            />
          </label>
          <label className="block space-y-1">
            <span className="flex items-center gap-1 text-[10px] font-medium uppercase text-muted-foreground">
              <GitBranch className="size-3" aria-hidden />
              Branch (opcional)
            </span>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              autoComplete="off"
              className="w-full rounded-md border border-border/70 bg-background/50 px-2 py-1.5 font-mono text-[11px]"
            />
          </label>
        </div>

        {gitStatus ? (
          <p className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
            {gitStatus}
          </p>
        ) : null}
        {gitError ? (
          <p className="mt-2 text-[11px] text-sb-failed">{gitError}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={
              gitMut.isPending || !repoUrl.trim() || regLocal.isPending
            }
            onClick={() => void onGitSubmit()}
          >
            {gitMut.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : null}
            Clonar / Registar
          </Button>
        </div>

        <details className="group mt-4 rounded-md border border-border/50 bg-background/20">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-2 text-[11px] font-medium text-muted-foreground marker:content-none">
            <ChevronDown className="size-3.5 shrink-0 transition group-open:rotate-180" />
            Avançado: registo manual de pasta local
          </summary>
          <div className="space-y-2 border-t border-border/40 px-2 py-3">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Para projectos que já existem no disco, indique o caminho absoluto
              ou use o seletor de pasta.{" "}
              <code className="font-mono text-[10px]">POST /projects/register</code>
              .
            </p>
            {localPick?.kind === "ok" ? (
              <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
                <div className="flex items-center gap-2 text-[11px] font-medium text-foreground">
                  <CheckCircle2
                    className="size-4 shrink-0 text-emerald-500"
                    aria-hidden
                  />
                  Pasta seleccionada
                </div>
                <p className="mt-1 text-[12px] font-medium leading-snug">
                  {localPick.displayName}
                </p>
                <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                  {localPick.path}
                </p>
              </div>
            ) : null}

            {showManualFields && localPick?.kind !== "ok" ? (
              <div className="space-y-2">
                {localPick &&
                (localPick.kind === "need_manual" ||
                  localPick.kind === "unsupported") ? (
                  <p className="text-[11px] leading-relaxed text-amber-200/90">
                    {localPick.reason}
                  </p>
                ) : null}
                <label className="block space-y-1">
                  <span className="text-[10px] font-medium uppercase text-muted-foreground">
                    Caminho do projecto
                  </span>
                  <textarea
                    value={manualPath}
                    onChange={(e) => setManualPath(e.target.value)}
                    rows={2}
                    placeholder={MANUAL_PLACEHOLDER}
                    className="w-full resize-y rounded-md border border-border/70 bg-background/50 px-2 py-1.5 font-mono text-[11px]"
                  />
                </label>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1.5"
                onClick={() => void onSelectFolderClick()}
                disabled={regLocal.isPending || pickerBusy || gitMut.isPending}
              >
                {pickerBusy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FolderOpen className="size-3.5" />
                )}
                Seleccionar pasta
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={
                  regLocal.isPending ||
                  pickerBusy ||
                  gitMut.isPending ||
                  !canRegisterLocal
                }
                onClick={() => void onLocalSubmit()}
              >
                {regLocal.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  "Registar pasta"
                )}
              </Button>
            </div>
            {manualError ? (
              <p className="text-[11px] text-sb-failed">{manualError}</p>
            ) : null}
          </div>
        </details>

        <div className="mt-4 flex justify-end border-t border-border/40 pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={gitMut.isPending || regLocal.isPending}
          >
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
