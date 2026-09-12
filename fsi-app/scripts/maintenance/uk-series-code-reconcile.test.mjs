// Run: node --test scripts/maintenance/uk-series-code-reconcile.test.mjs — no DB, deps injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  main, CITE, RESTORE_CITE, RESTORE_ARG_PREFIX, SELECTION_SQL,
  planItemSeriesCode, planSelection, buildRestoreSql,
  pickLatestPriorStates, buildRestorePatchFromPrior,
} from "./uk-series-code-reconcile.mjs";

// ── planItemSeriesCode: the four/five reported outcomes, never guessed ──────────────────────────────────

test("planItemSeriesCode: match — identifier's series code already agrees with the URL's", () => {
  const r = planItemSeriesCode({ id: "a", source_url: "https://www.legislation.gov.uk/uksi/2021/1095/made", instrument_identifier: "UK uksi 2021/1095" });
  assert.deepEqual(r, { id: "a", status: "match", url_series: "uksi" });
});

test("planItemSeriesCode: mismatch — THE 19-ITEM LIVE DEFECT, a Welsh /wsi/ URL mislabeled 'UK uksi', year/number untouched", () => {
  const r = planItemSeriesCode({
    id: "00a8c0d9-405a-48d9-a01b-9c14c4101155",
    source_url: "https://www.legislation.gov.uk/wsi/2010/2880",
    instrument_identifier: "UK uksi 2010/2880",
  });
  assert.deepEqual(r, {
    id: "00a8c0d9-405a-48d9-a01b-9c14c4101155",
    status: "mismatch",
    url_series: "wsi",
    identifier_series: "uksi",
    old_identifier: "UK uksi 2010/2880",
    new_identifier: "UK wsi 2010/2880",
  });
});

test("planItemSeriesCode: mismatch for every other UK series pair, never just wsi/uksi", () => {
  assert.equal(planItemSeriesCode({ id: "b", source_url: "https://www.legislation.gov.uk/ssi/2024/7/made", instrument_identifier: "UK nisr 2024/7" }).new_identifier, "UK ssi 2024/7");
  assert.equal(planItemSeriesCode({ id: "c", source_url: "https://www.legislation.gov.uk/ukpga/2023/52/contents", instrument_identifier: "UK ssi 2023/52" }).new_identifier, "UK ukpga 2023/52");
});

test("planItemSeriesCode: non_uk_url — source_url is not a legislation.gov.uk host, reported, no write", () => {
  const r = planItemSeriesCode({ id: "d", source_url: "https://eur-lex.europa.eu/32024R0001", instrument_identifier: "32024R0001" });
  assert.equal(r.status, "non_uk_url");
});

test("planItemSeriesCode: url_series_unrecognized — the URL carries no recognized UK series-code segment, never guessed", () => {
  const r = planItemSeriesCode({ id: "e", source_url: "https://www.legislation.gov.uk/eur/2021/1/contents", instrument_identifier: "UK uksi 2021/1" });
  assert.equal(r.status, "url_series_unrecognized");
});

test("planItemSeriesCode: identifier_not_uk_shaped — the live corpus's 2 non-conforming rows, refused, never guessed", () => {
  const r1 = planItemSeriesCode({ id: "f", source_url: "https://www.legislation.gov.uk/uksi/2021/1095/made", instrument_identifier: "2021/1095" });
  assert.equal(r1.status, "identifier_not_uk_shaped");
  assert.equal(r1.url_series, "uksi");
  const r2 = planItemSeriesCode({ id: "g", source_url: "https://www.legislation.gov.uk/uksi/2021/1095/made", instrument_identifier: null });
  assert.equal(r2.status, "identifier_not_uk_shaped");
});

test("planItemSeriesCode: year_number_mismatch — series agrees, year/number does not (0 live rows, but reported, never silently patched)", () => {
  const r = planItemSeriesCode({ id: "h", source_url: "https://www.legislation.gov.uk/uksi/2021/1095/made", instrument_identifier: "UK uksi 2021/1096" });
  assert.equal(r.status, "year_number_mismatch");
  assert.equal(r.url_series, "uksi");
  assert.equal(r.identifier_series, "uksi");
});

// ── planSelection ────────────────────────────────────────────────────────────────────────────────────

