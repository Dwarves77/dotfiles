// PLAN-mode contract (Step 5): planIntakeCycle is a read-only composition of the four gate primitives against
// the live corpus. Depless (plan-intake.ts uses relative imports + a type-only supabase import). A mock sb
// returns a fixed corpus; we assert the verdict table — portal-root → would_reject, distinct-CELEX → would_mint
// (the D1 fix, live in the plan too), same-CELEX → would_reject (duplicate), news-dup → linked (still mints).
import { test } from "node:test";
import assert from "node:assert/strict";
import { planIntakeCycle } from "./plan-intake.ts";

const CORPUS = [
  { id: "efti1234-aaaa", title: "eFTI Regulation (EU) 2020/1056", instrument_identifier: "2020/1056", source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT?uri=CELEX:32020R1056" },
];
// mock supabase: .from().select().eq() resolves to { data: CORPUS }
const fakeSb = (corpus) => ({ from: () => ({ select() { return this; }, eq() { return Promise.resolve({ data: corpus, error: null }); } }) });

test("PLAN: portal root → would_reject (entity-gate), no dedup/congruence run", async () => {
  const r = await planIntakeCycle(fakeSb(CORPUS), [{ title: "EUR-Lex homepage", source_url: "https://eur-lex.europa.eu/", item_type: "regulation" }]);
  assert.equal(r.verdicts[0].verdict, "would_reject");
  assert.match(r.verdicts[0].entity_gate, /portal root/);
  assert.equal(r.wouldReject, 1);
});

test("PLAN: distinct CELEX on the shared path → would_mint (D1 fix live in plan)", async () => {
  const r = await planIntakeCycle(fakeSb(CORPUS), [{ title: "waste shipments 2024/1157", source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT?uri=CELEX:32024R1157", item_type: "regulation" }]);
  assert.equal(r.verdicts[0].verdict, "would_mint");
  assert.equal(r.verdicts[0].dedup, "none");
  assert.equal(r.verdicts[0].congruence, "congruent");
  assert.equal(r.wouldMint, 1);
});

test("PLAN: same CELEX (noise variant) → would_reject (duplicate on source_url)", async () => {
  const r = await planIntakeCycle(fakeSb(CORPUS), [{ title: "eFTI re-scan", source_url: "HTTPS://WWW.eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32020R1056#x", item_type: "regulation" }]);
  assert.equal(r.verdicts[0].verdict, "would_reject");
  assert.match(r.verdicts[0].dedup, /efti1234\(source_url\)/);
  assert.match(r.verdicts[0].reason || "", /already exists/);
});

test("PLAN: 1a congruence — regulation on a news source → would_mint as market_signal", async () => {
  const r = await planIntakeCycle(fakeSb(CORPUS), [{ title: "reg covered by press", source_url: "https://www.prnewswire.com/news-releases/x", item_type: "regulation" }]);
  assert.equal(r.verdicts[0].verdict, "would_mint");
  assert.match(r.verdicts[0].congruence, /1a → market_signal/);
});

test("PLAN: totals + read-only shape (mode='plan')", async () => {
  const r = await planIntakeCycle(fakeSb(CORPUS), [
    { title: "waste 2024/1157", source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT?uri=CELEX:32024R1157", item_type: "regulation" },
    { title: "portal", source_url: "https://eur-lex.europa.eu/", item_type: "regulation" },
  ]);
  assert.equal(r.mode, "plan");
  assert.equal(r.discovered, 2);
  assert.equal(r.wouldMint, 1);
  assert.equal(r.wouldReject, 1);
});
