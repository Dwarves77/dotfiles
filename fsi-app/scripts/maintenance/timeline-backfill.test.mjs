// scripts/maintenance/timeline-backfill.test.mjs
//
// Task 6.1c (ADR-030): pure planning (planTimelineBackfillItem, partitionUndated,
// buildUndateableFlagRow/Description) and main()'s orchestration under injected deps -- no real DB, no
// jiti, node builtins + relative .mjs imports only (portable, matches
// scripts/maintenance/retype-eu-decisions.test.mjs's own shape).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planTimelineBackfillItem,
  partitionUndated,
  buildUndateableFlagDescription,
  buildUndateableFlagRow,
  parseBatchArgs,
  main,
  UNDATEABLE_FLAG_CITE,
} from "./timeline-backfill.mjs";

// ── planTimelineBackfillItem ─────────────────────────────────────────────────────────────────────────

test("planTimelineBackfillItem: title date verified against capture -> step 'title', row built", () => {
  const item = {
    id: "item-1",
    title: "Regulation (EU) 2019/1242 of 20 June 2019 setting CO2 emission performance standards",
    source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019R1242",
  };
  const capturedText = "REGULATION (EU) 2019/1242 ... of 20 June 2019 setting CO2 emission performance standards ...".repeat(3);
  const plan = planTimelineBackfillItem({ item, capturedText, forwardEvents: [], todayIso: "2026-09-12" });
  assert.equal(plan.id, "item-1");
  assert.equal(plan.step, "title");
  assert.equal(plan.row.milestone_date, "2019-06-20");
  assert.equal(plan.row.label, "Adopted (from the instrument title)");
});

test("planTimelineBackfillItem: nothing matches -> step 'undateable', row null, attempts carried", () => {
  const item = { id: "item-2", title: "IEA portal home", source_url: "https://iea.org/policies/about" };
  const plan = planTimelineBackfillItem({ item, capturedText: null, forwardEvents: [], todayIso: "2026-09-12" });
  assert.equal(plan.step, "undateable");
  assert.equal(plan.row, null);
  assert.ok(Array.isArray(plan.attempts));
  assert.equal(plan.attempts.length, 5);
});

test("planTimelineBackfillItem: falls to forward event when title/FR/UK all miss", () => {
  const item = { id: "item-3", title: "Some initiative", source_url: "https://example.org/initiative" };
  const forwardEvents = [{ event_date: "2027-03-01", date_precision: "day", event_kind: "compliance_deadline", obligation_text: "submit report" }];
  const plan = planTimelineBackfillItem({ item, capturedText: null, forwardEvents, todayIso: "2026-09-12" });
  assert.equal(plan.step, "forward_event");
  assert.equal(plan.row.milestone_date, "2027-03-01");
});

// ── partitionUndated ─────────────────────────────────────────────────────────────────────────────────

test("partitionUndated: excludes items already present in item_timelines, sorts by id", () => {
  const live = [{ id: "c" }, { id: "a" }, { id: "b" }];
  const dated = ["b"];
  assert.deepEqual(partitionUndated(live, dated).map((r) => r.id), ["a", "c"]);
});

test("partitionUndated: empty inputs are safe", () => {
  assert.deepEqual(partitionUndated([], []), []);
  assert.deepEqual(partitionUndated(null, null), []);
});

// ── undateable flag row builders ────────────────────────────────────────────────────────────────────

test("buildUndateableFlagDescription: names hosts and count, never invents an id", () => {
  const items = [{ id: "1", host: "epa.gov" }, { id: "2", host: "iea.org" }, { id: "3", host: "epa.gov" }];
  const desc = buildUndateableFlagDescription(items);
  assert.match(desc, /3 item\(s\)/);
  assert.match(desc, /epa\.gov/);
  assert.match(desc, /iea\.org/);
});

test("buildUndateableFlagRow: category/subject_type/subject_ref fixed, full id list carried in recommended_actions", () => {
  const items = [{ id: "id-1", host: "epa.gov" }, { id: "id-2", host: "iea.org" }];
  const row = buildUndateableFlagRow(items);
  assert.equal(row.category, "data_quality");
  assert.equal(row.subject_type, "system");
  assert.equal(row.subject_ref, "timeline-backfill");
  assert.equal(row.status, "open");
  assert.equal(row.created_by, "timeline-backfill");
  assert.deepEqual(row.recommended_actions[0].ids, ["id-1", "id-2"]);
});

test("UNDATEABLE_FLAG_CITE is the fixed shape the row builder starts from", () => {
  assert.equal(UNDATEABLE_FLAG_CITE.category, "data_quality");
  assert.equal(UNDATEABLE_FLAG_CITE.subject_ref, "timeline-backfill");
});

// ── parseBatchArgs ───────────────────────────────────────────────────────────────────────────────────

test("parseBatchArgs: --limit and --after-id parsed; absent flags -> undefined", () => {
  assert.deepEqual(parseBatchArgs(["--limit", "50", "--after-id", "abc-123"]), { limit: 50, afterId: "abc-123" });
  assert.deepEqual(parseBatchArgs([]), { limit: undefined, afterId: undefined });
  assert.deepEqual(parseBatchArgs(["--limit", "0"]), { limit: undefined, afterId: undefined });
});

