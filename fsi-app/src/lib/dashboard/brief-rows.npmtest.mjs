// brief-rows + list-row-fields proof (lane HYDRATION-59, defects D2/D3, 2026-09-07).
//
// Two behavioural properties and one structural one, each tied to a defect the 2026-09-07
// clickthrough audit recorded on production:
//
//   D3a — the dashboard's rows must carry a SCORE. `r.impactScores` is undefined on every row of
//         every RPC (no `impact_scores` column exists in this schema — supabase-server.ts's own
//         watchlist mapper states it), so a row shape without the `?? scoreResource(r)` fallback
//         renders "UNSCORED" forever. The list ledgers had the fallback; the dashboard did not.
//   D3b — a "What changed" row whose item IS in the loaded corpus must carry the SAME field set as
//         its Due-next / list-surface twin, not a stripped one with impact/due/timeline/tier nulled.
//         A change whose item is NOT loaded must still degrade honestly (Absence), never invent.
//   D2  — the four dashboard band tiles must carry a navigation target. Structural: `BandTile`
//         renders a real <Link> when given `href`, and a tile with neither `href` nor `onSelect` is
//         marked `disabled` rather than looking live and doing nothing.
//
// Clock-injected throughout (src/lib/render-now.ts): every assertion below pins `now`, which is
// also the property that makes the row set identical between the SSR and hydration passes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");

// jiti compiles the TS modules for a plain `node --test` run, with the `@` alias wired the same way
// src/components/AppShell.npmtest.mjs does — this repo has no JSX/TS mount infra.
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const {
  buildDueNextRows,
  buildChangedRows,
  selectBriefResources,
  mergeBriefCorpus,
  dueNextWindowLabel,
  briefCardState,
  DUE_NEXT_CAP,
} = await jiti.import("./brief-rows.ts");

const NOW = new Date("2026-09-07T00:00:00.000Z");

function resource(id, over = {}) {
  return {
    id,
    title: `Item ${id}`,
    type: "regulation",
    priority: "CRITICAL",
    tags: [],
    cat: "ocean",
    modes: ["ocean"],
    topic: "reporting",
    domain: 1,
    jurisdiction: "EU",
    jurisdictionIso: ["EU"],
    complianceDeadline: "2026-12-01",
    timeline: [],
    ...over,
  };
}

test("D3a: a row with no stored impact_scores still carries a computed score", () => {
  const rows = buildDueNextRows([resource("a")], NOW);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].impact, "impact must not be null — this is exactly what rendered UNSCORED");
  for (const k of ["cost", "compliance", "client", "operational"]) {
    assert.equal(typeof rows[0].impact[k], "number", `impact.${k} must be a number`);
  }
});

test("D3a: a stored score, when one exists, wins over the computed fallback", () => {
  const stored = { cost: 1, compliance: 1, client: 1, operational: 1 };
  const rows = buildDueNextRows([resource("a", { impactScores: stored })], NOW);
  assert.deepEqual(rows[0].impact, stored);
});

test("D3b: a changed row resolved against the corpus gets the FULL shared row shape", () => {
  const res = resource("a", { sourceTier: 1 });
  const changed = buildChangedRows([{ id: "a", title: "Item a", priority: "HIGH", added: "2026-09-05" }], [res], NOW);
  const due = buildDueNextRows([res], NOW);
  assert.equal(changed.length, 1);
  assert.deepEqual(
    { impact: changed[0].impact, due: changed[0].due, tier: changed[0].tier, meta: changed[0].meta },
    { impact: due[0].impact, due: due[0].due, tier: due[0].tier, meta: due[0].meta },
    "the dashboard's two row paths must produce one row shape, not two",
  );
  assert.equal(changed[0].isNew, true);
});

test("D3b: a changed row whose item is NOT loaded degrades honestly, never invents", () => {
  const rows = buildChangedRows([{ id: "ghost", title: "Ghost", priority: "HIGH", added: "2026-09-05" }], [], NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].impact, null);
  assert.equal(rows[0].tier, null);
  assert.equal(rows[0].due, null);
  assert.equal(rows[0].title, "Ghost");
});

test("the row set is a pure function of the injected instant (the #418 property)", () => {
  const items = [resource("a"), resource("b", { complianceDeadline: "2027-06-01" })];
  const one = buildDueNextRows(items, new Date("2026-09-07T00:00:00.000Z"));
  const two = buildDueNextRows(items, new Date("2026-09-07T00:00:00.000Z"));
  assert.deepEqual(one, two);
  // ...and it genuinely MOVES with the instant, so the test above is not vacuous.
  const later = buildDueNextRows(items, new Date("2026-12-02T00:00:00.000Z"));
  assert.notDeepEqual(one, later);
});

