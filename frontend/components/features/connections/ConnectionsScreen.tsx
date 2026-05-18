"use client";

import { ArrowLeft, Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/primitives/Surface";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";
import { useMissionShellStore } from "@/stores/mission-shell-store";

type ConnStatus = "not_connected" | "coming_soon";
type ConnAction = "connect" | "configure";

type ServiceId =
  | "github"
  | "bitbucket"
  | "gitlab"
  | "azureDevOps"
  | "jira"
  | "linear"
  | "slack"
  | "discord";

const CONNECTION_ROWS: ReadonlyArray<{
  id: ServiceId;
  group: "repos" | "productivity" | "comms";
  status: ConnStatus;
  action: ConnAction;
}> = [
  { id: "github", group: "repos", status: "not_connected", action: "connect" },
  {
    id: "bitbucket",
    group: "repos",
    status: "not_connected",
    action: "connect",
  },
  { id: "gitlab", group: "repos", status: "coming_soon", action: "configure" },
  {
    id: "azureDevOps",
    group: "repos",
    status: "coming_soon",
    action: "configure",
  },
  {
    id: "jira",
    group: "productivity",
    status: "coming_soon",
    action: "configure",
  },
  {
    id: "linear",
    group: "productivity",
    status: "not_connected",
    action: "connect",
  },
  { id: "slack", group: "comms", status: "coming_soon", action: "configure" },
  { id: "discord", group: "comms", status: "coming_soon", action: "configure" },
];

export function ConnectionsScreen() {
  const { t } = useI18n();
  const setMainWorkspaceView = useMissionShellStore(
    (s) => s.setMainWorkspaceView,
  );

  const groups: ReadonlyArray<{
    key: "repos" | "productivity" | "comms";
    rows: typeof CONNECTION_ROWS;
  }> = [
    {
      key: "repos",
      rows: CONNECTION_ROWS.filter((r) => r.group === "repos"),
    },
    {
      key: "productivity",
      rows: CONNECTION_ROWS.filter((r) => r.group === "productivity"),
    },
    {
      key: "comms",
      rows: CONNECTION_ROWS.filter((r) => r.group === "comms"),
    },
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border/60 bg-card/40 px-4 py-3 backdrop-blur-sm dark:bg-card/25">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2 sm:items-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => setMainWorkspaceView("mission")}
            >
              <ArrowLeft className="size-4" aria-hidden />
              {t("connections.back")}
            </Button>
            <div className="hidden h-6 w-px shrink-0 bg-border/80 sm:block" />
            <div className="min-w-0 sm:pl-0">
              <div className="flex items-center gap-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--v-theme-primary))]/25 bg-[rgb(var(--v-theme-primary))]/10 text-[rgb(var(--v-theme-primary))]">
                  <Plug className="size-4" aria-hidden />
                </div>
                <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
                  {t("connections.title")}
                </h1>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {t("connections.subtitle")}
          </p>

          <Surface
            variant="strip"
            className="border-[rgb(var(--v-theme-primary))]/20 bg-[rgb(var(--v-theme-primary))]/[0.06] px-4 py-3 dark:bg-[rgb(var(--v-theme-primary))]/10"
          >
            <p className="text-[13px] leading-snug text-foreground/90">
              {t("connections.disclaimer")}
            </p>
          </Surface>

          {groups.map(({ key, rows }) => (
            <section key={key} className="space-y-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t(`connections.groups.${key}`)}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {rows.map((row) => (
                  <Surface
                    key={row.id}
                    className="group flex flex-col gap-3 p-4 transition-shadow hover:border-[rgb(var(--v-theme-primary))]/25 hover:shadow-[0_8px_28px_-16px_color-mix(in_oklch,rgb(var(--v-theme-primary))_28%,transparent)] dark:hover:shadow-[0_10px_32px_-14px_rgba(0,0,0,0.5)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <h3 className="text-sm font-semibold text-foreground">
                          {t(`connections.svc.${row.id}.name`)}
                        </h3>
                        <p className="text-[12px] leading-snug text-muted-foreground">
                          {t(`connections.svc.${row.id}.desc`)}
                        </p>
                      </div>
                      <Badge
                        variant={
                          row.status === "coming_soon"
                            ? "secondary"
                            : "outline"
                        }
                        className={cn(
                          "shrink-0 text-[10px]",
                          row.status === "not_connected" &&
                            "border-amber-500/35 text-amber-900 dark:text-amber-100/90",
                        )}
                      >
                        {row.status === "coming_soon"
                          ? t("connections.status.comingSoon")
                          : t("connections.status.notConnected")}
                      </Badge>
                    </div>
                    <div className="mt-auto flex justify-end pt-1">
                      {row.action === "connect" ? (
                        <Button
                          type="button"
                          size="sm"
                          className="bg-[#004d56] text-white hover:bg-[#004d56]/90"
                          onClick={() => {}}
                        >
                          {t("connections.action.connect")}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-[rgb(var(--v-theme-primary))]/30 hover:bg-[rgb(var(--v-theme-primary))]/8"
                          onClick={() => {}}
                        >
                          {t("connections.action.configure")}
                        </Button>
                      )}
                    </div>
                  </Surface>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
