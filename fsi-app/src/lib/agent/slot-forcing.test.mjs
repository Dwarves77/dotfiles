// @ts-check
// Red-then-green for slot-forcing (item 5b + the NOMINATION FIX, ruling 2026-07-04). THE binding proven
// first: an unsupported assertion produces NO FACT and the criterion stays red — a FACT is NEVER emitted to
// clear a slot. Word-overlap NOMINATES; the judge DECIDES.
//
// THE NOMINATION FIX (what the 5c paid proof surfaced): nominations must be drawn from POOL-SOURCE spans
// (floor-first), NOT from synthesised brief prose. Synthesised prose is paraphrase — never verbatim in the
// pool — so the old prose-nomination produced ZERO nominations on the real 782878c0 pool (nominated=0,
// judgeCalls=0, item stayed walled). The fix nominates VERBATIM clauses out of the floor-qualifying pool
// sources, so a judge-confirmed span is grounded AT the floor by construction. Fixtures are drawn from the
// REAL 782878c0 pool (UK RTFO Sustainable Aviation Fuel Order 2024): the T1 legislation.gov.uk enacted text
// carries the jurisdictional clause; a T6 law-firm commentary paraphrases it. Mocked judge — ZERO live calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { nominateForSlot, decideSlotClaim, forceSlotCoverage, MIN_NOMINATION_SPAN } from "./slot-forcing.mjs";

// ── REAL 782878c0 pool fixtures (verbatim excerpts, incl. the `&#xD;` entity delimiters as stored) ──
// T1 enacted Order (legislation.gov.uk) — the floor source. Real clauses from the stored pool excerpt.
const LEG_URL = "https://legislation.gov.uk/ukdsi/2024/9780348261714";
const LEG_TEXT =
  `1. —(1) This Order may be cited as the Renewable Transport Fuel Obligations (Sustainable Aviation Fuel) ` +
  `Order 2024 and comes into force on 1st January 2025.&#xD; (2) This Order extends to England and Wales, ` +
  `Scotland and Northern Ireland.&#xD; Interpretation 2. —(1) In this Order— “ obligated supplier ” means a ` +
  `supplier on which a SAF obligation is imposed under article 3;&#xD; Part 2 The SAF obligation 3. —(1) ` +
  `Subject to paragraph (2), a SAF obligation is imposed on every supplier that, in a specified period, ` +
  `supplies relevant aviation turbine fuel at, or for delivery to, places in the United Kingdom.&#xD;`;
// T6 law-firm commentary (wfw.com) — a sub-floor corroborator that PARAPHRASES (never verbatim enacted text).
const WFW_URL = "https://www.wfw.com/articles/uk-eu-saf-comparison/";
const WFW_TEXT =
  `The UK Order applies across Great Britain and Northern Ireland, imposing a SAF supply obligation on jet ` +
  `fuel suppliers. In our view the regime is broadly comparable to the EU's ReFuelEU framework.`;
const FLOOR_POOL = [{ url: LEG_URL, text: LEG_TEXT, tier: 1 }];
const FULL_POOL = [...FLOOR_POOL, { url: WFW_URL, text: WFW_TEXT, tier: 6 }];

// ── THE NEGATIVE BINDING, first ───────────────────────────────────────────────────────────────────────
test("NEGATIVE: an unsupported assertion produces NO FACT (the criterion stays red) — never fabricate to clear", () => {
  // The judge FAILS the span (it does not support the asserted penalty). A FACT must NOT be emitted.
  const d = decideSlotClaim({
    slotKey: "penalty_summary",
    nomination: { span: "This Order extends to England and Wales, Scotland and Northern Ireland.", url: LEG_URL },
    judgeVerdict: { supports: false, why: "jurisdictional extent is not a penalty" },
    proseCovers: true,
  });
  assert.notEqual(d.kind, "FACT", "a judge-failed assertion must NEVER become a FACT");
  assert.equal(d.kind, "RELABEL", "prose covers it but the span is not judge-supported → 4c label path, not a forced FACT");
});

test("NEGATIVE (no nomination): a genuinely-absent slot → honest GAP, not a FACT", () => {
  const d = decideSlotClaim({ slotKey: "effective_date", nomination: null, judgeVerdict: null, proseCovers: false });
  assert.equal(d.kind, "GAP");
});

// ── THE NOMINATION FIX: pool-source spans, verbatim by construction ─────────────────────────────────────
test("nominateForSlot draws VERBATIM clauses from the POOL SOURCE (not brief prose) — the 5c fix", () => {
  const noms = nominateForSlot("the jurisdictional scope / territorial extent the Order applies to", FLOOR_POOL);
  assert.ok(noms.length > 0, "the enacted pool text yields nominations (the old prose-nomination yielded ZERO)");
  // EVERY nominated span is a VERBATIM substring of the floor source — the property prose-nomination violated.
  for (const n of noms) {
    assert.ok(LEG_TEXT.includes(n.span), `nominated span must be verbatim in the source: ${JSON.stringify(n.span)}`);
    assert.equal(n.url, LEG_URL);
  }
  // the territorial-extent clause is among the nominations (the delimiter split found it as a clean clause)
  assert.ok(noms.some((n) => n.span.includes("extends to England and Wales, Scotland and Northern Ireland")),
    "the jurisdictional clause is nominated as a verbatim pool span");
  // a too-short fragment is never nominated
  assert.deepEqual(nominateForSlot("scope", [{ url: LEG_URL, text: "UK only.", tier: 1 }]), []);
  assert.ok("UK only".length < MIN_NOMINATION_SPAN);
});

