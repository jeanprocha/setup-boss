import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  clearCachedProjectRuns,
  mergeRunsWithCache,
  writeCachedProjectRuns,
  readCachedProjectRuns,
} from "./mission-sidebar-cache.ts";
import type { RunsQueryResult } from "@/hooks/use-runs";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  global.sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

describe("mergeRunsWithCache", () => {
  it("lista vazia do runtime invalida cache antigo", () => {
    const stale: RunsQueryResult = {
      summaries: [
        {
          id: "job_old",
          runId: "20260517-fechar-chat",
          projectId: "p1",
          label: "x",
          activityTitle: null,
          archived: false,
          phase: "intake",
          state: "running",
          operationalStatusKey: null,
          startedAtLabel: null,
          branchHint: null,
          git: null,
          jobStatus: "completed",
          retryable: false,
        },
      ],
      source: "runtime",
    };
    writeCachedProjectRuns("p1", false, stale);

    const out = mergeRunsWithCache("p1", false, {
      summaries: [],
      source: "runtime",
    });

    assert.equal(out.summaries.length, 0);
    assert.equal(readCachedProjectRuns("p1", false), undefined);
  });

  it("mantém cache só enquanto refetch offline ainda não confirmou lista vazia", () => {
    const stale: RunsQueryResult = {
      summaries: [
        {
          id: "job_old",
          runId: "run-a",
          projectId: "p1",
          label: "x",
          activityTitle: null,
          archived: false,
          phase: "intake",
          state: "running",
          operationalStatusKey: null,
          startedAtLabel: null,
          branchHint: null,
          git: null,
          jobStatus: "completed",
          retryable: false,
        },
      ],
      source: "runtime",
    };
    writeCachedProjectRuns("p1", false, stale);

    const out = mergeRunsWithCache("p1", false, {
      summaries: [],
      source: "offline",
    });

    assert.equal(out.summaries.length, 1);
    clearCachedProjectRuns("p1", false);
    assert.equal(readCachedProjectRuns("p1", false), undefined);
  });
});
