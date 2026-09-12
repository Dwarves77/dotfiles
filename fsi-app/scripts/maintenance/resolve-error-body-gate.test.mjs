// Run: node --test scripts/maintenance/resolve-error-body-gate.test.mjs -- no DB, no fetch, deps injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractFailedUrls, buildWorklistEntry, mergeWorklistEntries, buildResolutionNote, planErrorBodyFlag,
  main, CITE, RESOLVED_BY, WORKLIST_CLASS,
} from "./resolve-error-body-gate.mjs";

// ── extractFailedUrls ────────────────────────────────────────────────────────────────────────────────

test("extractFailedUrls: reads the error-body-gate write site's own rationale shape", () => {
  const flag = {
    recommended_actions: [
      { action: "refetch_source", rationale: "https://example.org/a: stored capture is a failed fetch (isErrorBody) -- re-fetch the real source at hold-lift, re-ground" },
    ],
  };
  assert.deepEqual(extractFailedUrls(flag), ["https://example.org/a"]);
});

test("extractFailedUrls: falls back to description for a flag with no recommended_actions", () => {
  const flag = { description: "1 stored capture(s) excluded from grounding as failed fetches (bot wall / 403 / 404 / nav shell): https://example.org/b" };
  assert.deepEqual(extractFailedUrls(flag), ["https://example.org/b"]);
});

// ── buildWorklistEntry ───────────────────────────────────────────────────────────────────────────────

test("buildWorklistEntry: uses the host as token, names the class distinctly, and carries the reason in the sentence", () => {
  const e = buildWorklistEntry("item-1", "https://blocked.example/doc", "blocked.example", "capture_blocked");
  assert.equal(e.item_id, "item-1");
  assert.equal(e.token, "blocked.example");
  assert.equal(e.class, WORKLIST_CLASS);
  assert.match(e.sentence, /capture_blocked/);
  assert.match(e.sentence, /blocked\.example\/doc/);
  assert.equal(e.search_id, null);
});

test("buildWorklistEntry: no reason still produces a valid sentence", () => {
  const e = buildWorklistEntry("item-2", "https://x.example/y", "x.example", null);
  assert.ok(e.sentence.length > 0);
});

// ── mergeWorklistEntries ─────────────────────────────────────────────────────────────────────────────

test("mergeWorklistEntries: appends genuinely new entries, skips exact (item_id, token, class) duplicates", () => {
  const existing = [{ item_id: "i1", token: "h1", class: "figure", sentence: "s", search_id: null }];
  const { rows, appended } = mergeWorklistEntries(existing, [
    { item_id: "i1", token: "host-a", class: WORKLIST_CLASS, sentence: "new", search_id: null },
    { item_id: "i1", token: "host-a", class: WORKLIST_CLASS, sentence: "duplicate of the one just added", search_id: null },
  ]);
  assert.equal(appended, 1);
  assert.equal(rows.length, 2);
  assert.equal(rows[0], existing[0], "the pre-existing row is left untouched, same object identity");
});

test("mergeWorklistEntries: a re-run against an already-present entry appends nothing (idempotent)", () => {
  const existing = [{ item_id: "i1", token: "host-a", class: WORKLIST_CLASS, sentence: "s", search_id: null }];
  const { rows, appended } = mergeWorklistEntries(existing, [{ item_id: "i1", token: "host-a", class: WORKLIST_CLASS, sentence: "again", search_id: null }]);
  assert.equal(appended, 0);
  assert.equal(rows.length, 1);
});

test("mergeWorklistEntries: empty/undefined existing rows handled without throwing", () => {
  const { rows, appended } = mergeWorklistEntries(undefined, [{ item_id: "i1", token: "t1", class: "c" }]);
  assert.equal(appended, 1);
  assert.equal(rows.length, 1);
  assert.deepEqual(mergeWorklistEntries([], []), { rows: [], appended: 0 });
});