test("FLOOR-FIRST: passing the FLOOR pool nominates ONLY floor-source spans (sub-floor corroborator excluded)", () => {
  // The caller passes floorSources(pool) — the T6 wfw paraphrase is NOT in it, so no nomination resolves to it.
  const noms = nominateForSlot("SAF obligation imposed on jet fuel suppliers", FLOOR_POOL);
  assert.ok(noms.length > 0);
  assert.ok(noms.every((n) => n.url === LEG_URL), "every nomination is from the T1 floor source");
  // sanity: the raw full pool WOULD surface the sub-floor paraphrase (why the caller must pass the floor pool)
  const rawNoms = nominateForSlot("SAF obligation imposed on jet fuel suppliers", FULL_POOL);
  assert.ok(rawNoms.some((n) => n.url === WFW_URL), "the raw pool includes the sub-floor corroborator — floor pool must be passed");
});

// ── GREEN: judge-confirmed genuine support → a real slot-tagged FACT grounded at the floor ──────────────
test("GREEN end-to-end on the real pool (mock judge): judge-confirmed jurisdictional span → FACT at T1", async () => {
  const uncovered = [
    { slotKey: "jurisdictional_scope", description: "the jurisdictional scope / territorial extent the Order applies to", proseCovers: true },
    { slotKey: "penalty_summary", description: "the penalty for non-compliance", proseCovers: true },
    { slotKey: "effective_date", description: "the date the Order comes into force", proseCovers: false },
  ];
  // judge confirms ONLY a span that genuinely mentions the territorial extent; fails everything else.
  const judge = async (slotKey, nom) =>
    ({ supports: slotKey === "jurisdictional_scope" && /England and Wales, Scotland and Northern Ireland/.test(nom.span) });
  const { facts, gaps, relabels, audit, judgeCalls } = await forceSlotCoverage(uncovered, FLOOR_POOL, judge);
  assert.equal(facts.length, 1, "exactly one judge-confirmed FACT");
  assert.equal(facts[0].slot_key, "jurisdictional_scope");
  assert.ok(LEG_TEXT.includes(facts[0].source_span), "the FACT span is verbatim in the floor source (grounds at T1)");
  assert.equal(facts[0].source_url, LEG_URL);
  // penalty_summary: prose covers it but no span the judge supports → 4c RELABEL, never a fabricated FACT.
  assert.ok(relabels.some((r) => r.slot_key === "penalty_summary"), "judge-failed penalty routes to 4c relabel");
  // effective_date: the Order-citation clause carries the in-force date, but proseCovers=false and the mock
  // judge fails it → honest GAP (genuinely-absent branch). No FACT either way without judge confirmation.
  assert.ok(gaps.length + relabels.length >= 1);
  assert.ok(judgeCalls >= 1, "the judge was actually consulted (nominations existed — the fix)");
  assert.ok(!facts.some((f) => f.slot_key === "penalty_summary"), "NEVER a FACT without judge confirmation");
});

test("BINDING top-K≤3: judge the top-K nominations; first confirm wins; bounded judge calls per slot", async () => {
  // A pool with several jurisdiction-topical clauses; the judge confirms only one specific span.
  const uncovered = [{ slotKey: "jurisdictional_scope", description: "the jurisdictional scope the Order applies to", proseCovers: true }];
  let calls = 0;
  const judge = async (_slot, nom) => { calls += 1; return { supports: /Northern Ireland/.test(nom.span) }; };
  const r = await forceSlotCoverage(uncovered, FLOOR_POOL, judge, 3);
  assert.ok(r.judgeCalls <= 3 && calls <= 3, "bounded to top-K=3 judge calls per slot");
  // NONE confirm within top-K → NO FACT (RELABEL, prose covers).
  const rNone = await forceSlotCoverage(uncovered, FLOOR_POOL, async () => ({ supports: false }), 3);
  assert.equal(rNone.facts.length, 0, "no judge confirmation in top-K → NEVER a FACT");
  assert.equal(rNone.relabels.length, 1);
  assert.ok(rNone.judgeCalls <= 3);
});

test("BINDING no-op on clean items: zero uncovered slots → ZERO judge calls (forward cost discipline)", async () => {
  let calls = 0;
  const r = await forceSlotCoverage([], FLOOR_POOL, async () => { calls += 1; return { supports: true }; });
  assert.equal(calls, 0, "a fully-tagged item performs NO judge calls");
  assert.equal(r.judgeCalls, 0);
  assert.deepEqual([r.facts.length, r.gaps.length, r.relabels.length], [0, 0, 0]);
});

test("BINDING no-op on empty floor pool: floor-exempt/absent floor source → no nominations, no fabricated FACT", async () => {
  // When the caller passes an EMPTY floor pool (exempt type, or no floor source fetched), there is nothing to
  // nominate — the slot honestly GAPs/RELABELs, never a fabricated FACT.
  const uncovered = [{ slotKey: "jurisdictional_scope", description: "the jurisdictional scope", proseCovers: false }];
  const r = await forceSlotCoverage(uncovered, [], async () => ({ supports: true }));
  assert.equal(r.facts.length, 0);
  assert.equal(r.judgeCalls, 0, "no pool → no nominations → no judge calls");
  assert.equal(r.gaps.length, 1, "genuinely-absent (proseCovers=false) → honest GAP");
});
