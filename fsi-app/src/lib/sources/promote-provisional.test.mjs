// Pure tests for promote-provisional.ts (task 7.5, brief-chain build plan Part 7, 2026-09-12): the
// shared "provisional -> active source" row builder that /api/admin/sources/promote's approve arm
// and scripts/maintenance/resolve-provisional-sources.mjs both consume, so the two promotion paths
// cannot drift on shape. Node 24 native TS type-stripping (relative .ts import, no npm deps, same
// convention as tier-discipline-no-guess.test.mjs importing host-authority.ts), runs in the no-npm
// discipline glob.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPromotedSourceRow,
  findExistingSourceByCanonicalUrl,
  PROVISIONAL_SOURCES_STATUS_CHECK,
  PROVISIONAL_SOURCES_PROMOTED_STATUS,
  PROVISIONAL_SOURCES_REJECTED_STATUS,
} from "./promote-provisional.ts";

test("buildPromotedSourceRow: stamps base_tier/effective_tier/tier_at_creation from the ONE caller-decided tier", () => {
  const row = buildPromotedSourceRow(
    { name: "Example Regulator", url: "https://Example.GOV/page/", discovered_via: "citation_detection" },
    2,
    { promotedBy: "test-caller", nowIso: "2026-09-12T00:00:00Z" },
  );
  assert.equal(row.base_tier, 2);
  assert.equal(row.effective_tier, 2);
  assert.equal(row.tier_at_creation, 2);
});

test("buildPromotedSourceRow: canonicalizes the URL (never stores the raw provisional URL verbatim)", () => {
  const row = buildPromotedSourceRow(
    { name: "Example", url: "https://Example.GOV/page/", discovered_via: "citation_detection" },
    2,
    { promotedBy: "test-caller", nowIso: "2026-09-12T00:00:00Z" },
  );
  assert.equal(row.url, "https://example.gov/page");
});

test("buildPromotedSourceRow: status is always active, access_method scrape, update_frequency weekly, intelligence_types empty (trigger-derived)", () => {
  const row = buildPromotedSourceRow(
    { name: "Example", url: "https://example.gov/page" },
    4,
    { promotedBy: "x" },
  );
  assert.equal(row.status, "active");
  assert.equal(row.access_method, "scrape");
  assert.equal(row.update_frequency, "weekly");
  assert.deepEqual(row.intelligence_types, []);
});

test("buildPromotedSourceRow: notes record the promotion date, the promoter, discovered_via, and the caller's note", () => {
  const row = buildPromotedSourceRow(
    { name: "Example", url: "https://example.gov/page", discovered_via: "worker_search" },
    2,
    { promotedBy: "resolve-provisional-sources (rule b: class table)", note: "SC-13 class table -> gov", nowIso: "2026-09-12T00:00:00Z" },
  );
  assert.match(row.notes, /Promoted from provisional 2026-09-12/);
  assert.match(row.notes, /by resolve-provisional-sources \(rule b: class table\)/);
  assert.match(row.notes, /Discovered via worker_search/);
  assert.match(row.notes, /SC-13 class table -> gov/);
});

test("buildPromotedSourceRow: domains/jurisdictions/transport_modes/topic_tags default empty (caller supplies its own when it has reviewer context)", () => {
  const row = buildPromotedSourceRow({ name: "Example", url: "https://example.gov/page" }, 2, { promotedBy: "x" });
  assert.deepEqual(row.domains, []);
  assert.deepEqual(row.jurisdictions, []);
  assert.deepEqual(row.transport_modes, []);
  assert.deepEqual(row.topic_tags, []);
});

test("findExistingSourceByCanonicalUrl: matches by CANONICAL url, not raw string equality (the Q10 dedup guard)", () => {
  const hostMatches = [
    { id: "s1", url: "https://www.example.gov/page/" },
    { id: "s2", url: "https://other.gov/page" },
  ];
  const found = findExistingSourceByCanonicalUrl(hostMatches, "https://example.gov/page");
  assert.equal(found?.id, "s1");
});

test("findExistingSourceByCanonicalUrl: returns null when nothing matches, and never throws on an empty/undefined list", () => {
  assert.equal(findExistingSourceByCanonicalUrl([], "https://example.gov/page"), null);
  assert.equal(findExistingSourceByCanonicalUrl(undefined, "https://example.gov/page"), null);
});

// Defect fix D2 (docs/plans/defect-fix-plan-2026-09-12.md, 2026-09-12): every status literal this
// module (and its two callers, the promote route and resolve-provisional-sources.mjs) can write to
// provisional_sources.status must be inside the live provisional_sources_status_check constraint
// (migration 004, widened by migration 317 to add 'promoted', applied live before this code merges).
// The five values are copied here VERBATIM as the contract this test pins, per the plan's own
// instruction: pending_review, confirmed, rejected, needs_more_data, promoted.
test("every provisional_sources status literal this module exports is in the live provisional_sources_status_check set", () => {
  const LIVE_CHECK_CONSTRAINT_VALUES = ["pending_review", "confirmed", "rejected", "needs_more_data", "promoted"];
  assert.deepEqual([...PROVISIONAL_SOURCES_STATUS_CHECK], LIVE_CHECK_CONSTRAINT_VALUES);
  assert.ok(LIVE_CHECK_CONSTRAINT_VALUES.includes(PROVISIONAL_SOURCES_PROMOTED_STATUS));
  assert.ok(LIVE_CHECK_CONSTRAINT_VALUES.includes(PROVISIONAL_SOURCES_REJECTED_STATUS));
  assert.equal(PROVISIONAL_SOURCES_PROMOTED_STATUS, "promoted");
  assert.equal(PROVISIONAL_SOURCES_REJECTED_STATUS, "rejected");
});
