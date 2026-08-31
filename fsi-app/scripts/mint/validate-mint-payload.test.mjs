// validate-mint-payload.test.mjs — red/green coverage of every C1-C7 failure reason validate-mint-payload.mjs
// can emit, plus a canonicalize-citation-url unit and a full-payload green baseline. Run standalone:
//   node --test scripts/mint/validate-mint-payload.test.mjs
// (scripts/mint/** is this lane's own write set, outside the wired discipline suite glob list -- see
// MINT-RUNBOOK.md "running the kit's own tests".)

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMintPayload } from "./validate-mint-payload.mjs";
import { canonicalizeCitationUrl } from "./lib/canonicalize-citation-url.mjs";

function clone(o) { return JSON.parse(JSON.stringify(o)); }

// A minimal payload engineered to pass ALL seven criteria (baseline green). Every mutation test below
// clones this and breaks exactly one thing.
function basePayload() {
  return {
    item: {
      source_url: "https://example.gov/reg",
      item_type: "directive",
      priority: "MODERATE",
      title: "Example Directive",
      full_brief: "The rule enters into force on 1 January 2026. Compliance is required by 1 January 2027.",
    },
    source: { id: "src-1", url: "https://example.gov/reg", base_tier: 1, tier_override: null, status: "active", institution_id: null },
    registry_sources: [],
    sections: [
      { section_key: "body", section_order: 1, content_md: "The rule applies as described. https://example.gov/reg" },
    ],
    search_results: [
      {
        result_url: "https://example.gov/reg",
        result_content: "This regulation enters into force on 1 January 2026. Compliance is required by 1 January 2027 for all operators.",
      },
    ],
    claims: [
      { section_key: "body", claim_kind: "FACT", claim_text: "[effective_date] The rule enters into force on 1 January 2026.", source_span: "enters into force on 1 January 2026", source_url: "https://example.gov/reg", slot_key: "effective_date" },
      { section_key: "body", claim_kind: "FACT", claim_text: "[primary_deadline] Compliance is required by 1 January 2027.", source_span: "by 1 January 2027", source_url: "https://example.gov/reg", slot_key: "primary_deadline" },
      { section_key: "body", claim_kind: "GAP", claim_text: "[jurisdictional_scope] not available from primary sources as of grounding", slot_key: "jurisdictional_scope" },
      { section_key: "body", claim_kind: "GAP", claim_text: "[penalty_summary] not available from primary sources as of grounding", slot_key: "penalty_summary" },
    ],
  };
}

test("baseline payload is GREEN: valid, no failures, recommended_status=verified", () => {
  const r = validateMintPayload(basePayload());
  assert.deepEqual(r.failures, []);
  assert.equal(r.valid, true);
  assert.equal(r.recommended_status, "verified");
  assert.equal(r.gate_a.orphan_count, 0);
});

// ── C1 ──────────────────────────────────────────────────────────────────
test("C1 RED: missing source.id -> missing_source_id", () => {
  const p = basePayload();
  p.source.id = "";
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 1 && f.reason === "missing_source_id"));
  assert.equal(r.valid, false);
});

test("C1 RED: source status suspended -> source_not_active", () => {
  const p = basePayload();
  p.source.status = "suspended";
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 1 && f.reason === "source_not_active"));
});

test("C1 RED: no base_tier and no tier_override -> source_tier_null", () => {
  const p = basePayload();
  p.source.base_tier = null;
  p.source.tier_override = null;
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 1 && f.reason === "source_tier_null"));
});

// ── C2 ──────────────────────────────────────────────────────────────────
test("C2 RED: no non-blank section content -> no_section_content (fail-close, migration 119)", () => {
  const p = basePayload();
  p.sections = [{ section_key: "body", section_order: 1, content_md: "" }];
  const r = validateMintPayload(p);
  assert.deepEqual(r.failures, [{ criterion: 2, reason: "no_section_content" }]);
});

test("C2 RED: a citation URL on an unregistered host -> ungrounded_url", () => {
  const p = basePayload();
  p.sections[0].content_md += " also see https://not-a-known-host.example/page";
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 2 && f.reason === "ungrounded_url"));
});

test("C2 GREEN: canonicalization tolerates www./trailing-slash/markdown-emphasis (migration 150)", () => {
  const p = basePayload();
  p.sections[0].content_md = "The rule applies as described. *https://www.example.gov/reg/*";
  const r = validateMintPayload(p);
  assert.ok(!r.failures.some((f) => f.criterion === 2));
});

// ── C3 ──────────────────────────────────────────────────────────────────
test("C3 RED: FACT with empty source_span -> fact_missing_source_span", () => {
  const p = basePayload();
  p.claims[0].source_span = "";
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 3 && f.reason === "fact_missing_source_span"));
});

test("C3 RED: FACT span not verbatim in the cited source's fetched text -> fact_span_not_in_source", () => {
  const p = basePayload();
  p.claims[0].source_span = "a sentence that never appears in the fetched text";
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 3 && f.reason === "fact_span_not_in_source"));
});

