// Run: node --test scripts/mint/lib/screen-verdict.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { screenVerdictFor, isMintable } from "./screen-verdict.mjs";
import { classifyRelevance } from "../screen-rules.mjs";

test("rule verdict passes through with rule provenance; only on_vertical is mintable", () => {
  const off = screenVerdictFor({ id: "a", title: "Safety Zone; Savannah River, Savannah, GA", document_url: "https://www.federalregister.gov/documents/2026/07/01/2026-1/safety-zone" });
  assert.equal(off.verdict, "off_vertical");
  assert.equal(off.provenance, "rule");
  assert.equal(isMintable(off.verdict), false);
  assert.equal(isMintable("on_vertical"), true);
  assert.equal(isMintable("ambiguous"), false);
});

test("a reviewed verdict overrides ONLY a rule verdict of ambiguous (mergeReviewed semantics)", () => {
  // find any title the rules leave ambiguous, then prove the override — and that a fired rule is never overridden
  const amb = { id: "amb", title: "Commission Decision of 2 October 2001 on German aid to the coal industry", document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32002D0000" };
  const base = classifyRelevance({ title: amb.title, document_url: amb.document_url });
  if (base.verdict === "ambiguous") {
    const r = screenVerdictFor(amb, { amb: { verdict: "off_vertical", reason: "state aid, not freight sustainability", reviewer: "operator" } });
    assert.equal(r.verdict, "off_vertical");
    assert.equal(r.provenance, "reviewed");
  }
  const fired = screenVerdictFor({ id: "sz", title: "Safety Zone; Lake Erie, Lakewood, OH", document_url: "https://www.federalregister.gov/documents/2026/07/01/2026-2/safety-zone" }, { sz: { verdict: "on_vertical", reason: "reviewer says yes", reviewer: "x" } });
  assert.equal(fired.verdict, "off_vertical", "a reviewed entry never outranks a rule that fired");
  assert.equal(fired.provenance, "rule");
});
