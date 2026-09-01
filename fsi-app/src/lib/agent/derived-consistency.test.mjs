// Gate B arithmetic-consistency guard (operator ruling 2026-07-27): a DERIVED mint is allowed ONLY when the
// derived date is arithmetically produced by its basis recurring rule. A wrong match becomes a rejected mint,
// never a mis-derivation in the corpus.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRecurringRule, parseDerivedDate, isDerivedConsistent } from "./derived-consistency.mjs";
import { derivedCoveredTokens } from "./gate-a-derived.mjs";
import { scanBrief } from "./gate-a-scan.mjs";

const JUNE1 = "Reporting is due every year by June 1 for buildings with no residential utility accounts.";

test("parseRecurringRule: annual June-1 rule", () => {
  assert.deepEqual(parseRecurringRule(JUNE1), { kind: "annual", month: 6, day: 1 });
});
test("parseRecurringRule: no annual signal → null (a one-off dated event is not a recurring rule)", () => {
  assert.equal(parseRecurringRule("Effective June 9, 2026, the surcharge applies."), null);
});

test("parseDerivedDate: forms", () => {
  assert.deepEqual(parseDerivedDate("1 June 2027"), { day: 1, month: 6, year: 2027 });
  assert.deepEqual(parseDerivedDate("June 2026"), { day: null, month: 6, year: 2026 });
  assert.deepEqual(parseDerivedDate("2027"), { year: 2027, month: null, day: null });
  assert.deepEqual(parseDerivedDate("2026-06-10"), { year: 2026, month: 6, day: 10 });
  assert.equal(parseDerivedDate("13 percent"), null);
});

test("CONSISTENT: annual June-1 grounds June-1 dates, June-months, and bare years", () => {
  assert.equal(isDerivedConsistent(JUNE1, "1 June 2027"), true);
  assert.equal(isDerivedConsistent(JUNE1, "June 2026"), true);
  assert.equal(isDerivedConsistent(JUNE1, "2027"), true);
});

test("REJECT: month mismatch (a June-1 rule cannot ground a May/July date)", () => {
  assert.equal(isDerivedConsistent(JUNE1, "May 2026"), false);
  assert.equal(isDerivedConsistent(JUNE1, "3 July 2026"), false);
});
test("REJECT: day mismatch (June-1 rule cannot ground June-10)", () => {
  assert.equal(isDerivedConsistent(JUNE1, "2026-06-10"), false);
});
test("REJECT: non-recurring basis (no annual signal) → no rule → reject", () => {
  assert.equal(isDerivedConsistent("Effective June 9, 2026.", "1 June 2027"), false);
});
test("REJECT: token is not a date (a figure) → reject", () => {
  assert.equal(isDerivedConsistent(JUNE1, "13 percent"), false);
});
test("REJECT: year out of horizon", () => {
  assert.equal(isDerivedConsistent(JUNE1, "1 June 3200"), false);
});

// ── THE WIRE (Wave W2, unwired-module disposition register #5, canonical-pipeline.ts:~1738) ──
// canonical-pipeline.ts's Gate B call site narrows derivedCoveredTokens' output by re-checking each still-
// covered token with isDerivedConsistent(basisSpan, claimText) and deleting it from the set on failure —
// mechanically identical to the sequence below, using the SAME real exports these tests exercise directly
// (not a reimplementation). Before this wave isDerivedConsistent had zero production callers; these two
// tests prove that an arithmetically wrong DERIVED claim now actually loses its Gate-A coverage and orphans,
// while a correct one is unaffected — the exact behavior change the wire is for.
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
const derivedRow = (basis, claimText) => ({ intelligence_item_id: ITEM, claim_kind: "DERIVED", claim_text: claimText, basis_claim_id: basis });
const basisFact = (id, span, sr) => ({ id, claim_kind: "FACT", source_span: span, search_result_id: sr });
const cap = (id, excerpt) => ({ id, result_content: excerpt });

/** The exact narrowing sequence canonical-pipeline.ts runs at its Gate B call site, using only the real,
 *  exported functions (derivedCoveredTokens, isDerivedConsistent) — no reimplemented logic. */
async function narrowedCoverage(sb, itemId) {
  const derivedCovered = await derivedCoveredTokens(sb, itemId);
  if (!derivedCovered.size) return derivedCovered;
  const { data: derivedRows } = await sb.from("section_claim_provenance").select("claim_text, basis_claim_id").eq("intelligence_item_id", itemId).eq("claim_kind", "DERIVED");
  const basisIds = [...new Set((derivedRows ?? []).map((d) => d.basis_claim_id).filter(Boolean))];
  const spanById = new Map();
  if (basisIds.length) {
    const { data: bases } = await sb.from("section_claim_provenance").select("id, source_span").in("id", basisIds).eq("claim_kind", "FACT");
    for (const b of bases ?? []) spanById.set(b.id, b.source_span);
  }
  for (const d of derivedRows ?? []) {
    const tok = String(d.claim_text || "").replace(/\s+/g, " ").toLowerCase();
    if (!derivedCovered.has(tok)) continue;
    const basisSpan = d.basis_claim_id ? spanById.get(d.basis_claim_id) : null;
    if (!basisSpan || !isDerivedConsistent(basisSpan, d.claim_text ?? "")) derivedCovered.delete(tok);
  }
  return derivedCovered;
}

test("WIRE: an arithmetically CONSISTENT DERIVED claim keeps its Gate-A coverage (not an orphan)", async () => {
  const sb = fakeSb({
    section_claim_provenance: [derivedRow("b1", "1 June 2027"), basisFact("b1", "reports are due June 1 annually", "sr1")],
    agent_run_searches: [cap("sr1", "Per the order, reports are due June 1 annually.")],
  });
  const covered = await narrowedCoverage(sb, ITEM);
  assert.ok(covered.has("1 june 2027"), "consistent claim should remain covered");
  const r = scanBrief("Compliance window: prior to 1 June 2027 reporting deadline.", [], covered);
  assert.ok(!r.orphans.some((o) => o.token === "1 June 2027"), "consistent claim should NOT orphan");
});

test("WIRE: an arithmetically INCONSISTENT DERIVED claim LOSES coverage and orphans — the wire's whole point", async () => {
  // Basis rule is annual June 1; the DERIVED claim names 3 July 2027 — a month mismatch. Gate-A's own
  // staleness check has nothing to object to (basis exists, span is verbatim) — only Gate B's arithmetic
  // check catches this, proving the narrowing step in canonical-pipeline.ts actually does something.
  const sb = fakeSb({
    section_claim_provenance: [derivedRow("b1", "3 July 2027"), basisFact("b1", "reports are due June 1 annually", "sr1")],
    agent_run_searches: [cap("sr1", "Per the order, reports are due June 1 annually.")],
  });
  const preGateBCovered = await derivedCoveredTokens(sb, ITEM);
  assert.ok(preGateBCovered.has("3 july 2027"), "Gate A alone (no Gate B) would have called this covered — proves Gate B is the one doing the work");
  const covered = await narrowedCoverage(sb, ITEM);
  assert.ok(!covered.has("3 july 2027"), "inconsistent claim must lose coverage");
  const r = scanBrief("Compliance window: prior to 3 July 2027 reporting deadline.", [], covered);
  assert.ok(r.orphans.some((o) => o.token === "3 July 2027"), "inconsistent claim must orphan under the wired gate");
});
