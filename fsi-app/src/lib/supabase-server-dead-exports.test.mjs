// DEAD-1d (2026-10-10): the supabase-server.ts fetchers and helpers below had no caller anywhere in the tree after the
// data.ts wrappers went, and were deleted. This pins them gone: a definition reappearing (a revert, a copy-paste from an
// old branch) is red, so a caller-less reader cannot silently return.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "supabase-server.ts"), "utf8");

const DELETED_FUNCTIONS = [
  "fetchMapData", "fetchAwaitingReview", "fetchSurfaceCounts", "fetchMarketIntelItems", "fetchResearchItems",
  "fetchOperationsItems", "fetchTechnologyItems", "fetchPublicResearchPipelineRows", "fetchWorkspaceAggregatesScoped",
  "fetchSourceCitationStatsByIds", "runCategoryRpc", "isPlatformAdminInline",
];

for (const name of DELETED_FUNCTIONS) {
  test(`supabase-server.ts defines no ${name} (deleted, no caller)`, () => {
    assert.doesNotMatch(SRC, new RegExp(String.raw`(?:^|\n)(?:export )?(?:async )?function ${name}\b`));
  });
}

test("supabase-server.ts defines no SourceCitationStat interface (only the deleted fetcher used it)", () => {
  assert.doesNotMatch(SRC, /(?:^|\n)(?:export )?interface SourceCitationStat\b/);
});

test("the live readers these replaced are still defined (the pin is not vacuous)", () => {
  for (const name of ["fetchPublicSurfaceCounts", "fetchPublicMarketIntelItems", "fetchResearchPipelineRows", "fetchListingsMapData"]) {
    assert.match(SRC, new RegExp(String.raw`(?:^|\n)(?:export )?(?:async )?function ${name}\b`), name);
  }
});