// ── buildResolutionNote ──────────────────────────────────────────────────────────────────────────────

test("buildResolutionNote: names fetch_held distinctly and never claims a fetch happened", () => {
  const note = buildResolutionNote([{ url: "https://x.example/a", action: "fetch_held" }, { url: "https://x.example/b", action: "fetch_held" }]);
  assert.match(note, /scrape hold engaged/);
  assert.match(note, /NOT attempted, never bypassed/);
});

test("buildResolutionNote: mixed recaptured/still-failing outcomes", () => {
  const note = buildResolutionNote([
    { url: "https://a.example/1", action: "recaptured" },
    { url: "https://b.example/2", action: "still_failing", host: "b.example", reason: "capture_blocked" },
  ]);
  assert.match(note, /a\.example\/1 -> recaptured/);
  assert.match(note, /b\.example\/2 -> still failing \(capture_blocked\), routed to attach-found-sources worklist as b\.example/);
});

test("buildResolutionNote: empty outcomes names the no-URL case", () => {
  assert.match(buildResolutionNote([]), /no URL could be extracted/);
});

// ── planErrorBodyFlag ────────────────────────────────────────────────────────────────────────────────

test("planErrorBodyFlag: when held, outcomes are pre-populated as fetch_held for every URL", () => {
  const flag = { id: "f1", subject_ref: "item-1", recommended_actions: [{ rationale: "https://x.example/a: stored capture is a failed fetch" }] };
  const plan = planErrorBodyFlag(flag, true);
  assert.equal(plan.urls.length, 1);
  assert.deepEqual(plan.outcomes, [{ url: "https://x.example/a", action: "fetch_held" }]);
});

test("planErrorBodyFlag: when not held, outcomes is null (main() resolves them per URL -- fetch is not pure)", () => {
  const flag = { id: "f1", subject_ref: "item-1", recommended_actions: [{ rationale: "https://x.example/a: stored capture is a failed fetch" }] };
  const plan = planErrorBodyFlag(flag, false);
  assert.equal(plan.outcomes, null);
});

// ── main() orchestration, fake deps (no fetch, no DB) ───────────────────────────────────────────────

function fakeDeps({ flags, held = false, captureOutcomes = {}, worklist = [] } = {}) {
  const calls = [];
  const inserted = [];
  const resolved = [];
  let worklistOnDisk = worklist;
  return {
    calls, inserted, resolved,
    get worklistOnDisk() { return worklistOnDisk; },
    holdEngaged: () => held,
    readOpenFlags: async () => flags,
    captureUrl: async (url, itemId) => {
      calls.push(["captureUrl", url, itemId]);
      const outcome = captureOutcomes[url] ?? { status: "held", reason: "capture_blocked" };
      if (outcome.status === "captured") {
        return { status: "captured", row: { intelligence_item_id: itemId, result_url: url, result_content: "captured text" } };
      }
      return outcome;
    },
    insertCapture: async (row) => { calls.push(["insertCapture", row.result_url]); inserted.push(row); },
    resolveFlag: async (id, note) => { calls.push(["resolveFlag", id]); resolved.push({ id, note }); return { updated: 1, snapshot: "snap" }; },
    readWorklist: () => worklistOnDisk,
    writeWorklist: (rows) => { calls.push(["writeWorklist", rows.length]); worklistOnDisk = rows; },
  };
}

const FLAG_RECAPTURABLE = {
  id: "flag-a", subject_ref: "item-1",
  recommended_actions: [{ rationale: "https://good.example/a: stored capture is a failed fetch" }],
};
const FLAG_STILL_FAILING = {
  id: "flag-b", subject_ref: "item-2",
  recommended_actions: [{ rationale: "https://bad.example/b: stored capture is a failed fetch" }],
};
const FLAG_NO_URL = { id: "flag-c", subject_ref: "item-3", description: "nothing extractable", recommended_actions: [] };