test("planSelection: buckets by status, collects only mismatches for the write step", () => {
  const items = [
    { id: "a", source_url: "https://www.legislation.gov.uk/uksi/2021/1095/made", instrument_identifier: "UK uksi 2021/1095" }, // match
    { id: "b", source_url: "https://www.legislation.gov.uk/wsi/2010/2880", instrument_identifier: "UK uksi 2010/2880" }, // mismatch
    { id: "c", source_url: "https://eur-lex.europa.eu/x", instrument_identifier: "32024R0001" }, // non_uk_url
  ];
  const { plans, byStatus, mismatches } = planSelection(items);
  assert.equal(plans.length, 3);
  assert.deepEqual(byStatus, { match: 1, mismatch: 1, non_uk_url: 1 });
  assert.deepEqual(mismatches.map((m) => m.id), ["b"]);
});

test("planSelection: empty input -> empty everything, never throws", () => {
  const { plans, byStatus, mismatches } = planSelection([]);
  assert.deepEqual(plans, []);
  assert.deepEqual(byStatus, {});
  assert.deepEqual(mismatches, []);
});

// ── buildRestoreSql ──────────────────────────────────────────────────────────────────────────────────

test("buildRestoreSql: single-quote escaping, NULL for a null prior value", () => {
  const sql = buildRestoreSql({ id: "a", old_identifier: "UK uksi O'Brien 2010/2880" });
  assert.equal(sql, "UPDATE intelligence_items SET instrument_identifier = 'UK uksi O''Brien 2010/2880' WHERE id = 'a';");
  assert.equal(buildRestoreSql({ id: "a", old_identifier: null }), "UPDATE intelligence_items SET instrument_identifier = NULL WHERE id = 'a';");
});

// ── restore-plumbing (shared shape with record-hollow-sweep.mjs / canonical-key-dedup.mjs) ──────────────

const PRIOR_A = { id: "a", instrument_identifier: "UK uksi 2010/2880" };

test("pickLatestPriorStates: matches by table + id + cite-reason substring", () => {
  const marker = "MAINT uk-series-code-reconcile (task 7.4e";
  const entries = [
    { table: "intelligence_items", _cite: { reason: "unrelated script" }, prior: { id: "a", instrument_identifier: "wrong" } },
    { table: "intelligence_items", _cite: { reason: `${marker}, whatever)` }, prior: PRIOR_A },
  ];
  const latest = pickLatestPriorStates(entries, ["a", "missing"], marker);
  assert.equal(latest.size, 1);
  assert.deepEqual(latest.get("a"), PRIOR_A);
});

test("buildRestorePatchFromPrior: instrument_identifier only", () => {
  assert.deepEqual(buildRestorePatchFromPrior(PRIOR_A), { instrument_identifier: "UK uksi 2010/2880" });
  assert.deepEqual(buildRestorePatchFromPrior({ id: "z" }), { instrument_identifier: null });
});

// ── main(): dry / apply / restore ────────────────────────────────────────────────────────────────────

const CANDIDATES = [
  { id: "a", source_url: "https://www.legislation.gov.uk/uksi/2021/1095/made", instrument_identifier: "UK uksi 2021/1095" },
  { id: "b", source_url: "https://www.legislation.gov.uk/wsi/2010/2880", instrument_identifier: "UK uksi 2010/2880" },
  { id: "c", source_url: "https://www.legislation.gov.uk/nisr/2024/7/made", instrument_identifier: "UK ssi 2024/7" },
];

function deps(overrides = {}) {
  const calls = [];
  return {
    calls,
    readCandidates: async () => {
      calls.push(["readCandidates"]);
      return CANDIDATES;
    },
    updateOne: async (id, oldIdentifier, newIdentifier) => {
      calls.push(["updateOne", id, oldIdentifier, newIdentifier]);
      return { updated: 1, rows: [{ id, instrument_identifier: newIdentifier }] };
    },
    readItemsByIds: async (ids) => {
      calls.push(["readItemsByIds", ids]);
      // Mirror what updateOne would have written, by id.
      const byId = { b: "UK wsi 2010/2880", c: "UK nisr 2024/7" };
      return ids.map((id) => ({ id, instrument_identifier: byId[id] ?? null }));
    },
    readSnapshotEntries: async () => {
      calls.push(["readSnapshotEntries"]);
      return [];
    },
    restoreOne: async (id, patch) => {
      calls.push(["restoreOne", id, patch]);
      return { updated: 1 };
    },
    ...overrides,
  };
}

test("dry: reports counts by status and every per-item plan, writes nothing", async () => {
  const d = deps();
  const r = await main({ mode: "dry" }, d);
  assert.equal(r.step, "uk-series-code-reconcile");
  assert.equal(r.applied, 0);
  assert.equal(r.exitCode, 0);
  assert.deepEqual(r.counts.by_status, { match: 1, mismatch: 2 });
  assert.equal(r.counts.mismatch_total, 2);
  assert.equal(r.per_item.length, 3);
  assert.equal(r.selection_sql, SELECTION_SQL);
  assert.equal(d.calls.some((c) => c[0] === "updateOne"), false);
});

