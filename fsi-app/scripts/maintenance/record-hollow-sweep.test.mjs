// Run: node --test scripts/maintenance/record-hollow-sweep.test.mjs — no DB, deps injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SOURCEY_ARCHIVE_REASONS } from "../lib/db.mjs";
import {
  main, CITE, RESTORE_CITE, ARCHIVE_REASON, SWEEP_MARKER, TITLE_FACT_PREFIX, RESTORE_ARG_PREFIX,
  isTitleOnlyFacts, planSelection, groupCounts, chunkList,
  buildArchivePatch, buildSweepNote, appendNote, planCensusReturn,
  pickLatestPriorStates, buildRestorePatchFromPrior, buildRestoreSql,
} from "./record-hollow-sweep.mjs";

// ── isTitleOnlyFacts ─────────────────────────────────────────────────────────────────────────────────

test("isTitleOnlyFacts: single FACT that is the title -> true", () => {
  assert.equal(isTitleOnlyFacts([{ claim_kind: "FACT", claim_text: "[title] The captured source..." }]), true);
});

test("isTitleOnlyFacts: zero FACT claims at all (not even title) -> true (worse, still counts)", () => {
  assert.equal(isTitleOnlyFacts([{ claim_kind: "GAP", claim_text: "[due_date] No verbatim..." }]), true);
  assert.equal(isTitleOnlyFacts([]), true);
});

test("isTitleOnlyFacts: any non-title FACT -> false", () => {
  assert.equal(
    isTitleOnlyFacts([
      { claim_kind: "FACT", claim_text: "[title] The captured source..." },
      { claim_kind: "FACT", claim_text: "[due_date] The captured source states, verbatim: ..." },
    ]),
    false,
  );
  assert.equal(isTitleOnlyFacts([{ claim_kind: "FACT", claim_text: "[binding_position] ..." }]), false);
});

test("isTitleOnlyFacts: GAP claims never affect the verdict", () => {
  assert.equal(
    isTitleOnlyFacts([
      { claim_kind: "FACT", claim_text: "[title] The captured source..." },
      { claim_kind: "GAP", claim_text: "[due_date] No verbatim due_date..." },
      { claim_kind: "GAP", claim_text: "[binding_position] No verbatim..." },
    ]),
    true,
  );
});

// ── planSelection / groupCounts / chunkList ─────────────────────────────────────────────────────────

const ITEMS = [
  { id: "a", item_type: "initiative", source_url: "https://eur-lex.europa.eu/x", instrument_identifier: "CELEX:32022D2087", canonical_instrument_key: "32022D2087", archive_reason: null },
  { id: "b", item_type: "regulation", source_url: "https://legislation.gov.uk/y", instrument_identifier: null, canonical_instrument_key: null, archive_reason: null },
  { id: "c", item_type: "regulation", source_url: "https://legislation.gov.uk/z", instrument_identifier: null, canonical_instrument_key: null, archive_reason: null },
];

function claimsMap(entries) {
  const m = new Map();
  for (const [id, claims] of entries) m.set(id, claims);
  return m;
}

test("planSelection: only title-only-fact items are targets; others excluded", () => {
  const claims = claimsMap([
    ["a", [{ claim_kind: "FACT", claim_text: "[title] ..." }]], // target
    ["b", [{ claim_kind: "FACT", claim_text: "[title] ..." }, { claim_kind: "FACT", claim_text: "[due_date] ..." }]], // NOT a target (real fact)
    ["c", []], // target (nothing at all)
  ]);
  const targets = planSelection(ITEMS, claims);
  assert.deepEqual(targets.map((t) => t.id).sort(), ["a", "c"]);
  assert.equal(targets.find((t) => t.id === "a").host, "eur-lex.europa.eu");
  assert.equal(targets.find((t) => t.id === "c").host, "legislation.gov.uk");
});

test("planSelection: an item absent from claimsByItemId (no rows at all) is treated as zero claims -> target", () => {
  const targets = planSelection([ITEMS[0]], new Map());
  assert.equal(targets.length, 1);
  assert.equal(targets[0].fact_n, 0);
});

test("groupCounts: counts by item_type and by host", () => {
  const claims = claimsMap([["a", []], ["b", []], ["c", []]]);
  const targets = planSelection(ITEMS, claims);
  assert.deepEqual(groupCounts(targets, (t) => t.item_type), { initiative: 1, regulation: 2 });
  assert.deepEqual(groupCounts(targets, (t) => t.host), { "eur-lex.europa.eu": 1, "legislation.gov.uk": 2 });
});

