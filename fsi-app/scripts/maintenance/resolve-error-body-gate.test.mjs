// Run: node --test scripts/maintenance/resolve-error-body-gate.test.mjs -- no DB, no fetch, deps injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractFailedUrls, buildWorklistEntry, mergeWorklistEntries, buildResolutionNote, planErrorBodyFlag,
  excerptQuote, main, CITE, RESOLVED_BY, WORKLIST_CLASS,
} from "./resolve-error-body-gate.mjs";
// Cross-checked directly against the REAL consumer's readiness gate (fix round 1, reviewer finding C) --
// not re-derived or assumed. attach-found-sources.mjs's own isWorklistRowReady is the ground truth for
// "does this row ever leave notReady purgatory."
import { isWorklistRowReady } from "./attach-found-sources.mjs";

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

// ── excerptQuote ─────────────────────────────────────────────────────────────────────────────────────

test("excerptQuote: returns short text unchanged", () => {
  assert.equal(excerptQuote("short description"), "short description");
  assert.equal(excerptQuote(""), "");
  assert.equal(excerptQuote(null), "");
  assert.equal(excerptQuote(undefined), "");
});

test("excerptQuote: truncates long text to maxLen with an ellipsis, never throws", () => {
  const long = "a".repeat(600);
  const out = excerptQuote(long, 500);
  assert.equal(out.length, 500);
  assert.ok(out.endsWith("..."));
});

// ── buildWorklistEntry -- fix round 1 (reviewer finding C, Important) ───────────────────────────────

test("buildWorklistEntry: uses the host as token, names the class distinctly, and carries the reason in the sentence", () => {
  const e = buildWorklistEntry(
    "item-1", "https://blocked.example/doc", "blocked.example", "capture_blocked",
    "1 stored capture(s) excluded from grounding as failed fetches (bot wall / 403 / 404 / nav shell): https://blocked.example/doc",
  );
  assert.equal(e.item_id, "item-1");
  assert.equal(e.token, "blocked.example");
  assert.equal(e.class, WORKLIST_CLASS);
  assert.match(e.sentence, /capture_blocked/);
  assert.match(e.sentence, /blocked\.example\/doc/);
  assert.equal(e.search_id, null);
});

test("buildWorklistEntry: no reason still produces a valid sentence", () => {
  const e = buildWorklistEntry("item-2", "https://x.example/y", "x.example", null, "1 stored capture(s) excluded: https://x.example/y");
  assert.ok(e.sentence.length > 0);
});

test("buildWorklistEntry: carries url (the failed-fetch URL itself) and quote (an excerpt of the flag's own description)", () => {
  const flagDescription = "1 stored capture(s) excluded from grounding as failed fetches (bot wall / 403 / 404 / nav shell): https://blocked.example/doc";
  const e = buildWorklistEntry("item-1", "https://blocked.example/doc", "blocked.example", "capture_blocked", flagDescription);
  assert.equal(e.url, "https://blocked.example/doc");
  assert.equal(e.quote, flagDescription);
});

test("buildWorklistEntry: the resulting row PASSES attach-found-sources.mjs's own readiness gate (fix round 1's whole point -- cross-checked against the real consumer, not assumed)", () => {
  const e = buildWorklistEntry(
    "item-1", "https://blocked.example/doc", "blocked.example", "capture_blocked",
    "1 stored capture(s) excluded from grounding as failed fetches: https://blocked.example/doc",
  );
  assert.equal(isWorklistRowReady(e), true);
});

test("buildWorklistEntry: even with no flagDescription available, the row still has item_id/token/url (only quote would be empty)", () => {
  const e = buildWorklistEntry("item-1", "https://blocked.example/doc", "blocked.example", "capture_blocked", undefined);
  assert.equal(e.quote, "");
  assert.equal(isWorklistRowReady(e), false, "an empty quote correctly fails readiness -- this documents the edge case, it does not hide it");
});

// ── mergeWorklistEntries -- fix round 1: url joins the dedup identity ───────────────────────────────

test("mergeWorklistEntries: appends genuinely new entries, skips exact (item_id, token, url, class) duplicates", () => {
  const existing = [{ item_id: "i1", token: "h1", class: "figure", sentence: "s", search_id: null }];
  const { rows, appended } = mergeWorklistEntries(existing, [
    { item_id: "i1", token: "host-a", url: "https://host-a/x", quote: "q", class: WORKLIST_CLASS, sentence: "new", search_id: null },
    { item_id: "i1", token: "host-a", url: "https://host-a/x", quote: "q", class: WORKLIST_CLASS, sentence: "duplicate of the one just added", search_id: null },
  ]);
  assert.equal(appended, 1);
  assert.equal(rows.length, 2);
  assert.equal(rows[0], existing[0], "the pre-existing row is left untouched, same object identity");
});

test("mergeWorklistEntries: a re-run against an already-present entry (same item_id/token/url) appends nothing (idempotent)", () => {
  const existing = [{ item_id: "i1", token: "host-a", url: "https://host-a/x", quote: "q", class: WORKLIST_CLASS, sentence: "s", search_id: null }];
  const { rows, appended } = mergeWorklistEntries(existing, [
    { item_id: "i1", token: "host-a", url: "https://host-a/x", quote: "q2", class: WORKLIST_CLASS, sentence: "again", search_id: null },
  ]);
  assert.equal(appended, 0);
  assert.equal(rows.length, 1);
});

test("mergeWorklistEntries: two DIFFERENT failing URLs on the SAME host are both kept, not deduplicated away", () => {
  const { rows, appended } = mergeWorklistEntries([], [
    { item_id: "i1", token: "host-a", url: "https://host-a/x", quote: "q", class: WORKLIST_CLASS, sentence: "s1", search_id: null },
    { item_id: "i1", token: "host-a", url: "https://host-a/y", quote: "q", class: WORKLIST_CLASS, sentence: "s2", search_id: null },
  ]);
  assert.equal(appended, 2);
  assert.equal(rows.length, 2);
});

test("mergeWorklistEntries: empty/undefined existing rows handled without throwing (also covers a pre-fix row shape with no url)", () => {
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
  description: "1 stored capture(s) excluded from grounding as failed fetches (bot wall / 403 / 404 / nav shell): https://bad.example/b",
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

test("main: the appended worklist row carries url + quote and PASSES the real attach-found-sources readiness gate (fix round 1, end-to-end)", async () => {
  const deps = fakeDeps({ flags: [FLAG_STILL_FAILING] });
  await main({ mode: "apply" }, deps);
  const row = deps.worklistOnDisk[0];
  assert.equal(row.url, "https://bad.example/b");
  assert.equal(row.quote, FLAG_STILL_FAILING.description);
  assert.equal(isWorklistRowReady(row), true);
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