// ── main() orchestration under injected deps ────────────────────────────────────────────────────────

function fakeDeps({
  liveItems = [],
  timelineItemIds = [],
  capturesByItem = {},
  forwardEventsByItem = {},
  todayIso = "2026-09-12",
} = {}) {
  const inserted = [];
  const flagsWritten = [];
  return {
    todayIso,
    hostOf: (url) => {
      try { return new URL(url).host; } catch { return null; }
    },
    readLiveItems: async () => liveItems,
    readTimelineItemIds: async () => timelineItemIds,
    readCaptures: async (id) => (capturesByItem[id] ?? []).map((result_content) => ({ result_content })),
    readForwardEvents: async (id) => forwardEventsByItem[id] ?? [],
    insertTimelineRow: async (row) => { inserted.push(row); return { inserted: { id: `tl-${inserted.length}` } }; },
    writeUndateableFlag: async (items) => { flagsWritten.push(items); return { inserted: { id: "flag-1" } }; },
    _inserted: () => inserted,
    _flagsWritten: () => flagsWritten,
  };
}

test("main() dry: reports per-step counts and a sample, writes nothing", async () => {
  const deps = fakeDeps({
    liveItems: [
      { id: "a", title: "Regulation (EU) 2020/852 of 18 June 2020 on taxonomy", source_url: "https://eur-lex.europa.eu/x" },
      { id: "b", title: "Untitled portal page", source_url: "https://iea.org/policies" },
    ],
    timelineItemIds: [],
    capturesByItem: { a: ["REGULATION (EU) 2020/852 ... of 18 June 2020 on taxonomy ...".repeat(4)] },
  });
  const summary = await main({ mode: "dry" }, deps);
  assert.equal(summary.mode, "dry");
  assert.equal(summary.counts.undated_total, 2);
  assert.equal(summary.counts.by_step.title, 1);
  assert.equal(summary.counts.by_step.undateable, 1);
  assert.equal(summary.counts.written, 1);
  assert.equal(summary.counts.undateable, 1);
  assert.equal(deps._inserted().length, 0, "dry mode writes nothing");
  assert.equal(deps._flagsWritten().length, 0, "dry mode never writes the undateable flag either");
  assert.ok(summary.sample_by_step.title);
  assert.ok(summary.sample_by_step.undateable);
});

test("main() apply: inserts one row per dateable item, writes ONE flag naming the undateable set", async () => {
  const deps = fakeDeps({
    liveItems: [
      { id: "a", title: "Regulation (EU) 2020/852 of 18 June 2020 on taxonomy", source_url: "https://eur-lex.europa.eu/x" },
      { id: "b", title: "Untitled portal page", source_url: "https://iea.org/policies" },
      { id: "c", title: "Also untitled", source_url: "https://worldbank.org/report" },
    ],
    timelineItemIds: [],
    capturesByItem: { a: ["REGULATION (EU) 2020/852 ... of 18 June 2020 on taxonomy ...".repeat(4)] },
  });
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(summary.counts.written, 1);
  assert.equal(summary.counts.undateable, 2);
  assert.equal(deps._inserted().length, 1);
  assert.equal(deps._inserted()[0].item_id, "a");
  assert.equal(deps._flagsWritten().length, 1, "exactly one flag for the whole run, not one per item");
  assert.equal(deps._flagsWritten()[0].length, 2);
  assert.equal(summary.flag_written.id, "flag-1");
});

test("main(): an item already in item_timelines is never touched", async () => {
  const deps = fakeDeps({
    liveItems: [{ id: "a", title: "Regulation (EU) 2020/852 of 18 June 2020", source_url: "https://eur-lex.europa.eu/x" }],
    timelineItemIds: ["a"],
  });
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(summary.counts.undated_total, 0);
  assert.equal(deps._inserted().length, 0);
});

test("main(): --limit and --after-id bound and resume the page", async () => {
  const deps = fakeDeps({
    liveItems: [{ id: "a" }, { id: "b" }, { id: "c" }].map((r) => ({ ...r, title: "no date here", source_url: "https://x.example/1" })),
    timelineItemIds: [],
  });
  const first = await main({ mode: "dry", limit: 2 }, deps);
  assert.equal(first.counts.page_size, 2);
  assert.equal(first.last_id_processed, "b");
  const resumed = await main({ mode: "dry", afterId: "b" }, deps);
  assert.equal(resumed.counts.page_size, 1);
  assert.equal(resumed.last_id_processed, "c");
});

test("main(): no undateable items -> no flag write even in apply mode", async () => {
  const deps = fakeDeps({
    liveItems: [{ id: "a", title: "Regulation (EU) 2020/852 of 18 June 2020 on taxonomy", source_url: "https://eur-lex.europa.eu/x" }],
    timelineItemIds: [],
    capturesByItem: { a: ["REGULATION (EU) 2020/852 ... of 18 June 2020 on taxonomy ...".repeat(4)] },
  });
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(summary.counts.undateable, 0);
  assert.equal(deps._flagsWritten().length, 0);
  assert.equal(summary.flag_written, null);
});
