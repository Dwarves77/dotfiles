// @ts-check
// Gate B derived-date mechanism (operator ruling 2026-07-27). Two units:
//   scanBrief's DERIVED arm — a token in the precomputed derivedCovered set is NOT an orphan; a labeled-in-prose
//     derived date with NO derived-covered entry IS an orphan (prose labels are never a gate mechanism).
//   derivedCoveredTokens — the pure DB lookup: covered iff DERIVED row + basis FACT exists + basis span verbatim.
// Goldens (a) grounded basis → covered; (b) labeled-in-prose, no DERIVED row → orphan; (c) missing basis → orphan;
// (d) stale basis span → orphan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scanBrief } from "./gate-a-scan.mjs";
import { derivedCoveredTokens } from "./gate-a-derived.mjs";

const BRIEF = "Operators must file the annual benchmark report. Compliance window: prior to 1 June 2027 reporting deadline.";

test("(a) scanBrief: a token in derivedCovered is NOT an orphan", () => {
  const covered = new Set(["1 june 2027"]);
  const r = scanBrief(BRIEF, [], covered);
  assert.ok(!r.orphans.some((o) => o.token === "1 June 2027"), "1 June 2027 should be derived-covered, not orphan");
});

test("(b) scanBrief: labeled-in-prose but NO derived-covered entry → still an orphan", () => {
  // The scanner never reads prose labels; only an explicit DERIVED claim (via the set) covers a derived date.
  const r = scanBrief(BRIEF, [], new Set());
  assert.ok(r.orphans.some((o) => o.token === "1 June 2027"), "with no DERIVED coverage the derived date orphans");
});

// ── derivedCoveredTokens (DB lookup) with a fake supabase client ──
function fakeSb(tables) {
  return {
    from(t) {
      const state = { rows: [...(tables[t] || [])] };
      const b = {
        select() { return b; },
        eq(c, v) { state.rows = state.rows.filter((r) => r[c] === v); return b; },
        in(c, vs) { state.rows = state.rows.filter((r) => vs.includes(r[c])); return b; },
        then(resolve, reject) { return Promise.resolve({ data: state.rows, error: null }).then(resolve, reject); },
      };
      return b;
    },
  };
}
const ITEM = "item-1";
const derivedRow = (basis) => ({ intelligence_item_id: ITEM, claim_kind: "DERIVED", claim_text: "1 June 2027", basis_claim_id: basis });
const basisFact = (id, span, sr) => ({ id, claim_kind: "FACT", source_span: span, search_result_id: sr });
const cap = (id, excerpt) => ({ id, result_content: excerpt });

test("(a) derivedCoveredTokens: DERIVED + basis FACT + basis span verbatim in capture → covered", async () => {
  const sb = fakeSb({
    section_claim_provenance: [derivedRow("b1"), basisFact("b1", "reports are due June 1 annually", "sr1")],
    agent_run_searches: [cap("sr1", "The rule: reports are due June 1 annually for all operators.")],
  });
  const covered = await derivedCoveredTokens(sb, ITEM);
  assert.ok(covered.has("1 june 2027"));
});

test("(c) derivedCoveredTokens: DERIVED with a missing basis → NOT covered", async () => {
  const sb = fakeSb({
    section_claim_provenance: [derivedRow("does-not-exist")], // basis id points nowhere
    agent_run_searches: [],
  });
  const covered = await derivedCoveredTokens(sb, ITEM);
  assert.equal(covered.size, 0);
});

test("(d) derivedCoveredTokens: basis FACT exists but its span is STALE (not in capture) → NOT covered", async () => {
  const sb = fakeSb({
    section_claim_provenance: [derivedRow("b1"), basisFact("b1", "reports are due June 1 annually", "sr1")],
    agent_run_searches: [cap("sr1", "This capture no longer contains the basis rule text.")], // stale
  });
  const covered = await derivedCoveredTokens(sb, ITEM);
  assert.equal(covered.size, 0);
});

test("(e) derivedCoveredTokens: basis exists+verbatim but end-to-end scanBrief clears the token", async () => {
  const sb = fakeSb({
    section_claim_provenance: [derivedRow("b1"), basisFact("b1", "reports are due June 1 annually", "sr1")],
    agent_run_searches: [cap("sr1", "Per the order, reports are due June 1 annually.")],
  });
  const covered = await derivedCoveredTokens(sb, ITEM);
  const r = scanBrief(BRIEF, [], covered);
  assert.ok(!r.orphans.some((o) => o.token === "1 June 2027"));
});
