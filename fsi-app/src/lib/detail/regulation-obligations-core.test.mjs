// Structural proof for src/lib/detail/regulation-obligations-core.ts (PERF-2 lane, 2026-09-03) —
// docs/audits/perf-load-times-2026-09-03.md §8 "(A)".
//
// Two things this file proves:
//   1. loadRegulationObligations's own control flow (resolve-then-parallel-fetch, soft-fail, honest
//      omission on an unresolved id) — the same style of proof load-detail-core.test.mjs uses for
//      loadDetailCore.
//   2. THE TIMELINE CLAIM ITSELF: composing the regulations page's data path as
//      "await loadDetail(), THEN await the obligations reads" (the shape page.tsx had BEFORE this lane)
//      versus "Promise.all([loadDetail(), obligations reads])" (the shape it has AFTER) — with a call
//      log recording each stage's start/end order and wall-clock elapsed — so the fix is demonstrated
//      mechanically, not asserted. Both loadDetail and the obligations reads are stood in with a stubbed
//      delay (setTimeout), mirroring load-detail-core.test.mjs's `sleep` helper, so this stays a pure
//      node:test proof of ORDERING/CONCURRENCY, not a live-timing benchmark.
import test from "node:test";
import assert from "node:assert/strict";
import { loadRegulationObligations } from "./regulation-obligations-core.ts";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── (1) loadRegulationObligations's own control flow ──────────────────

test("resolves the id once, then fetches register + upcoming IN PARALLEL (both start before either ends)", async () => {
  const events = [];
  const result = await loadRegulationObligations("g14", {
    resolveItemId: async (id) => {
      events.push(`resolve:${id}`);
      return "uuid-1";
    },
    fetchRegisterRows: async (uuid) => {
      events.push("start:register");
      await sleep(10);
      events.push("end:register");
      return [{ id: "r1", intelligence_item_id: uuid }];
    },
    fetchUpcomingEvents: async (uuid) => {
      events.push("start:upcoming");
      await sleep(10);
      events.push("end:upcoming");
      return [{ id: "e1", intelligence_item_id: uuid }];
    },
  });

  assert.deepEqual(result.registerRows, [{ id: "r1", intelligence_item_id: "uuid-1" }]);
  assert.deepEqual(result.upcomingEvents, [{ id: "e1", intelligence_item_id: "uuid-1" }]);
  assert.equal(events[0], "resolve:g14", "resolution runs before either fetch starts");
  const firstEnd = events.findIndex((e) => e.startsWith("end:"));
  const startsBeforeFirstEnd = events.slice(0, firstEnd).filter((e) => e.startsWith("start:"));
  assert.equal(startsBeforeFirstEnd.length, 2, `expected both fetches started before either ended, saw: ${events.join(",")}`);
});

test("an id that does not resolve returns empty arrays (honest omission), never calls either fetch", async () => {
  let registerCalled = false;
  let upcomingCalled = false;
  const result = await loadRegulationObligations("unknown-slug", {
    resolveItemId: async () => null,
    fetchRegisterRows: async () => {
      registerCalled = true;
      return [];
    },
    fetchUpcomingEvents: async () => {
      upcomingCalled = true;
      return [];
    },
  });
  assert.deepEqual(result, { registerRows: [], upcomingEvents: [] });
  assert.equal(registerCalled, false);
  assert.equal(upcomingCalled, false);
});

test("a thrown resolution error soft-fails to empty arrays (an obligations read failure must never break the detail page)", async () => {
  const result = await loadRegulationObligations("g14", {
    resolveItemId: async () => {
      throw new Error("supabase unreachable");
    },
    fetchRegisterRows: async () => [{ id: "should-not-appear" }],
    fetchUpcomingEvents: async () => [{ id: "should-not-appear" }],
  });
  assert.deepEqual(result, { registerRows: [], upcomingEvents: [] });
});

test("a thrown fetch error soft-fails to empty arrays rather than propagating", async () => {
  const result = await loadRegulationObligations("g14", {
    resolveItemId: async () => "uuid-1",
    fetchRegisterRows: async () => {
      throw new Error("register read failed");
    },
    fetchUpcomingEvents: async () => [{ id: "e1" }],
  });
  assert.deepEqual(result, { registerRows: [], upcomingEvents: [] });
});