test("C3 RED: FACT below the reg-family authority floor (tier 5 source, floor is 2) -> fact_below_authority_floor", () => {
  const p = basePayload();
  p.source.base_tier = 5;
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 3 && f.reason === "fact_below_authority_floor"));
});

test("C3 RED: FACT carrying a non-null mint_hold_reason -> fact_mint_hold (migration 206)", () => {
  const p = basePayload();
  p.claims[0].mint_hold_reason = "S-CONFLATE";
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 3 && f.reason === "fact_mint_hold"));
});

// ── C4 ──────────────────────────────────────────────────────────────────
test("C4 RED: ANALYSIS claim text not carried by a recognized label paragraph -> analysis_missing_label_syntax", () => {
  const p = basePayload();
  p.sections[0].content_md += "\n\nThe workspace believes enforcement will tighten next year.";
  p.claims.push({ section_key: "body", claim_kind: "ANALYSIS", claim_text: "The workspace believes enforcement will tighten next year." });
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 4 && f.reason === "analysis_missing_label_syntax"));
});

test("C4 GREEN: a properly labeled ANALYSIS claim passes", () => {
  const p = basePayload();
  p.sections[0].content_md += "\n\n*Analytical inference:* enforcement will likely tighten next year.";
  p.claims.push({ section_key: "body", claim_kind: "ANALYSIS", claim_text: "enforcement will likely tighten next year." });
  const r = validateMintPayload(p);
  assert.ok(!r.failures.some((f) => f.criterion === 4 && f.reason === "analysis_missing_label_syntax"));
});

test("C4 RED: LEGAL claim with no *Legal Confirmation Required:* callout anywhere -> legal_not_routed_to_callout", () => {
  const p = basePayload();
  p.claims.push({ section_key: "body", claim_kind: "LEGAL", claim_text: "Counsel should confirm the exemption applies." });
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 4 && f.reason === "legal_not_routed_to_callout"));
});

test("C4 RED: unlabeled strong-modal prose with no label, no callout, no FACT in that section -> unlabeled_assertion", () => {
  const p = basePayload();
  p.sections.push({ section_key: "extra", section_order: 2, content_md: "Operators must register before shipment." });
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 4 && f.reason === "unlabeled_assertion" && f.section_key === "extra"));
});

// ── C5 ──────────────────────────────────────────────────────────────────
test("C5 RED: a required slot with zero covering FACT/GAP claims -> missing_required_slot", () => {
  const p = basePayload();
  p.claims = p.claims.filter((c) => c.slot_key !== "penalty_summary");
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 5 && f.reason === "missing_required_slot" && f.slot_key === "penalty_summary"));
});

// ── C6 ──────────────────────────────────────────────────────────────────
test("C6 RED: blank full_brief -> missing_full_brief", () => {
  const p = basePayload();
  p.item.full_brief = "   ";
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === 6 && f.reason === "missing_full_brief"));
});

// ── C7 (Gate A) ─────────────────────────────────────────────────────────
test("C7 RED: a factual token in full_brief with no covering FACT span -> gate_a_unproven_or_stale", () => {
  const p = basePayload();
  p.item.full_brief += " The fee is set at 12%.";
  const r = validateMintPayload(p);
  const f = r.failures.find((x) => x.criterion === 7 && x.reason === "gate_a_unproven_or_stale");
  assert.ok(f, "expected a Gate A orphan failure");
  assert.ok(f.orphans.some((o) => o.token === "12%"));
});

test("C7 GREEN: adding the covering FACT span clears the Gate A orphan", () => {
  const p = basePayload();
  p.item.full_brief += " The fee is set at 12%.";
  p.claims.push({ section_key: "body", claim_kind: "FACT", claim_text: "[penalty_summary] The fee is set at 12%.", source_span: "12%", source_url: "https://example.gov/reg" });
  p.search_results[0].result_content += " The fee is set at 12% of the shipment value.";
  const r = validateMintPayload(p);
  assert.ok(!r.failures.some((f) => f.criterion === 7));
});

// ── kit-level structural guard ──────────────────────────────────────────
test("kit RED: a claim referencing an unknown section_key is flagged (not a live C1-C7 number)", () => {
  const p = basePayload();
  p.claims.push({ section_key: "does-not-exist", claim_kind: "GAP", claim_text: "[x] stray" });
  const r = validateMintPayload(p);
  assert.ok(r.failures.some((f) => f.criterion === "kit" && f.reason === "claim_references_unknown_section_key"));
});

// ── canonicalize-citation-url unit ───────────────────────────────────────
test("canonicalizeCitationUrl matches migration 150's SQL: lowercase, strip */`, strip www., strip trailing /.,;:", () => {
  assert.equal(canonicalizeCitationUrl("HTTPS://WWW.Example.GOV/Reg/"), "https://example.gov/reg");
  assert.equal(canonicalizeCitationUrl("https://example.gov/reg*"), "https://example.gov/reg");
  assert.equal(canonicalizeCitationUrl("https://example.gov/reg."), "https://example.gov/reg");
  assert.equal(canonicalizeCitationUrl("https://example.gov/reg"), "https://example.gov/reg");
});
