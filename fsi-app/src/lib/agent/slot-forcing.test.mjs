// @ts-check
// Red-then-green for slot-forcing (item 5b). THE binding proven first: an unsupported assertion produces NO
// FACT and the criterion stays red — a FACT is NEVER emitted to clear a slot. Word-overlap nominates; the
// judge decides. Fixtures drawn from the 782878c0 class (UK aviation-fuel Order): jurisdictional_scope IS in
// prose + pool (judge confirms → FACT); penalty_summary is weakly/not covered (judge fails → no FACT). Mocked
// judge — ZERO live calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { nominateForSlot, decideSlotClaim, forceSlotCoverage, MIN_NOMINATION_SPAN } from "./slot-forcing.mjs";

// 782878c0-class fixtures: the enacted Order text (legislation.gov.uk) present in the pool.
const JURISDICTION_SPAN = "aviation fuel at or for delivery to places in the United Kingdom";
const POOL = [{
  url: "https://www.legislation.gov.uk/uksi/2024/xyz",
  text: `Article 2(1). This Order applies to a supplier of ${JURISDICTION_SPAN}. Section 5 sets out reporting duties.`,
}];

// ── THE NEGATIVE BINDING, first ───────────────────────────────────────────────────────────────────────
test("NEGATIVE: an unsupported assertion produces NO FACT (the criterion stays red) — never fabricate to clear", () => {
  // The judge FAILS the span (it does not support the asserted penalty). A FACT must NOT be emitted.
  const d = decideSlotClaim({
    slotKey: "penalty_summary",
    nomination: { span: "Section 5 sets out reporting duties.", url: POOL[0].url },
    judgeVerdict: { supports: false, why: "reporting duties are not a penalty" },
    proseCovers: true,
  });
  assert.notEqual(d.kind, "FACT", "a judge-failed assertion must NEVER become a FACT");
  assert.equal(d.kind, "RELABEL", "prose covers it but the span is not judge-supported → 4c label path, not a forced FACT");
});

test("NEGATIVE (no nomination): a genuinely-absent slot → honest GAP, not a FACT", () => {
  const d = decideSlotClaim({ slotKey: "effective_date", nomination: null, judgeVerdict: null, proseCovers: false });
  assert.equal(d.kind, "GAP");
});

// ── GREEN: judge-confirmed genuine support → a real slot-tagged FACT ───────────────────────────────────
test("GREEN: a slot the judge confirms is grounded → a FACT tagged with slot_key + the verbatim span", () => {
  const nomination = { span: `This Order applies to a supplier of ${JURISDICTION_SPAN}`, url: POOL[0].url };
  const d = decideSlotClaim({ slotKey: "jurisdictional_scope", nomination, judgeVerdict: { supports: true }, proseCovers: true });
  assert.equal(d.kind, "FACT");
  assert.equal(d.slot_key, "jurisdictional_scope");
  assert.equal(d.source_span, nomination.span);
  assert.equal(d.source_url, POOL[0].url);
});

test("nominateForSlot: word-overlap picks a real pool-present clause, best-topic-overlap first; empty when absent", () => {
  const proseSentences = [
    `This Order applies to a supplier of ${JURISDICTION_SPAN}`, // present in pool
    "Analysts expect knock-on costs.",                          // NOT in pool → not nominated
  ];
  const noms = nominateForSlot("the jurisdictional scope the order applies to", POOL, proseSentences);
  assert.equal(noms.length, 1, "only the pool-present clause is nominated");
  assert.ok(noms[0].span.includes(JURISDICTION_SPAN));
  // a too-short fragment is never nominated
  assert.deepEqual(nominateForSlot("scope", POOL, ["UK only"]), []);
  assert.ok("UK only".length < MIN_NOMINATION_SPAN);
});

test("forceSlotCoverage end-to-end (mock judge): FACT where judge confirms, GAP/RELABEL where it fails — never a fabricated FACT", async () => {
  const uncovered = [
    { slotKey: "jurisdictional_scope", description: "the jurisdictional scope", proseSentences: [`This Order applies to a supplier of ${JURISDICTION_SPAN}`], proseCovers: true },
    { slotKey: "penalty_summary", description: "the penalty for non-compliance", proseSentences: ["Section 5 sets out reporting duties."], proseCovers: true },
    { slotKey: "effective_date", description: "the effective date", proseSentences: [], proseCovers: false },
  ];
  // judge confirms ONLY the jurisdiction span; fails the penalty span.
  const judge = async (slotKey) => ({ supports: slotKey === "jurisdictional_scope" });
  const { facts, gaps, relabels, audit } = await forceSlotCoverage(uncovered, POOL, judge);
  assert.equal(facts.length, 1, "exactly one judge-confirmed FACT");
  assert.equal(facts[0].slot_key, "jurisdictional_scope");
  assert.equal(relabels.length, 1, "the judge-failed penalty routes to 4c relabel, NOT a FACT");
  assert.equal(gaps.length, 1, "the genuinely-absent effective_date is an honest GAP");
  // the audit trail carries the judge decision for every slot (for the genuine-support audit in the proof sample)
  assert.equal(audit.length, 3);
  assert.equal(audit.find((a) => a.slot === "penalty_summary").decision, "RELABEL");
  assert.equal(audit.length, 3);
});

test("BINDING top-K≤3: judge the top-K nominations; first confirm wins; NONE confirm → no FACT (bounded calls)", async () => {
  const span = (n) => `This Order applies to a supplier of ${JURISDICTION_SPAN} clause ${n}`;
  const pool = [{ url: POOL[0].url, text: `${span(1)}. ${span(2)}. ${span(3)}. ${span(4)}.` }];
  const uncovered = [{ slotKey: "jurisdictional_scope", description: "the jurisdictional scope", proseSentences: [span(1), span(2), span(3), span(4)], proseCovers: true }];
  // judge confirms only the 3rd nomination — a FACT is emitted, and no more than K=3 calls are made.
  let calls = 0;
  const judge = async (_slot, nom) => { calls += 1; return { supports: nom.span.includes("clause 3") }; };
  const r = await forceSlotCoverage(uncovered, pool, judge, 3);
  assert.equal(r.facts.length, 1, "the judge-confirmed 3rd span becomes the FACT");
  assert.ok(r.judgeCalls <= 3 && calls <= 3, "bounded to top-K=3 judge calls per slot");
  // NONE confirm within top-K → NO FACT (RELABEL, prose covers)
  const rNone = await forceSlotCoverage(uncovered, pool, async () => ({ supports: false }), 3);
  assert.equal(rNone.facts.length, 0, "no judge confirmation in top-K → NEVER a FACT");
  assert.equal(rNone.relabels.length, 1);
  assert.ok(rNone.judgeCalls <= 3);
});

test("BINDING no-op on clean items: zero uncovered slots → ZERO judge calls (forward cost discipline)", async () => {
  let calls = 0;
  const r = await forceSlotCoverage([], POOL, async () => { calls += 1; return { supports: true }; });
  assert.equal(calls, 0, "a fully-tagged item performs NO judge calls");
  assert.equal(r.judgeCalls, 0);
  assert.deepEqual([r.facts.length, r.gaps.length, r.relabels.length], [0, 0, 0]);
});
