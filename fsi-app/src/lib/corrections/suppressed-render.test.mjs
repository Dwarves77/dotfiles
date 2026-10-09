// suppressed-render.test.mjs , a suppressed claim is removed from every customer render of it (lane G7-CORR).
// Portable: node: builtins and relative imports only.
import test from "node:test";
import assert from "node:assert/strict";
import { removeClaimText, redactSuppressedClaims, loadSuppressedClaims } from "./suppressed-render.mjs";

const ITEM = "11111111-1111-4111-8111-111111111111";

test("removeClaimText removes every exact occurrence, tidies the gap, and reports not-found without touching the text", () => {
  const r = removeClaimText("Intro.\n\nThe fee is 40 EUR per tonne.\n\nOutro.", "The fee is 40 EUR per tonne.");
  assert.equal(r.found, true);
  assert.equal(r.text, "Intro.\n\nOutro.");
  const twice = removeClaimText("A claim. B. A claim.", "A claim.");
  assert.equal(twice.text, " B. ");
  const miss = removeClaimText("Nothing here", "The fee is 40 EUR");
  assert.deepEqual(miss, { text: "Nothing here", found: false });
  assert.equal(removeClaimText("x", "   ").found, false, "a blank claim text never matches");
  assert.equal(removeClaimText(undefined, "x").found, false);
});

test("removeClaimText (DFIX-2): the record-grade shape is found through whitespace runs, line wraps and escaped brackets", () => {
  const claim = "[effective_date] The rule applies from 1 January 2026 (\"applies from 1 January 2026\")";
  // 1. a doubled space and a wrapped line
  const wrapped = removeClaimText("Intro.\n[effective_date]  The rule applies from 1 January\n2026 (\"applies from 1 January 2026\")\nOutro.", claim);
  assert.equal(wrapped.found, true);
  assert.equal(wrapped.text, "Intro.\n\nOutro.");
  // 2. markdown-escaped brackets, CRLF line ends
  const escaped = removeClaimText("Intro.\r\n\\[effective_date\\] The rule applies from 1 January 2026 (\"applies from 1 January 2026\")\r\nOutro.", claim);
  assert.equal(escaped.found, true);
  assert.ok(!escaped.text.includes("effective_date"));
  assert.ok(escaped.text.includes("Intro.") && escaped.text.includes("Outro."));
  // 3. a full_brief bullet: the bullet marker goes with the claim, no empty bullet is left
  const bullet = removeClaimText("## Verbatim facts\n- [effective_date]  The rule applies from 1 January 2026 (\"applies from 1 January 2026\")\n- [other_slot] Kept.", claim);
  assert.equal(bullet.found, true);
  assert.equal(bullet.text, "## Verbatim facts\n\n- [other_slot] Kept.");
});

test("removeClaimText (DFIX-2): the tolerance is whitespace and brackets only, never a different word, number or order", () => {
  const claim = "[fee] The fee is 40 EUR per tonne";
  assert.equal(removeClaimText("[fee] The fee is 41 EUR per tonne", claim).found, false, "a different number");
  assert.equal(removeClaimText("[fee] The fee is 40 EUR a tonne", claim).found, false, "a different word");
  assert.equal(removeClaimText("per tonne The fee is 40 EUR [fee]", claim).found, false, "a different order");
  assert.equal(removeClaimText("[fees] The fee is 40 EUR per tonne", claim).found, false, "a different slot key");
  assert.equal(removeClaimText("The fee is 40 EUR per tonne", claim).found, false, "the slot marker is part of the claim");
  // regex characters in a claim are literal
  assert.equal(removeClaimText("Costs (approx.) 5*3 = 15?", "Costs (approx.) 5*3 = 15?").found, true);
  assert.equal(removeClaimText("Costs xapproxx 5*3 = 15?", "Costs (approx.) 5*3 = 15?").found, false);
});

test("redact (DFIX-2): a record-grade claim whose section wraps and escapes it is removed and reported section_found=true", () => {
  const r = redactSuppressedClaims({
    sections: [{ id: "s1", content_md: "\\[slot\\]  Alpha beta\ngamma\n\n[other] Kept." }],
    fullBrief: "- [slot] Alpha beta gamma\n- [other] Kept.",
    claims: [{ id: "c1", claim_text: "[slot] Alpha beta gamma", section_row_id: "s1" }],
  });
  assert.equal(r.sections[0].content_md, "\n\n[other] Kept.".replace(/^\n+/, "\n\n"));
  assert.equal(r.fullBrief, "\n- [other] Kept.".replace(/^\n/, "\n"));
  assert.deepEqual(r.report, [{ claim_id: "c1", claim_text: "[slot] Alpha beta gamma", section_found: true, brief_found: true }]);
});

