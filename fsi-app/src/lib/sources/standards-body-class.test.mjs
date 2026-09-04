// GOLDEN — the `standards_body` class-table entry (operator ruling 2026-09-04, `institution-canonicalize`
// Part C `ruling_needed`: ifrs.org / cdp.net / sciencebasedtargets.org sat at T5 against the class table's
// own T4 floor for a standards body's own text — verbatim, "you know how to classify, fix it … T4").
// Proves the RULE, not just the three named hosts: a body that publishes a standard/framework other
// institutions report against is classified by that act, at the same T4 the class table already gives an
// accredited CAB's own official acts (SKILL.md §3's "Industry body / classification society" row) — never
// T1/T2/T3 (it does not issue binding law or regulator guidance, and it is not an outside-industry
// intergovernmental analysis body).
//
// Runs in the no-npm discipline node --test glob (src/lib/sources/*.test.mjs): a relative .ts import only
// (Node 24 type-stripping), same convention as register-step.test.mjs / tier-discipline-no-guess.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classTierForHost, decidePoolHostRegistration } from "./host-authority.ts";

// ── the three named ruling_needed hosts (audit C1 §6 / C2, live at T5 before this class existed) ──────────
test("classTierForHost: the three named standards-body hosts resolve to T4, never T1-T3", () => {
  for (const h of ["ifrs.org", "cdp.net", "sciencebasedtargets.org"]) {
    assert.equal(classTierForHost(h), 4, h);
  }
});

test("classTierForHost: www-prefixed forms of the named hosts resolve identically (host normalization)", () => {
  for (const h of ["www.ifrs.org", "www.cdp.net", "www.sciencebasedtargets.org"]) {
    assert.equal(classTierForHost(h), 4, h);
  }
});

// ── the same rule, other live standards-body hosts in `sources` today ──────────────────────────────────────
test("classTierForHost: GHG Protocol / ISO / GRI / TNFD — same class, hosts live in `sources` today", () => {
  for (const h of ["ghgprotocol.org", "iso.org", "globalreporting.org", "www.globalreporting.org", "tnfd.global"]) {
    assert.equal(classTierForHost(h), 4, h);
  }
});

// ── the class rule is a CLASS, not a name-based guess: neighbours never inherit it ─────────────────────────
test("classTierForHost: a standards-body host's neighbour/lookalike does NOT inherit the class (curated, not fuzzy)", () => {
  for (const h of ["ifrs.com", "notcdp.net", "sciencebasedtargets.io", "sub.random-standards-org.org"]) {
    assert.equal(classTierForHost(h), null, `${h} must NOT inherit the class — curated allowlist, never a fuzzy .org rule`);
  }
});

// ── WRI/WBCSD precedent: co-authorship does not move an unrelated host's own class ─────────────────────────
test("classTierForHost: wri.org stays ANALYSIS (T6) — WRI co-authors GHG Protocol, but wri.org is a different act", () => {
  assert.equal(classTierForHost("wri.org"), 6, "WRI's own think-tank output, unchanged by the new class");
  assert.equal(classTierForHost("ghgprotocol.org"), 4, "the standard itself, a different host, a different act");
});

test("classTierForHost: wbcsd.org already resolves T4 via ASSOCIATION_ALLOW — the new class does not need it", () => {
  assert.equal(classTierForHost("wbcsd.org"), 4);
});

// ── never regresses an already-lower operator ruling (institution match wins first, per SC-13) ────────────
test("decidePoolHostRegistration: an already-resolving lower-ruled institution still INHERITS its own tier, " +
  "never the class-table T4 (ghgprotocol.org/tnfd.global ruled T3, efrag.org T2 — see institution-canonicalize.mjs)", () => {
  assert.deepEqual(decidePoolHostRegistration("ghgprotocol.org", 3), { action: "inherit", tier: 3 });
  assert.deepEqual(decidePoolHostRegistration("tnfd.global", 3), { action: "inherit", tier: 3 });
  assert.deepEqual(decidePoolHostRegistration("efrag.org", 2), { action: "inherit", tier: 2 });
});

test("decidePoolHostRegistration: a brand-new not-yet-registered standards-body host registers at T4 automatically", () => {
  assert.deepEqual(decidePoolHostRegistration("ifrs.org", null), { action: "register", tier: 4 });
  assert.deepEqual(decidePoolHostRegistration("cdp.net", null), { action: "register", tier: 4 });
  assert.deepEqual(decidePoolHostRegistration("sciencebasedtargets.org", null), { action: "register", tier: 4 });
});

// ── ordering: the never-register / codified checks still outrank the class (unchanged structural invariant) ─
test("classTierForHost: permanent-worklist and codified rules still outrank the standards-body class", () => {
  // No named standards-body host is also a legal-aggregator/hosting-platform/legal-primary/gov host today —
  // this pins the STRUCTURE (order of checks inside the function), not a behavioural witness on these hosts.
  assert.equal(classTierForHost("eur-lex.europa.eu"), 1, "legal-primary is untouched by the new class");
  assert.equal(classTierForHost("epa.gov"), 2, "gov is untouched by the new class");
});