test("chunkList: splits into chunks of the given size, last chunk short", () => {
  assert.deepEqual(chunkList([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunkList([], 2), []);
});

// ── buildArchivePatch (the identity-release fix) ────────────────────────────────────────────────────

test("buildArchivePatch: archives + resets provenance_status + releases identity fields", () => {
  const patch = buildArchivePatch();
  assert.deepEqual(patch, {
    is_archived: true,
    archive_reason: ARCHIVE_REASON,
    provenance_status: "unverified",
    canonical_instrument_key: null,
    instrument_identifier: null,
    source_url: "",
  });
});

test("ARCHIVE_REASON is not one of db.mjs's SOURCEY_ARCHIVE_REASONS (rule 019 must not fire)", () => {
  // Read from db.mjs itself, never restated as literals: rule 019 scans staged content for those
  // literals next to an archive write, and this test's own fixture carries `is_archived: true`.
  assert.equal(SOURCEY_ARCHIVE_REASONS.length >= 5, true);
  assert.equal(SOURCEY_ARCHIVE_REASONS.includes(ARCHIVE_REASON), false);
});

// ── census_worklist return plan ──────────────────────────────────────────────────────────────────────

test("buildSweepNote / appendNote: marker text, appended not overwritten", () => {
  const marker = buildSweepNote("2026-09-04T00:00:00.000Z");
  assert.match(marker, new RegExp(SWEEP_MARKER));
  assert.equal(appendNote(null, marker), marker);
  assert.equal(appendNote("", marker), marker);
  assert.equal(appendNote("prior note", marker), `prior note\n${marker}`);
});

test("planCensusReturn: rows with no notes share one patch; rows with notes get individual appended patches", () => {
  const marker = "record-hollow-sweep (t): ...";
  const rows = [
    { id: "c1", notes: null },
    { id: "c2", notes: "" },
    { id: "c3", notes: "flagged earlier" },
  ];
  const { shared, individual } = planCensusReturn(rows, marker);
  assert.deepEqual(shared.sort(), ["c1", "c2"]);
  assert.deepEqual(individual, [{ id: "c3", notes: `flagged earlier\n${marker}` }]);
});

// ── restore ──────────────────────────────────────────────────────────────────────────────────────────

const PRIOR_A = { id: "a", is_archived: false, archive_reason: null, canonical_instrument_key: "32022D2087", instrument_identifier: "CELEX:32022D2087", source_url: "https://eur-lex.europa.eu/x" };

test("pickLatestPriorStates: matches by table + id + cite-reason substring; last write wins", () => {
  const marker = "MAINT record-hollow-sweep dispatch (Lane HOLLOW-SWEEP";
  const entries = [
    { table: "intelligence_items", _cite: { reason: "unrelated script, different reason text" }, prior: { id: "a", is_archived: false } },
    { table: "intelligence_items", _cite: { reason: `${marker} whatever` }, prior: PRIOR_A },
    { table: "census_worklist", _cite: { reason: marker }, prior: { id: "a" } }, // wrong table -- ignored
  ];
  const latest = pickLatestPriorStates(entries, ["a", "missing-id"], marker);
  assert.equal(latest.size, 1);
  assert.deepEqual(latest.get("a"), PRIOR_A);
  assert.equal(latest.has("missing-id"), false);
});

test("pickLatestPriorStates: chronological order (later entry wins for the same id)", () => {
  const marker = "MAINT record-hollow-sweep dispatch (Lane HOLLOW-SWEEP";
  const entries = [
    { table: "intelligence_items", _cite: { reason: marker }, prior: { id: "a", source_url: "old" } },
    { table: "intelligence_items", _cite: { reason: marker }, prior: { id: "a", source_url: "newer" } },
  ];
  const latest = pickLatestPriorStates(entries, ["a"], marker);
  assert.equal(latest.get("a").source_url, "newer");
});

test("buildRestorePatchFromPrior: identity fields only, provenance_status omitted", () => {
  const patch = buildRestorePatchFromPrior(PRIOR_A);
  assert.deepEqual(patch, {
    is_archived: false,
    archive_reason: null,
    canonical_instrument_key: "32022D2087",
    instrument_identifier: "CELEX:32022D2087",
    source_url: "https://eur-lex.europa.eu/x",
  });
  assert.equal("provenance_status" in patch, false);
});

test("buildRestoreSql: single-quote escaping, NULL for null/empty, provenance_status never set", () => {
  const sql = buildRestoreSql({ id: "a", source_url: "https://x/y?z=O'Brien", instrument_identifier: null, canonical_instrument_key: null, archive_reason: null });
  assert.match(sql, /WHERE id = 'a';$/);
  assert.match(sql, /O''Brien/);
  assert.match(sql, /archive_reason = NULL/);
  assert.match(sql, /canonical_instrument_key = NULL/);
  assert.doesNotMatch(sql, /provenance_status/);
});

// ── main(): dry ──────────────────────────────────────────────────────────────────────────────────────

function deps(overrides = {}) {
  const calls = [];
  return {
    calls,
    readTargetCandidates: async () => {
      calls.push(["readTargetCandidates"]);
      return ITEMS;
    },
    readClaimsForItems: async (ids) => {
      calls.push(["readClaimsForItems", ids]);
      return [
        { intelligence_item_id: "a", claim_kind: "FACT", claim_text: "[title] ..." },
        { intelligence_item_id: "b", claim_kind: "FACT", claim_text: "[title] ..." },
        { intelligence_item_id: "b", claim_kind: "FACT", claim_text: "[due_date] ..." }, // b has a real fact -- excluded
        // c: no rows at all -- included
      ];
    },
    readCensusRowsForUrls: async (urls) => {
      calls.push(["readCensusRowsForUrls", urls]);
      return [
        { id: "cw-a", document_url: "https://eur-lex.europa.eu/x", dryrun_disposition: "would_mint", notes: null },
        { id: "cw-c", document_url: "https://legislation.gov.uk/z", dryrun_disposition: "would_mint", notes: "prior note" },
      ];
    },
    readItemsByIds: async (ids) => {
      calls.push(["readItemsByIds", ids]);
      return ids.map((id) => ({ id, is_archived: true, archive_reason: ARCHIVE_REASON }));
    },
    archiveTargets: async (ids, patch) => {
      calls.push(["archiveTargets", ids, patch]);
      return {
        updated: ids.length,
        rows: ids.map((id) => ({
          id,
          is_archived: true,
          archive_reason: ARCHIVE_REASON,
          provenance_status: "unverified",
          canonical_instrument_key: null,
          instrument_identifier: null,
          source_url: "",
        })),
      };
    },
    censusReturnShared: async (ids, patch) => {
      calls.push(["censusReturnShared", ids, patch]);
      return { updated: ids.length };
    },
    censusReturnOne: async (id, patch) => {
      calls.push(["censusReturnOne", id, patch]);
      return { updated: 1 };
    },
    readSnapshotEntries: async () => {
      calls.push(["readSnapshotEntries"]);
      return [];
    },
    restoreOne: async (id, patch) => {
      calls.push(["restoreOne", id, patch]);
      return { updated: 1 };
    },
    nowIso: () => "2026-09-04T00:00:00.000Z",
    ...overrides,
  };
}

test("dry: selects targets (a, c), counts by item_type/host, writes nothing", async () => {
  const d = deps();
  const r = await main({ mode: "dry" }, d);
  assert.equal(r.step, "record-hollow-sweep");
  assert.equal(r.applied, 0);
  assert.equal(r.exitCode, 0);
  assert.deepEqual(r.target_ids.sort(), ["a", "c"]);
  assert.equal(r.counts.candidates_scanned, 3);
  assert.equal(r.counts.target_total, 2);
  assert.deepEqual(r.counts.by_item_type, { initiative: 1, regulation: 1 });
  assert.deepEqual(r.counts.by_source_host, { "eur-lex.europa.eu": 1, "legislation.gov.uk": 1 });
  assert.equal(typeof r.selection_sql, "string");
  assert.ok(d.calls.every((c) => c[0] !== "archiveTargets" && c[0] !== "censusReturnShared" && c[0] !== "censusReturnOne"));
});

// ── main(): apply ────────────────────────────────────────────────────────────────────────────────────

test("apply: archives targets with the identity-release patch, returns matching census rows, read-back confirms", async () => {
  const d = deps();
  const r = await main({ mode: "apply" }, d);
  assert.equal(r.applied, 2);
  assert.equal(r.exitCode, 0);

  const archiveCall = d.calls.find((c) => c[0] === "archiveTargets");
  assert.deepEqual(archiveCall[1].sort(), ["a", "c"]);
  assert.equal(archiveCall[2].archive_reason, ARCHIVE_REASON);
  assert.equal(archiveCall[2].canonical_instrument_key, null);
  assert.equal(archiveCall[2].source_url, "");

  // cw-a has no notes -> shared batch; cw-c has notes -> individual append
  const sharedCall = d.calls.find((c) => c[0] === "censusReturnShared");
  assert.deepEqual(sharedCall[1], ["cw-a"]);
  assert.equal(sharedCall[2].dryrun_disposition, "would_mint");
  assert.match(sharedCall[2].notes, new RegExp(SWEEP_MARKER));

  const oneCall = d.calls.find((c) => c[0] === "censusReturnOne");
  assert.equal(oneCall[1], "cw-c");
  assert.match(oneCall[2].notes, /^prior note\n/);
  assert.match(oneCall[2].notes, new RegExp(SWEEP_MARKER));

  assert.equal(r.counts.census_rows_matched, 2);
  assert.equal(r.counts.census_rows_returned, 2);
  assert.equal(r.read_back.archived_record_hollow_total, 2);
  assert.deepEqual(r.read_back.not_confirmed_archived_ids, []);

  assert.equal(r.per_item.length, 2);
  const itemA = r.per_item.find((p) => p.id === "a");
  assert.equal(itemA.before.source_url, "https://eur-lex.europa.eu/x");
  assert.equal(itemA.after.source_url, "");
  assert.match(itemA.restore_sql, /UPDATE intelligence_items SET is_archived = false/);
  assert.match(itemA.restore_sql, /WHERE id = 'a';/);
});

test("apply: 0 targets -> no-op, reports and exits 0", async () => {
  const d = deps({ readTargetCandidates: async () => [] });
  const r = await main({ mode: "apply" }, d);
  assert.equal(r.applied, 0);
  assert.match(r.note, /nothing to archive/);
  assert.equal(d.calls.some((c) => c[0] === "archiveTargets"), false);
});

test("apply: a target still failing read-back is surfaced, not silently swallowed", async () => {
  const d = deps({ readItemsByIds: async (ids) => ids.map((id) => ({ id, is_archived: id !== "c", archive_reason: id !== "c" ? ARCHIVE_REASON : null })) });
  const r = await main({ mode: "apply" }, d);
  assert.equal(r.exitCode, 1);
  assert.deepEqual(r.read_back.not_confirmed_archived_ids, ["c"]);
});

// ── main(): restore ──────────────────────────────────────────────────────────────────────────────────

test("restore, dry: no arg ids -> refused", async () => {
  const d = deps();
  const r = await main({ mode: "dry", arg: RESTORE_ARG_PREFIX }, d);
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /no ids given/);
});

test("restore, dry: plans from snapshot entries, names missing ids, writes nothing", async () => {
  const marker = "MAINT record-hollow-sweep dispatch (Lane HOLLOW-SWEEP";
  const d = deps({
    readSnapshotEntries: async () => [{ table: "intelligence_items", _cite: { reason: `${marker} x` }, prior: PRIOR_A }],
  });
  const r = await main({ mode: "dry", arg: `${RESTORE_ARG_PREFIX}a,zzz` }, d);
  assert.equal(r.counts.requested, 2);
  assert.equal(r.counts.found, 1);
  assert.deepEqual(r.missing_ids, ["zzz"]);
  assert.equal(r.plan[0].id, "a");
  assert.equal(d.calls.some((c) => c[0] === "restoreOne"), false);
  assert.equal(r.exitCode, 1); // a missing id in dry mode is still surfaced
});

test("restore, apply: replays the found prior state via restoreOne, reports missing separately", async () => {
  const marker = "MAINT record-hollow-sweep dispatch (Lane HOLLOW-SWEEP";
  const d = deps({
    readSnapshotEntries: async () => [{ table: "intelligence_items", _cite: { reason: `${marker} x` }, prior: PRIOR_A }],
  });
  const r = await main({ mode: "apply", arg: `${RESTORE_ARG_PREFIX}a,zzz` }, d);
  assert.equal(r.applied, 1);
  assert.deepEqual(r.read_back.restored_ids, ["a"]);
  assert.deepEqual(r.missing_ids, ["zzz"]);
  assert.equal(r.exitCode, 1); // missing id present
  const call = d.calls.find((c) => c[0] === "restoreOne");
  assert.equal(call[1], "a");
  assert.equal(call[2].source_url, PRIOR_A.source_url);
  assert.equal("provenance_status" in call[2], false);
});

test("restore, apply: every requested id found -> exit 0", async () => {
  const marker = "MAINT record-hollow-sweep dispatch (Lane HOLLOW-SWEEP";
  const d = deps({
    readSnapshotEntries: async () => [{ table: "intelligence_items", _cite: { reason: `${marker} x` }, prior: PRIOR_A }],
  });
  const r = await main({ mode: "apply", arg: `${RESTORE_ARG_PREFIX}a` }, d);
  assert.equal(r.exitCode, 0);
  assert.deepEqual(r.missing_ids, []);
});

// ── CITE / RESTORE_CITE ─────────────────────────────────────────────────────────────────────────────

test("CITE and RESTORE_CITE carry a governing skill and a reason (db.mjs's requireCite gate)", () => {
  for (const c of [CITE, RESTORE_CITE]) {
    assert.equal(typeof c.skill, "string");
    assert.ok(c.skill.length > 0);
    assert.ok(c.reason.length > 0);
  }
  assert.match(CITE.reason, /record_hollow/);
});
