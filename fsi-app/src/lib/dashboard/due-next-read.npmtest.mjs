// due-next-read, the proofs that would have caught the production "DUE NEXT, 0 ITEMS" defect
// (lane duenext, 2026-09-08).
//
// WHY THESE TESTS DID NOT EXIST. Every pre-existing dashboard test mounts the cards against
// fixtures that ALREADY contain matching rows, so no test ever asked whether the READ can supply
// them. `brief-rows.npmtest.mjs` proves `buildDueNextRows` picks the nearest future date out of the
// array it is handed, and it is correct; the defect was that the array it was handed came from
// `get_workspace_intelligence_dashboard`, a slice ordered by PRIORITY with LIMIT 50. Measured live
// on 2026-09-08 against org a0000000-0000-0000-0000-000000000001: 45 of 1,433 active verified items
// carry a future binding date under `dueInfo`'s rule; that slice held 23 of them and none of the 5
// whose only future date is `compliance_deadline`. A component test over a good fixture cannot see
// any of that. These four tests can.
//
// Each test names the defect it would have failed on.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { buildDueNextRows } = await jiti.import("./brief-rows.ts");
const { dueInfo } = await jiti.import("./row-fields.ts");

const MIGRATION = readFileSync(resolve(ROOT, "supabase/migrations/315_workspace_due_next.sql"), "utf8");
const SERVER = readFileSync(resolve(ROOT, "src/lib/supabase-server.ts"), "utf8");
const PAGE = readFileSync(resolve(ROOT, "src/app/page.tsx"), "utf8");

// The function body only, so the header's prose (which quotes the OLD ordering to explain the
// defect) can never satisfy or break a structural assertion about the SQL itself.
const SQL_BODY = MIGRATION.slice(MIGRATION.indexOf("CREATE FUNCTION public.get_workspace_due_next"));

const NOW = new Date("2026-09-08T00:00:00.000Z");

function resource(id, over = {}) {
  return {
    id,
    title: `Item ${id}`,
    type: "regulation",
    priority: "LOW",
    tags: [],
    cat: "ocean",
    modes: ["ocean"],
    topic: "reporting",
    domain: 1,
    jurisdiction: "EU",
    jurisdictionIso: ["EU"],
    timeline: [],
    ...over,
  };
}

// ── 1. The Due-next read is ordered by nearest future date, and is NOT the priority slice ──────
//
// DEFECT: `get_workspace_intelligence_dashboard`'s ORDER BY is
// `CASE effective_priority ... END, added_date DESC, id ASC LIMIT 50`. Anything that inherits that
// ordering is answering "what matters most", not "what is due soonest". This asserts migration
// 315's SQL orders by the binding date itself and carries none of the priority ranking.

test("315: the due-next read orders by the binding date ascending", () => {
  const order = SQL_BODY.slice(SQL_BODY.indexOf("ORDER BY"), SQL_BODY.indexOf("LIMIT v_limit"));
  assert.match(order, /ORDER BY\s+d\.nbd ASC/, "the read must order by the computed binding date, ascending");
  assert.match(order, /d\.id ASC/, "and carry a stable id tiebreak, like every sibling RPC");
});

test("315: the due-next read is NOT the priority-ordered slice", () => {
  // The exact ordering `get_workspace_intelligence_dashboard` carries, in either qualified form.
  assert.ok(
    !/CASE\s+\w*\.?effective_priority/i.test(SQL_BODY),
    "the priority CASE ranking must not appear in the due-next read, that ranking IS the defect",
  );
  assert.ok(
    !/WHEN 'CRITICAL' THEN 1/.test(SQL_BODY),
    "nor the priority rank literals it is built from",
  );
  assert.ok(
    !/added_date\s+DESC/i.test(SQL_BODY),
    "added_date DESC is the dashboard slice's secondary ordering and has no business here",
  );
  assert.ok(
    /WHERE d\.nbd IS NOT NULL/.test(SQL_BODY),
    "an item with no future binding date must be excluded by the READ, not filtered out downstream",
  );
});

// ── 2. The SQL's date rule agrees with the UI's `dueInfo` ──────────────────────────────────────
//
// DEFECT: a read whose notion of "due" differs from the card's returns rows the card then drops,
// which is the same class of bug as returning none at all. `dueInfo` builds its candidate list from
// EXACTLY `r.complianceDeadline` and `r.timeline[].date`, so the SQL must use exactly
// `compliance_deadline` and `item_timelines.milestone_date`, and must NOT use `entry_into_force`
// or `next_review_date`, which no Resource field carries and `dueInfo` therefore cannot see.

test("315: the SQL's LEAST() uses the same two date sources dueInfo does", () => {
  const least = SQL_BODY.slice(SQL_BODY.indexOf("LEAST("), SQL_BODY.indexOf(") AS nbd"));
  assert.match(least, /a\.compliance_deadline >= current_date/, "compliance_deadline, future only");
  assert.match(least, /MIN\(t\.milestone_date\)/, "and the nearest future item_timelines milestone");
  assert.match(least, /t\.milestone_date >= current_date/, "future only, matching dueInfo's `ms < today` skip");
  for (const col of ["entry_into_force", "next_review_date"]) {
    assert.ok(
      !least.includes(col),
      `${col} must not enter the binding-date computation: no Resource field carries it, so dueInfo ` +
        `cannot reproduce it and buildDueNextRows would filter such a row straight back out`,
    );
  }

  // The behavioural half of the same claim, through the real `dueInfo`: the two sources the SQL
  // reads are precisely the two that make `dueInfo` return a date.
  assert.ok(dueInfo(resource("cd", { complianceDeadline: "2026-09-30" }), NOW), "complianceDeadline counts");
  assert.ok(dueInfo(resource("tl", { timeline: [{ date: "2026-09-30" }] }), NOW), "a timeline milestone counts");
  assert.equal(dueInfo(resource("past", { complianceDeadline: "2026-01-01" }), NOW), null, "a past date does not");
  assert.equal(dueInfo(resource("none"), NOW), null, "and an item with neither yields no due date at all");
});

