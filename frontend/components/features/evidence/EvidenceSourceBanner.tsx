"use client";

import type { EvidenceSource } from "@/hooks/use-run-evidence";
import { useI18n } from "@/lib/i18n/use-i18n";

export function EvidenceSourceBanner({
  loading,
  truncatedListing,
}: {
  source: EvidenceSource;
  loading: boolean;
  empty: boolean;
  /** Listagem de ficheiros cortada pelo limite do daemon */
  truncatedListing?: boolean;
}) {
  const { t } = useI18n();

  if (loading) {
    return (
      <p className="shrink-0 border-b border-border/60 bg-background/40 px-3 py-1 text-[10px] text-muted-foreground">
        {t("artifacts.loadingEvidence")}
      </p>
    );
  }

  if (!truncatedListing) return null;

  return (
    <p className="shrink-0 border-b border-amber-500/20 bg-amber-500/5 px-3 py-0.5 text-[9px] text-amber-100/90">
      {t("artifacts.listingTruncated")}
    </p>
  );
}
