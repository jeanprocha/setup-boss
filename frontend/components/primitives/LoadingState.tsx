import { cn } from "@/lib/utils";

export function LoadingState({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-2 p-3", className)} aria-busy>
      <div className="h-2 w-2/3 animate-pulse rounded bg-muted" />
      <div className="h-2 w-full animate-pulse rounded bg-muted/80" />
      <div className="h-2 w-5/6 animate-pulse rounded bg-muted/60" />
    </div>
  );
}
