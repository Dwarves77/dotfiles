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
const { buildDueNextRows, buildChangedRows, selectBriefResources } = await jiti.import("./brief-rows.ts");

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