test("redact: the claim text leaves ITS OWN section only, and the full brief; other sections and the inputs are untouched", () => {
  const sections = [
    { id: "s1", section_key: "a", content_md: "Alpha. The fee is 40 EUR.\n\nBeta." },
    { id: "s2", section_key: "b", content_md: "Also says: The fee is 40 EUR." },
  ];
  const claims = [{ id: "c1", claim_text: "The fee is 40 EUR.", section_row_id: "s1" }];
  const r = redactSuppressedClaims({ sections, fullBrief: "Brief. The fee is 40 EUR. End.", claims });
  assert.equal(r.sections[0].content_md, "Alpha. \n\nBeta.");
  assert.equal(r.sections[1].content_md, "Also says: The fee is 40 EUR.", "a section the claim does not belong to is not edited");
  assert.equal(r.fullBrief, "Brief.  End.");
  assert.deepEqual(r.report, [{ claim_id: "c1", claim_text: "The fee is 40 EUR.", section_found: true, brief_found: true }]);
  assert.equal(sections[0].content_md, "Alpha. The fee is 40 EUR.\n\nBeta.", "the input section is not mutated (stored text is never touched)");
});

test("redact: a claim text NOT found verbatim in its section is recorded as section_found=false, and nothing is guessed", () => {
  const r = redactSuppressedClaims({
    sections: [{ id: "s1", content_md: "The fee is forty euros." }],
    fullBrief: null,
    claims: [{ id: "c1", claim_text: "[fee] ... fee 40", section_row_id: "s1" }],
  });
  assert.equal(r.sections[0].content_md, "The fee is forty euros.");
  assert.deepEqual(r.report, [{ claim_id: "c1", claim_text: "[fee] ... fee 40", section_found: false, brief_found: null }]);
});

test("redact: a claim naming no section, or a section that is not in the list, is section_found=null", () => {
  const r = redactSuppressedClaims({
    sections: [{ id: "s1", content_md: "x" }],
    fullBrief: "has T here",
    claims: [{ id: "c1", claim_text: "T", section_row_id: null }, { id: "c2", claim_text: "T", section_row_id: "gone" }],
  });
  assert.deepEqual(r.report.map((x) => x.section_found), [null, null]);
  assert.equal(r.report[0].brief_found, true);
  assert.equal(r.report[1].brief_found, false, "already removed by the first claim, nothing left to find");
});

test("redact with no claims is the identity", () => {
  const sections = [{ id: "s1", content_md: "keep" }];
  const r = redactSuppressedClaims({ sections, fullBrief: "brief", claims: [] });
  assert.deepEqual(r.sections, sections);
  assert.equal(r.fullBrief, "brief");
  assert.deepEqual(r.report, []);
});

function client({ corrections, claims, claimsError = null }) {
  return {
    from(table) {
      const f = [];
      const b = {
        select() { return b; },
        order() { return b; },
        range(a) { return Promise.resolve({ data: a === 0 ? corrections : [], error: null }); },
        eq(c, v) { f.push([c, v]); return b; },
        in(c, vals) { f.push([c, vals]); return b; },
        then(res) {
          if (table === "item_corrections") return res({ data: corrections.filter((r) => f.every(([c, v]) => r[c] === v)), error: null });
          return res({ data: claimsError ? null : claims, error: claimsError });
        },
      };
      return b;
    },
  };
}
const sup = (target_ref, extra = {}) => ({ id: `c-${target_ref}`, item_id: ITEM, target_kind: "fact", target_ref, op: "suppress", machine_value: { claim_text: "T" }, created_at: "2026-10-06T00:00:00Z", revoked_at: null, ...extra });
const claim = (id, claim_text, section_row_id = "s1") => ({ id, claim_text, section_row_id, intelligence_item_id: ITEM });

test("loadSuppressedClaims: only claims whose latest matching correction is a suppress; a revoked suppress shows the claim again", async () => {
  const claims = [claim("k1", "one"), claim("k2", "two")];
  let r = await loadSuppressedClaims(client({ corrections: [sup("k1")], claims }), [ITEM]);
  assert.deepEqual(r.map((c) => c.id), ["k1"]);
  assert.equal(r[0].section_row_id, "s1");
  r = await loadSuppressedClaims(client({ corrections: [sup("k1", { revoked_at: "2026-10-07T00:00:00Z" })], claims }), [ITEM]);
  assert.deepEqual(r, []);
});

test("loadSuppressedClaims: no suppress correction means no claims read; many items use the paginated read; errors throw", async () => {
  const noClaimsRead = { from(t) { if (t !== "item_corrections") throw new Error("must not read claims"); return { select() { return this; }, eq() { return Promise.resolve({ data: [], error: null }); } }; } };
  assert.deepEqual(await loadSuppressedClaims(noClaimsRead, [ITEM]), []);
  assert.deepEqual(await loadSuppressedClaims(noClaimsRead, []), []);
  const many = await loadSuppressedClaims(client({ corrections: [sup("k1")], claims: [claim("k1", "one")] }), [ITEM, "22222222-2222-4222-8222-222222222222"]);
  assert.deepEqual(many.map((c) => c.id), ["k1"]);
  await assert.rejects(() => loadSuppressedClaims(client({ corrections: [sup("k1")], claims: [], claimsError: { message: "boom" } }), [ITEM]), /section_claim_provenance read failed: boom/);
});
