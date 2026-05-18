/**
 * E2E browser opcional (Fase G) — requer stack local:
 *   npm run dev:stack
 *   SETUP_BOSS_E2E_USE_EXISTING_DAEMON=1 node scripts/smoke/plan-approval-comment-e2e.js  # bootstrap run id via API only
 *
 * Executar Playwright (após instalar @playwright/test na raiz):
 *   npx playwright test e2e/playwright/plan-approval-comment.spec.mjs
 *
 * Este spec valida renderização via API proxy + DOM quando a run está selecionada na UI.
 * O smoke `plan-approval-comment-e2e.js` cobre o fluxo runtime completo sem browser.
 */

import { test, expect } from "@playwright/test";

const FRONTEND_URL = process.env.SETUP_BOSS_E2E_FRONTEND_URL || "http://127.0.0.1:3000";
const RUNTIME_PORT = Number(process.env.SETUP_BOSS_RUNTIME_API_PORT || 3210);

test.describe.configure({ mode: "serial" });

test.skip(
  !process.env.SETUP_BOSS_E2E_BROWSER,
  "Defina SETUP_BOSS_E2E_BROWSER=1 e suba dev:stack para executar E2E browser",
);

test("plano operacional renderiza complexidade média quando run E2E selecionada", async ({
  page,
}) => {
  const runId = process.env.SETUP_BOSS_E2E_RUN_ID;
  test.skip(!runId, "Defina SETUP_BOSS_E2E_RUN_ID após smoke plan-approval-comment-e2e");

  await page.goto(FRONTEND_URL, { waitUntil: "networkidle" });

  await page.evaluate(
    ({ runId }) => {
      const key = "setup-boss-mission-shell";
      const raw = localStorage.getItem(key);
      const state = raw ? JSON.parse(raw) : { state: {} };
      state.state = state.state || {};
      state.state.selectedRunId = runId;
      localStorage.setItem(key, JSON.stringify(state));
    },
    { runId },
  );

  await page.reload({ waitUntil: "networkidle" });

  const plan = page.locator('[data-testid="operational-plan-document"]').first();
  await expect(plan).toBeVisible({ timeout: 30_000 });
  await expect(plan).toHaveAttribute("data-plan-complexity", "medium");

  const text = await plan.innerText();
  expect(text.toLowerCase()).toMatch(/tema/);
  expect(text.toLowerCase()).toMatch(/fora do escopo|fora do escopo/i);
});

test("sessionStorage timeline v2 não contém updatedPlan stale após sync", async ({
  page,
}) => {
  const runId = process.env.SETUP_BOSS_E2E_RUN_ID;
  test.skip(!runId, "SETUP_BOSS_E2E_RUN_ID em falta");

  await page.goto(FRONTEND_URL);
  const storageKey = `setup-boss:plan-approval-timeline:v2:${runId}`;
  const raw = await page.evaluate((k) => sessionStorage.getItem(k), storageKey);
  if (!raw) {
    test.skip(true, "sem timeline no sessionStorage — abrir aprovação na UI primeiro");
  }
  const doc = JSON.parse(raw);
  for (const t of doc.threads || []) {
    if (!t.updatedPlan) continue;
    expect(t.updatedPlan.schemaVersion ?? 0).toBeGreaterThanOrEqual(2);
    if (t.updatedPlan.canonicalized === false) {
      expect(t.updatedPlan.presentation?.complexity?.level).not.toBe("high");
    }
  }
});