test("main: dry mode never fetches or writes, reports intended per-URL action", async () => {
  const deps = fakeDeps({ flags: [FLAG_RECAPTURABLE, FLAG_STILL_FAILING] });
  const r = await main({ mode: "dry" }, deps);
  assert.equal(r.mode, "dry");
  assert.equal(r.counts.open_flags, 2);
  assert.equal(r.counts.urls_total, 2);
  assert.equal(r.counts.hold_engaged, false);
  assert.equal(deps.calls.length, 0, "dry mode must never fetch or write");
  assert.match(r.note, /DRY/);
});

test("main: dry mode with the hold engaged still reports without fetching, names the hold in counts", async () => {
  const deps = fakeDeps({ flags: [FLAG_RECAPTURABLE], held: true });
  const r = await main({ mode: "dry" }, deps);
  assert.equal(r.counts.hold_engaged, true);
  assert.match(r.note, /ENGAGED/);
  assert.equal(deps.calls.length, 0);
});

test("main: apply mode recaptures a URL, inserts the capture, and resolves the flag", async () => {
  const deps = fakeDeps({
    flags: [FLAG_RECAPTURABLE],
    captureOutcomes: { "https://good.example/a": { status: "captured" } },
  });
  const r = await main({ mode: "apply" }, deps);
  assert.equal(r.applied, 1);
  assert.equal(r.counts.recaptured, 1);
  assert.equal(r.counts.still_failing, 0);
  assert.equal(deps.inserted.length, 1);
  assert.equal(deps.inserted[0].intelligence_item_id, "item-1");
  assert.equal(deps.resolved.length, 1);
  assert.match(deps.resolved[0].note, /recaptured/);
});

test("main: apply mode routes a still-failing URL to the worklist and resolves the flag anyway (a decision either way, per ADR-030)", async () => {
  const deps = fakeDeps({ flags: [FLAG_STILL_FAILING] });
  const r = await main({ mode: "apply" }, deps);
  assert.equal(r.applied, 1);
  assert.equal(r.counts.still_failing, 1);
  assert.equal(deps.calls.some((c) => c[0] === "writeWorklist"), true);
  assert.equal(deps.worklistOnDisk.length, 1);
  assert.equal(deps.worklistOnDisk[0].token, "bad.example");
  assert.equal(deps.resolved.length, 1);
  assert.match(deps.resolved[0].note, /still failing/);
});

test("main: apply mode with the hold engaged fetches nothing, resolves nothing, leaves flags open", async () => {
  const deps = fakeDeps({ flags: [FLAG_RECAPTURABLE, FLAG_STILL_FAILING], held: true });
  const r = await main({ mode: "apply" }, deps);
  assert.equal(r.applied, 0);
  assert.equal(deps.calls.filter((c) => c[0] === "captureUrl").length, 0, "never fetches while held");
  assert.equal(deps.resolved.length, 0, "never resolves while held");
  assert.match(r.note, /Scrape hold engaged/);
});

test("main: apply mode with no extractable URL neither fetches nor resolves that flag", async () => {
  const deps = fakeDeps({ flags: [FLAG_NO_URL] });
  const r = await main({ mode: "apply" }, deps);
  assert.equal(r.applied, 0);
  assert.equal(deps.calls.length, 0);
});

test("main: apply mode never writes the worklist file when nothing is still failing", async () => {
  const deps = fakeDeps({ flags: [FLAG_RECAPTURABLE], captureOutcomes: { "https://good.example/a": { status: "captured" } } });
  const r = await main({ mode: "apply" }, deps);
  assert.equal(r.counts.worklist_entries_appended, 0);
  assert.equal(deps.calls.some((c) => c[0] === "writeWorklist"), false);
});

test("constants: resolved_by / worklist class / cite are present", () => {
  assert.equal(RESOLVED_BY, "resolve-error-body-gate");
  assert.equal(WORKLIST_CLASS, "error_body_refetch");
  assert.ok(CITE.skill && CITE.reason);
});