// ── (2) the page-level timeline claim: sequential vs. parallel composition ────

test("(A) timeline: 'await loadDetail, then await obligations' costs the SUM of both stages", async () => {
  const timeline = [];
  const STAGE_MS = 30;

  async function stubLoadDetail() {
    timeline.push({ event: "start:loadDetail", t: Date.now() });
    await sleep(STAGE_MS);
    timeline.push({ event: "end:loadDetail", t: Date.now() });
    return { resource: { id: "g14" } };
  }
  async function stubObligations() {
    timeline.push({ event: "start:obligations", t: Date.now() });
    await sleep(STAGE_MS);
    timeline.push({ event: "end:obligations", t: Date.now() });
    return { registerRows: [], upcomingEvents: [] };
  }

  const t0 = Date.now();
  // THE PRE-LANE SHAPE: page.tsx's function body did `const result = await loadDetail(...)` BEFORE it
  // could even construct the <ObligationRegister>/<UpcomingObligationsStrip> elements — see
  // regulation-obligations-core.ts's header for why this is a hard JS-execution-order fact, not a React
  // scheduling nuance.
  await stubLoadDetail();
  await stubObligations();
  const sequentialElapsed = Date.now() - t0;

  assert.ok(
    sequentialElapsed >= STAGE_MS * 2 - 5, // small slop for setTimeout jitter
    `sequential composition should cost ~= the SUM of both stages (${STAGE_MS * 2}ms), took ${sequentialElapsed}ms`
  );
  // obligations must not even START until loadDetail's own "end" event.
  const loadDetailEndIdx = timeline.findIndex((e) => e.event === "end:loadDetail");
  const obligationsStartIdx = timeline.findIndex((e) => e.event === "start:obligations");
  assert.ok(
    obligationsStartIdx > loadDetailEndIdx,
    `obligations must start strictly after loadDetail ends in the sequential shape, saw: ${timeline.map((e) => e.event).join(",")}`
  );
});

test("(A) timeline: 'Promise.all([loadDetail, obligations])' costs ~= the SLOWER of the two stages, not the sum", async () => {
  const timeline = [];
  const STAGE_MS = 30;

  async function stubLoadDetail() {
    timeline.push({ event: "start:loadDetail", t: Date.now() });
    await sleep(STAGE_MS);
    timeline.push({ event: "end:loadDetail", t: Date.now() });
    return { resource: { id: "g14" } };
  }
  async function stubObligations() {
    timeline.push({ event: "start:obligations", t: Date.now() });
    await sleep(STAGE_MS);
    timeline.push({ event: "end:obligations", t: Date.now() });
    return { registerRows: [], upcomingEvents: [] };
  }

  const t0 = Date.now();
  // THE FIX: page.tsx now runs these via Promise.all — see page.tsx's own comment at the call site.
  const [result, obligations] = await Promise.all([stubLoadDetail(), stubObligations()]);
  const parallelElapsed = Date.now() - t0;

  assert.ok(result.resource.id === "g14" && Array.isArray(obligations.registerRows));
  // Parallel: both stages' "start" events happen before EITHER "end" event — the direct opposite of the
  // sequential proof above.
  const starts = timeline.filter((e) => e.event.startsWith("start:"));
  const firstEndIdx = timeline.findIndex((e) => e.event.startsWith("end:"));
  const startsBeforeFirstEnd = timeline.slice(0, firstEndIdx).filter((e) => e.event.startsWith("start:"));
  assert.equal(starts.length, 2);
  assert.equal(startsBeforeFirstEnd.length, 2, `both stages must start before either ends, saw: ${timeline.map((e) => e.event).join(",")}`);
  assert.ok(
    parallelElapsed < STAGE_MS * 2 - 5,
    `parallel composition should cost ~= the SLOWER stage (${STAGE_MS}ms), not the sum (${STAGE_MS * 2}ms) — took ${parallelElapsed}ms`
  );
});
