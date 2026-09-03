// Run: node --test scripts/maintenance/tag-proposals.test.mjs — no DB, deps injected.
// proposeTags() itself is pinned in scripts/connections/propose-tags.test.mjs; this file tests the
// wrapper's own orchestration only: --arg selection parsing, dry writes nothing, apply writes through
// proposeTags(), and the exact apply command the dry report names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main, parseSelection } from "./tag-proposals.mjs";

const UNTAGGED_ITEM = { id: "item-1", title: "plain item", created_at: "2026-08-20T00:00:00Z", operational_scenario_tags: [], compliance_object_tags: [], topic_tags: [] };
const TAGGED_ITEM = { id: "item-2", title: "already tagged", created_at: "2026-08-10T00:00:00Z", operational_scenario_tags: ["ocean-bunkering"], compliance_object_tags: [], topic_tags: [] };

function baseDeps(overrides = {}) {
  const calls = [];
  return {
    calls,
    readCorpus: async () => { calls.push(["readCorpus"]); return [UNTAGGED_ITEM, TAGGED_ITEM]; },
    readExistingOpen: async () => { calls.push(["readExistingOpen"]); return []; },
    insertMany: async (rows) => { calls.push(["insertMany", rows]); return { inserted: rows.length, snapshot: "snap-ins" }; },
    updateStale: async (ids) => { calls.push(["updateStale", ids]); return { updated: ids.length, snapshot: "snap-upd" }; },
    ...overrides,
  };
}

// ── parseSelection ───────────────────────────────────────────────────────────────────────────────

test("parseSelection: blank defaults to untagged", () => {
  assert.deepEqual(parseSelection(""), { ok: true, mode: "untagged", ids: null, since: null });
  assert.deepEqual(parseSelection(undefined), { ok: true, mode: "untagged", ids: null, since: null });
});

test("parseSelection: explicit 'untagged' is the same as blank", () => {
  assert.deepEqual(parseSelection("untagged"), { ok: true, mode: "untagged", ids: null, since: null });
});

test("parseSelection: 'since:<ISO>' parses a valid date", () => {
  const r = parseSelection("since:2026-08-01");
  assert.equal(r.ok, true);
  assert.equal(r.mode, "since");
  assert.equal(r.since, "2026-08-01");
});

test("parseSelection: 'since:' with an unparseable date is refused", () => {
  const r = parseSelection("since:not-a-date");
  assert.equal(r.ok, false);
  assert.match(r.error, /parseable date/);
});

test("parseSelection: 'ids:<uuid,uuid>' parses a comma-separated list, trims", () => {
  const r = parseSelection("ids: a-1, b-2 ,c-3");
  assert.equal(r.ok, true);
  assert.equal(r.mode, "ids");
  assert.deepEqual(r.ids, ["a-1", "b-2", "c-3"]);
});

test("parseSelection: 'ids:' with no ids is refused", () => {
  const r = parseSelection("ids:");
  assert.equal(r.ok, false);
  assert.match(r.error, /at least one id/);
});

test("parseSelection: unrecognized value is refused", () => {
  const r = parseSelection("bogus");
  assert.equal(r.ok, false);
  assert.match(r.error, /unrecognized --arg/);
});

// ── main() dry ───────────────────────────────────────────────────────────────────────────────────

test("dry: default (blank arg) computes the untagged population, writes nothing", async () => {
  const d = baseDeps();
  const r = await main({ mode: "dry", arg: "" }, d);
  assert.equal(r.step, "tag-proposals");
  assert.equal(r.applied, 0);
  assert.equal(r.exitCode, 0);
  assert.equal(r.counts.selection.mode, "untagged");
  assert.equal(r.counts.corpus_count, 2);
  assert.equal(r.counts.flag_candidates_count, 1);
  assert.equal(r.counts.preview.length, 1);
  assert.equal(r.counts.preview[0].item_id, "item-1");
  assert.equal(r.counts.apply_command, "node scripts/maintenance/tag-proposals.mjs --mode apply");
  assert.match(r.note, /DRY/);
  assert.ok(!d.calls.some((c) => c[0] === "insertMany" || c[0] === "updateStale"));
});

test("dry: bad --arg refuses before touching deps, exitCode 1", async () => {
  const d = baseDeps();
  const r = await main({ mode: "dry", arg: "bogus" }, d);
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /REFUSED/);
  assert.deepEqual(d.calls, []);
});

test("dry: 'since:<ISO>' selection scopes targets and reports the exact apply command with --arg", async () => {
  const d = baseDeps();
  const r = await main({ mode: "dry", arg: "since:2026-08-15" }, d);
  assert.equal(r.counts.selection.mode, "since");
  assert.equal(r.counts.targets_count, 1, "only item-1 is created_at >= 2026-08-15");
  assert.equal(r.counts.apply_command, "node scripts/maintenance/tag-proposals.mjs --mode apply --arg since:2026-08-15");
});

// ── main() apply ─────────────────────────────────────────────────────────────────────────────────

test("apply: blank arg (untagged default) writes new proposal rows via insertMany", async () => {
  const d = baseDeps();
  const r = await main({ mode: "apply", arg: "" }, d);
  assert.equal(r.applied, 1);
  assert.equal(r.wrote.inserted, 1);
  assert.ok(d.calls.some((c) => c[0] === "insertMany" && c[1].length === 1));
  assert.match(r.note, /Wrote 1 new integrity_flags PROPOSAL row/);
  assert.match(r.note, /never writes intelligence_items tags/);
});

test("apply: resolves stale existing-open flags via updateStale", async () => {
  const d = baseDeps({
    readExistingOpen: async () => [{ id: "flag-stale", subject_ref: "item-gone", created_by: "flywheel-tag:empty-signature" }],
  });
  const r = await main({ mode: "apply", arg: "" }, d);
  assert.equal(r.resolved.updated, 1);
  assert.ok(d.calls.some((c) => c[0] === "updateStale" && c[1].includes("flag-stale")));
});

test("apply: ids selection narrows to the named items only", async () => {
  const d = baseDeps();
  const r = await main({ mode: "apply", arg: "ids:item-1,item-2" }, d);
  assert.equal(r.counts.targets_count, 2);
  assert.equal(r.counts.flag_candidates_count, 1, "item-2 already carries tags — not flag-worthy");
  assert.equal(r.applied, 1);
});

test("apply: bad --arg refuses before touching deps, no writes", async () => {
  const d = baseDeps();
  const r = await main({ mode: "apply", arg: "ids:" }, d);
  assert.equal(r.exitCode, 1);
  assert.equal(r.applied, 0);
  assert.deepEqual(d.calls, []);
});