test("apply: rewrites every mismatch, never touches a match, read-back confirms", async () => {
  const d = deps();
  const r = await main({ mode: "apply" }, d);
  assert.equal(r.applied, 2);
  assert.equal(r.exitCode, 0);

  const updateCalls = d.calls.filter((c) => c[0] === "updateOne");
  assert.equal(updateCalls.length, 2);
  assert.ok(updateCalls.find((c) => c[1] === "b" && c[2] === "UK uksi 2010/2880" && c[3] === "UK wsi 2010/2880"));
  assert.ok(updateCalls.find((c) => c[1] === "c" && c[2] === "UK ssi 2024/7" && c[3] === "UK nisr 2024/7"));
  assert.equal(d.calls.some((c) => c[0] === "updateOne" && c[1] === "a"), false); // a is a match, never written

  assert.equal(r.read_back.rewritten_total, 2);
  assert.deepEqual(r.read_back.not_confirmed_ids, []);
  assert.equal(r.per_item_applied.length, 2);
  const itemB = r.per_item_applied.find((p) => p.id === "b");
  assert.equal(itemB.old_identifier, "UK uksi 2010/2880");
  assert.equal(itemB.new_identifier, "UK wsi 2010/2880");
  assert.match(itemB.restore_sql, /instrument_identifier = 'UK uksi 2010\/2880' WHERE id = 'b';/);
});

test("apply: 0 mismatches -> no-op, reports and exits 0", async () => {
  const d = deps({ readCandidates: async () => [CANDIDATES[0]] }); // only the match row
  const r = await main({ mode: "apply" }, d);
  assert.equal(r.applied, 0);
  assert.match(r.note, /nothing to rewrite/);
  assert.equal(d.calls.some((c) => c[0] === "updateOne"), false);
});

test("apply: a row that changed since the read (optimistic concurrency) is left untouched, surfaced not silently swallowed", async () => {
  const d = deps({ updateOne: async () => ({ updated: 0, rows: [] }) });
  const r = await main({ mode: "apply" }, d);
  assert.equal(r.exitCode, 1);
  assert.equal(r.applied, 0);
});

test("restore, dry: no arg ids -> refused", async () => {
  const d = deps();
  const r = await main({ mode: "dry", arg: RESTORE_ARG_PREFIX }, d);
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /no ids given/);
});

test("restore, dry: plans from snapshot entries, names missing ids, writes nothing", async () => {
  const marker = "MAINT uk-series-code-reconcile (task 7.4e";
  const d = deps({
    readSnapshotEntries: async () => [{ table: "intelligence_items", _cite: { reason: `${marker}, x)` }, prior: PRIOR_A }],
  });
  const r = await main({ mode: "dry", arg: `${RESTORE_ARG_PREFIX}a,zzz` }, d);
  assert.equal(r.counts.found, 1);
  assert.deepEqual(r.missing_ids, ["zzz"]);
  assert.equal(r.plan[0].id, "a");
  assert.equal(d.calls.some((c) => c[0] === "restoreOne"), false);
  assert.equal(r.exitCode, 1);
});

test("restore, apply: replays the found prior state via restoreOne, reports missing separately", async () => {
  const marker = "MAINT uk-series-code-reconcile (task 7.4e";
  const d = deps({
    readSnapshotEntries: async () => [{ table: "intelligence_items", _cite: { reason: `${marker}, x)` }, prior: PRIOR_A }],
  });
  const r = await main({ mode: "apply", arg: `${RESTORE_ARG_PREFIX}a,zzz` }, d);
  assert.equal(r.applied, 1);
  assert.deepEqual(r.read_back.restored_ids, ["a"]);
  assert.deepEqual(r.missing_ids, ["zzz"]);
  assert.equal(r.exitCode, 1);
  const call = d.calls.find((c) => c[0] === "restoreOne");
  assert.equal(call[1], "a");
  assert.deepEqual(call[2], { instrument_identifier: "UK uksi 2010/2880" });
});

// ── CITE / RESTORE_CITE ─────────────────────────────────────────────────────────────────────────────

test("CITE and RESTORE_CITE carry a governing skill and a reason (db.mjs's requireCite gate)", () => {
  for (const c of [CITE, RESTORE_CITE]) {
    assert.equal(typeof c.skill, "string");
    assert.ok(c.skill.length > 0);
    assert.ok(c.reason.length > 0);
  }
  assert.match(CITE.reason, /series code/);
});