// ── 3. The read is bounded and workspace-scoped through the same seam as every other ───────────
//
// F38/F39, plus the membership seam. A new read that skipped either would be a new hole.

test("315: bounded, clamped, and workspace-scoped through the shared membership seam", () => {
  assert.match(SQL_BODY, /p_limit\s+integer DEFAULT 24/, "a small default, not an unbounded read");
  assert.match(
    SQL_BODY,
    /LEAST\(GREATEST\(COALESCE\(p_limit, ?24\), ?1\), ?100\)/,
    "and a hard clamp inside the function, so no caller can widen it into a corpus scan",
  );
  assert.match(SQL_BODY, /LIMIT v_limit/, "the clamp must be what the LIMIT actually uses");
  assert.match(SQL_BODY, /PERFORM public\._assert_org_membership\(p_org_id\)/, "same membership assert");
  assert.match(
    SQL_BODY,
    /FROM public\._workspace_active_items\(p_org_id\)/,
    "and the same active-items seam, so the customer read gate cannot be bypassed by a new RPC",
  );
  assert.match(SERVER, /p_limit: DUE_NEXT_READ_LIMIT/, "the caller passes the bounded limit explicitly");
});

// ── 4. A payload whose own rows carry no future date still populates the card ──────────────────
//
// DEFECT, exactly as production had it: `data.resources` (the priority slice) contained NOT ONE
// row with a future binding date, so `buildDueNextRows(data.resources)` returned none and the card
// read "0 ITEMS" while the corpus held 45 future-dated items.
//
// The fix this lane owns is the POOL: `src/app/page.tsx` unions the dashboard slice with
// `data.dueNext` (the nearest-future-date read) before calling the SHARED selection function. The
// selection function itself belongs to lane briefdata (which is widening its window in the same
// wave), so this test calls `buildDueNextRows` rather than reimplementing any part of it, the two
// lanes meet at that call and nowhere else.

test("a payload with rows but no future dates still populates the card once the due-next read feeds the pool", () => {
  // The production shape: fifty priority-ordered rows, none of them dated in the future.
  const prioritySlice = Array.from({ length: 50 }, (_, i) =>
    resource(`p${i}`, { priority: "CRITICAL", timeline: [{ date: "2026-02-01" }] }),
  );
  assert.equal(buildDueNextRows(prioritySlice, NOW).length, 0, "baseline: this is the production defect");

  // What migration 315's read returns, ordered by binding date ascending.
  const dueNext = [
    resource("d1", { timeline: [{ date: "2026-09-30" }] }),
    resource("d2", { complianceDeadline: "2026-11-18" }),
    resource("d3", { timeline: [{ date: "2026-12-30" }] }),
  ];

  // The union page.tsx builds, de-duplicated by id.
  const pool = [...prioritySlice, ...dueNext.filter((r) => !prioritySlice.some((x) => x.id === r.id))];
  const rows = buildDueNextRows(pool, NOW);

  assert.ok(rows.length > 0, "the card must be populated when the corpus has future-dated items");
  assert.deepEqual(
    rows.map((r) => r.id),
    ["d1", "d2", "d3"],
    "and ordered nearest-first, from both date sources",
  );
});

test("page.tsx unions the due-next read into the pool rather than replacing or ignoring it", () => {
  assert.match(PAGE, /const dueNextPool = \[/, "the pool is built explicitly on the page");
  assert.match(PAGE, /\.\.\.data\.resources,/, "it keeps the payload rows (What-changed needs them)");
  assert.match(PAGE, /\.\.\.\(data\.dueNext \?\? \[\]\)\.filter\(\(r\) => !data\.resources\.some/, "and adds the due-next read, de-duplicated");
  assert.match(PAGE, /buildDueNextRows\(dueNextPool, now\)/, "and the shared selection runs over the union");
  assert.ok(
    !/buildDueNextRows\(data\.resources, now\)/.test(PAGE),
    "the card must no longer be fed the priority slice alone",
  );
});

// ── 5. compliance_deadline actually reaches the UI ─────────────────────────────────────────────
//
// DEFECT: `mapWorkspaceItemRows` never set `Resource.complianceDeadline`, so `dueInfo`'s first
// candidate source was dead on every list and dashboard row in the app. Five live items depend on
// it. A read that returns them is useless while the mapper drops the column.

test("the shared row mapper populates complianceDeadline, the first of dueInfo's two sources", () => {
  const mapper = SERVER.slice(
    SERVER.indexOf("async function mapWorkspaceItemRows"),
    SERVER.indexOf("// ── Workspace aggregates"),
  );
  assert.match(
    mapper,
    /complianceDeadline: row\.compliance_deadline \|\| undefined/,
    "without this line dueInfo can never see a compliance_deadline on a list or dashboard row",
  );
});