test("the enrichment set is bounded to the rows actually rendered", () => {
  const many = Array.from({ length: 400 }, (_, i) => resource(`r${i}`));
  const changes = many.slice(0, 50).map((r) => ({ id: r.id, title: r.title, priority: "HIGH", added: "2026-09-05" }));
  const picked = selectBriefResources(many, changes, NOW);
  assert.ok(picked.length <= 11, `expected <= 11 rows to enrich, got ${picked.length}`);
});

test("D2: BandTile navigates when given an href, and is disabled when given nothing", () => {
  const src = readFileSync(resolve(HERE, "../../components/ui/BandTile.tsx"), "utf8");
  assert.match(src, /if \(href\) \{[\s\S]*<Link href=\{href\}/, "an href tile must render a real <Link>");
  assert.match(src, /disabled=\{!onSelect\}/, "a tile with no handler must not look live");
  const brief = readFileSync(resolve(HERE, "../../components/dashboard/DashboardBrief.tsx"), "utf8");
  assert.match(
    brief,
    /href=\{`\/regulations\?\$\{BAND_FACET_PARAM\}=\$\{band\.key\}`\}/,
    "all four dashboard band tiles must carry the ?band= contract, not just the card-foot link",
  );
});

// ── Lane BRIEFDATA (2026-09-08). The proofs that BITE. ────────────────────────────────────────
//
// Why the D3 suite above did not catch what shipped: every one of its fixtures hands
// buildChangedRows a corpus that already contains the changed item, so the degrade branch never
// fired in a test. Measured against the live workspace on 2026-09-08 the real ratio was the
// opposite one — 6 of 6 rendered change rows were OUTSIDE the loaded slice, so the branch no test
// exercised was the only branch production ever took. These fixtures start from that state.

/** The shape src/app/page.tsx now assembles: the LIMIT-50 payload, plus the bounded by-id
 *  backfill the fetcher read for exactly the rows the cards render. */
function pageCorpus(payload, backfill) {
  return mergeBriefCorpus(payload, backfill);
}

test("BRIEFDATA/1: a change feed naming items OUTSIDE the loaded slice renders FULL rows", () => {
  // The loaded slice holds fifty high-priority items; none of them is one of the six changed.
  const payload = Array.from({ length: 50 }, (_, i) => resource(`slice${i}`));
  const changedIds = ["c1", "c2", "c3", "c4", "c5", "c6"];
  const feed = changedIds.map((id) => ({ id, title: `Changed ${id}`, priority: "HIGH", added: "2026-09-05" }));

  // Before the backfill: every row degrades. This is the state the operator photographed, asserted
  // here so the fixture is provably starting from the defect and not from a green field.
  const degraded = buildChangedRows(feed, payload, NOW);
  assert.equal(degraded.length, 6);
  assert.ok(
    degraded.every((r) => r.impact === null && r.tier === null && r.due === null && r.meta === ""),
    "fixture invalid: the pre-backfill rows were supposed to be the degraded ones",
  );

  // After it: the same six ids, resolved against the merged corpus, are full rows.
  const backfill = changedIds.map((id) => resource(id, { sourceTier: 2 }));
  const rows = buildChangedRows(feed, pageCorpus(payload, backfill), NOW);
  assert.equal(rows.length, 6);
  for (const row of rows) {
    assert.ok(row.impact, `${row.id} rendered UNSCORED`);
    assert.equal(row.tier, 2, `${row.id} rendered "not in primary source"`);
    assert.ok(row.due, `${row.id} rendered PENDING`);
    assert.notEqual(row.meta, "", `${row.id} rendered an empty meta line`);
  }
});

test("BRIEFDATA/1b: the absence budget — no brief row may carry more than one absent cell", () => {
  // The shared row model allows a row to be missing ONE thing honestly (an item with no timeline,
  // say). A row missing four is not an honest absence, it is the degrade path, and that is the
  // thing this lane exists to stop being the common case.
  const payload = Array.from({ length: 5 }, (_, i) => resource(`p${i}`, { sourceTier: 1 }));
  const feed = payload.map((r) => ({ id: r.id, title: r.title, priority: "HIGH", added: "2026-09-05" }));
  const corpus = pageCorpus(payload, []);
  for (const row of [...buildDueNextRows(corpus, NOW), ...buildChangedRows(feed, corpus, NOW)]) {
    const absent = [row.impact, row.due, row.tier, row.timeline, row.meta || null].filter((v) => v == null).length;
    assert.ok(absent <= 1, `row ${row.id} carries ${absent} absence tokens; at most one is allowed`);
  }
});

test("BRIEFDATA/2: fewer than five future-dated items in the week — the card still FILLS", () => {
  // One item due inside the stated week, four due well past it. Before the widening the card
  // showed one row; the ruling is that it stays populated, and the resolution is to widen the
  // window rather than to invent rows.
  const near = resource("near", { complianceDeadline: "2026-09-09", timeline: [] });
  const far = ["2026-10-01", "2026-11-18", "2027-01-14", "2027-06-02"].map((d, i) =>
    resource(`far${i}`, { complianceDeadline: d, timeline: [] }),
  );
  const undated = Array.from({ length: 20 }, (_, i) =>
    resource(`undated${i}`, { complianceDeadline: undefined, timeline: [] }),
  );
  const rows = buildDueNextRows([near, ...far, ...undated], NOW);
  assert.equal(rows.length, DUE_NEXT_CAP, "the card did not fill from the widened window");
  assert.ok(
    rows.every((r) => r.due),
    "an undated item was padded into the card — that is fabrication, not population",
  );

  // ...and the card SAYS it reached past the week it names.
  const label = dueNextWindowLabel(rows, "Sep 7");
  assert.match(label, /^By next binding date · week of Sep 7, reaching to /);
  assert.match(label, /2027/, "the label must name the furthest date actually on screen");
});

test("BRIEFDATA/2b: rows entirely inside the stated week leave the label unextended", () => {
  const rows = buildDueNextRows(
    [resource("a", { complianceDeadline: "2026-09-08", timeline: [] })],
    NOW,
  );
  assert.equal(dueNextWindowLabel(rows, "Sep 7"), "By next binding date · week of Sep 7");
});

test("BRIEFDATA/2c: no future-dated item anywhere is the ONE honest empty, not a failure", () => {
  const rows = buildDueNextRows(
    [resource("a", { complianceDeadline: undefined, timeline: [] })],
    NOW,
  );
  assert.equal(rows.length, 0);
  assert.equal(briefCardState(rows.length, undefined), "empty");
  assert.equal(dueNextWindowLabel(rows, "Sep 7"), "By next binding date · week of Sep 7");
});

test("BRIEFDATA/3: a FAILED fetch is distinguishable from an empty corpus", () => {
  // The production state lane rsc503 diagnosed rendered "DUE NEXT · 0 ITEMS" for a failed read.
  // Both cards must now say which of the two facts they are showing.
  assert.equal(briefCardState(0, "Data temporarily unavailable. Refresh to retry."), "failed");
  assert.equal(briefCardState(0, undefined), "empty");
  assert.equal(briefCardState(0, ""), "empty", "an empty-string error is not an error");
  assert.equal(briefCardState(3, "Data temporarily unavailable. Refresh to retry."), "rows");
});

test("BRIEFDATA/3b: both cards read the same decision, and the failure carries a real retry", () => {
  const brief = readFileSync(resolve(HERE, "../../components/dashboard/DashboardBrief.tsx"), "utf8");
  assert.match(brief, /const dueState = briefCardState\(dueNextRows\.length, fetchError\)/);
  assert.match(brief, /const changedState = briefCardState\(changedRows\.length, fetchError\)/);
  assert.match(
    brief,
    /action=\{\{ label: "Retry", onClick: \(\) => router\.refresh\(\) \}\}/,
    "the failure state must offer a retry that actually re-requests, not a sentence about refreshing",
  );
  // The failure note must be reachable from BOTH cards, not just the primary one.
  assert.equal((brief.match(/\{failureNote\}/g) || []).length, 2);
});

test("BRIEFDATA/4: the merged corpus is de-duplicated, payload first", () => {
  const payload = [resource("a", { title: "payload copy" })];
  const backfill = [resource("a", { title: "backfill copy" }), resource("b")];
  const merged = mergeBriefCorpus(payload, backfill);
  assert.deepEqual(merged.map((r) => r.id), ["a", "b"]);
  assert.equal(merged[0].title, "payload copy");
});
