"use client";

import { AppChrome } from "@/components/regions/AppChrome";
import { StaleShellSelectionBanner } from "@/components/features/shell/StaleShellSelectionBanner";
import { ConnectionsScreen } from "@/components/features/connections/ConnectionsScreen";
import { RunViewShell } from "@/components/features/run-detail/RunViewShell";
import { WorkspaceRunViewShell } from "@/components/features/workspace/WorkspaceRunViewShell";
import { ProjectActivitySidebar } from "@/components/regions/ProjectActivitySidebar";
import { RightTimelinePanel } from "@/components/features/execution-timeline/RightTimelinePanel";
import { BottomPanelResizeHandle } from "@/components/regions/BottomPanelResizeHandle";
import { BottomRuntimePanel } from "@/components/regions/BottomRuntimePanel";
import { ContextPanel } from "@/components/regions/ContextPanel";
import { useMissionLayoutStore } from "@/stores/mission-layout-store";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { resolveCentralShellView } from "@/lib/runtime/shell/central-shell-view";

export function AppShell() {
  const bottomH = useMissionShellStore((s) => s.bottomPanelHeightPx);
  const rightOpen = useMissionLayoutStore((s) => s.rightTimelineOpen);
  const mainWorkspaceView = useMissionShellStore((s) => s.mainWorkspaceView);
  const selectedRunId = useMissionShellStore((s) => s.selectedRunId);
  const selectedWorkspaceRunId = useMissionShellStore((s) => s.selectedWorkspaceRunId);
  const selectedWorkspaceId = useMissionShellStore((s) => s.selectedWorkspaceId);

  const centralView = resolveCentralShellView({
    selectedRunId,
    selectedWorkspaceRunId,
    selectedWorkspaceId,
  });
  const showWorkspaceCentral = centralView === "workspace-run";

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-background text-foreground">
      <AppChrome />
      <StaleShellSelectionBanner />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ProjectActivitySidebar />
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-workspace">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {mainWorkspaceView === "mission" ? (
              <>
                {showWorkspaceCentral ? (
                  <WorkspaceRunViewShell />
                ) : (
                  <RunViewShell />
                )}
                {rightOpen && !showWorkspaceCentral ? (
                  <RightTimelinePanel />
                ) : null}
              </>
            ) : (
              <ConnectionsScreen />
            )}
          </div>
        </div>
      </div>

      <div className="hidden" aria-hidden>
        <ContextPanel />
        <BottomPanelResizeHandle />
        <BottomRuntimePanel heightPx={bottomH} />
      </div>
    </div>
  );
}
