"use client";

import { Button } from "@/components/ui/button";
import { useStrategyStageGeneration } from "@/hooks/use-strategy-stage-generation";
import { Loader2 } from "lucide-react";

type Props = {
  runKey: string | null;
  enabled: boolean;
  label: string;
};

export function StrategyKickoffTimelineAction({
  runKey,
  enabled,
  label,
}: Props) {
  const gen = useStrategyStageGeneration({ runKey, enabled });

  const busyAction =
    gen.generateStrategy.isPending ||
    (gen.generateStrategy.isSuccess && gen.strategyProbe.isFetching);

  const blocking = !gen.runtimeReachable || busyAction;

  return (
    <div className="space-y-1.5 pt-1">
      <Button
        type="button"
        size="sm"
        className="cs-text-caption h-8 px-3 font-semibold"
        disabled={blocking || !runKey}
        data-runtime-focus="strategy-primary"
        onClick={() => gen.generateStrategy.mutate()}
      >
        {busyAction ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : null}
        {label}
      </Button>
      {gen.generateStrategy.isError ? (
        <p className="cs-text-caption text-sb-failed">
          {gen.generateStrategy.error instanceof Error
            ? gen.generateStrategy.error.message
            : "Falha ao iniciar estratégia no runtime."}
        </p>
      ) : null}
    </div>
  );
}
