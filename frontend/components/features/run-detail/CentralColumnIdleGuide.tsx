"use client";

import { useI18n } from "@/lib/i18n/use-i18n";

export function CentralColumnIdleGuide() {
  const { t } = useI18n();

  const steps = [
    t("runShell.centralEmptyStep1"),
    t("runShell.centralEmptyStep2"),
    t("runShell.centralEmptyStep3"),
  ] as const;

  const capabilities = [
    t("runShell.centralEmptyCap1"),
    t("runShell.centralEmptyCap2"),
    t("runShell.centralEmptyCap3"),
    t("runShell.centralEmptyCap4"),
    t("runShell.centralEmptyCap5"),
  ] as const;

  return (
    <div className="flex min-h-[min(48vh,420px)] flex-col justify-center px-6 py-16 md:px-10">
      <article className="max-w-lg space-y-6 text-left">
        <header className="space-y-2">
          <h2 className="cs-text-subtitle">
            {t("runShell.centralEmptyWelcome")}
          </h2>
          <p className="cs-text-body cs-fg-muted text-[13px] leading-relaxed">
            {t("runShell.centralEmptyIntro")}
          </p>
        </header>

        <section className="space-y-2">
          <h3 className="cs-text-subtitle text-[13px]">
            {t("runShell.centralEmptyHowToStart")}
          </h3>
          <ol className="m-0 list-decimal space-y-1.5 pl-5">
            {steps.map((step) => (
              <li
                key={step}
                className="cs-text-body cs-fg-muted text-[13px] leading-relaxed"
              >
                {step}
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-2">
          <h3 className="cs-text-subtitle text-[13px]">
            {t("runShell.centralEmptyCapabilities")}
          </h3>
          <ul className="m-0 list-disc space-y-1.5 pl-5">
            {capabilities.map((item) => (
              <li
                key={item}
                className="cs-text-body cs-fg-muted text-[13px] leading-relaxed"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-1.5 border-t border-[var(--cs-border)] pt-4">
          <h3 className="cs-text-caption cs-fg-muted font-medium uppercase tracking-wide">
            {t("runShell.centralEmptyTipTitle")}
          </h3>
          <p className="cs-text-body cs-fg-muted text-[13px] leading-relaxed">
            {t("runShell.centralEmptyTip")}
          </p>
        </section>
      </article>
    </div>
  );
}
