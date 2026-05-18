import assert from "node:assert";
import { describe, it } from "node:test";
import {
  RUNTIME_LOG_CATEGORY_OPTS,
  isAllRuntimeLogCategoriesSelected,
  loadRuntimeLogCategoryFilters,
} from "./runtime-logs-category-filter-storage";

describe("runtime-logs-category-filter-storage", () => {
  it("load sem window devolve todas as categorias", () => {
    const s = loadRuntimeLogCategoryFilters();
    assert.equal(s.size, RUNTIME_LOG_CATEGORY_OPTS.length);
  });

  it("isAllRuntimeLogCategoriesSelected", () => {
    assert.equal(
      isAllRuntimeLogCategoriesSelected(new Set(RUNTIME_LOG_CATEGORY_OPTS)),
      true,
    );
    assert.equal(
      isAllRuntimeLogCategoriesSelected(new Set(["runtime"])),
      false,
    );
  });
});
