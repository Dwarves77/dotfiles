// timeline-mirror-format-gate.test.mjs -- D31 (lane L20, defect-fix-plan-2026-09-12). Proves schema.mjs's
// MIRROR (c) is now FORMAT-GATED: before this fix it checked every entry, of every format_type, for a
// "Confirmed Regulatory Timeline" heading only -- so a market_signal_brief/research_summary/
// operations_profile/technology_profile entry could pass this mirror ONLY by adding a dummy regulatory
// heading its own format does not have (the exact defect the batch-007 exemplars 45006684 and 0781a8c0
// hit, per defect-fix-plan-2026-09-12's own D31 entry). One RED-then-GREEN pair per non-regulatory format:
// a dated line inside the format's OWN mapped timeline section (TIMELINE_SECTION_BY_FORMAT,
// src/lib/agent/formats/timeline-section.mjs) validates; the SAME line sitting in a different section
// fails, and the refusal names the format's own mapped section heading, never "Confirmed Regulatory
// Timeline". record-briefs.test.mjs's own "timeline mirror" describe block keeps proving the regulatory
// path is unchanged; this file is additive, not a replacement.
//
// node:test + node:assert/strict only, plus a relative import of schema.mjs -- no npm dependency,
// portable to the no-npm-ci discipline job (glob-portability.test.mjs's own rule), same posture as
// record-briefs.test.mjs.
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { validateRecordBriefsFile } from "./schema.mjs";

const ITEM_ID = "22222222-2222-2222-2222-222222222222";

function validMetadata(overrides = {}) {
  return {
    severity: "MONITORING",
    priority: "LOW",
    urgency_tier: "stable",
    format_type: "market_signal_brief",
    topic_tags: ["emissions"],
    signal_band: null,
    theme: null,
    what_is_it: "A signal about a market shift affecting freight forwarders.",
    why_matters: "Affects freight forwarders handling multi-modal cargo.",
    key_data: ["12 August 2026 pilot conclusion"],
    cost_mechanism: null,
    requirement_trajectory: null,
    penalty_range: null,
    enforcement_body: null,
    operational_scenario_tags: [],
    compliance_object_tags: ["freight-forwarder"],
    related_items: [],
    intersection_summary: null,
    sources_used: [],
    regeneration_skill_version: "2026-09-13",
    ...overrides,
  };
}

function validClaim(overrides = {}) {
  return {
    slot_key: "timeline_event",
    claim_kind: "FACT",
    claim_text: "[timeline_event] The captured source states, verbatim: «12 August 2026»",
    source_span: "12 August 2026",
    source_url: "https://example.org/source",
    section: "3",
    ...overrides,
  };
}

// One fixture per non-regulatory format: its OWN mapped timeline-section heading (D31's own per-format
// table) and canonical section key (src/lib/agent/formats/*.ts's own SECTIONS array -- see that table's
// header in timeline-section.mjs for the citation of which file each heading was read from).
const FORMAT_FIXTURES = [
  {
    formatType: "market_signal_brief",
    key: "3",
    heading: "Expected Trajectory and Conversion Triggers",
    otherKey: "1",
    otherHeading: "What's Moving and What Triggered It",
  },
  {
    formatType: "research_summary",
    key: "5",
    heading: "What the Finding Does Not Resolve",
    otherKey: "2",
    otherHeading: "Why This Finding Matters Operationally and Commercially",
  },
  {
    formatType: "operations_profile",
    key: "7",
    heading: "Pending Changes That Shift the Calculus",
    otherKey: "1",
    otherHeading: "Operational Cost Baseline for the Region",
  },
  {
    formatType: "technology_profile",
    key: "7",
    heading: "Time-to-Market, Procurement Window, and Action",
    otherKey: "1",
    otherHeading: "What's Being Tested or Deployed and By Whom",
  },
];

const DATED_LINE = "- 12 August 2026: The pilot program concludes and the signal is expected to intensify.";
const POOL_TEXT = "The pilot program concludes on 12 August 2026, at which point the signal is expected to intensify.";

for (const { formatType, key, heading, otherHeading } of FORMAT_FIXTURES) {
  describe(`validateRecordBriefsFile: timeline mirror is format-gated for ${formatType}`, () => {
    test(`a dated line inside ${formatType}'s own mapped section (${JSON.stringify(heading)}, key "${key}") validates`, () => {
      const entry = {
        item_id: ITEM_ID,
        source_pool_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b85",
        body: `# ${heading}\n\n${DATED_LINE}\n`,
        metadata: validMetadata({ format_type: formatType }),
        claims: [validClaim({ section: key })],
      };
      const file = { batch: "record-briefs-l20-test", generated_at: "2026-09-13T00:00:00Z", entries: [entry] };
      const r = validateRecordBriefsFile(file, { poolTextByItemId: { [ITEM_ID]: POOL_TEXT } });
      assert.equal(r.ok, true, `expected ok, got: ${JSON.stringify(r.ok ? [] : r.errors)}`);
    });

    test(`the SAME dated line sitting in a DIFFERENT section (not ${formatType}'s own mapped section) is refused, naming ${JSON.stringify(heading)}`, () => {
      const entry = {
        item_id: ITEM_ID,
        source_pool_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b85",
        body: `# ${otherHeading}\n\n${DATED_LINE}\n`,
        metadata: validMetadata({ format_type: formatType }),
        claims: [validClaim({ section: key })],
      };
      const file = { batch: "record-briefs-l20-test", generated_at: "2026-09-13T00:00:00Z", entries: [entry] };
      const r = validateRecordBriefsFile(file, { poolTextByItemId: { [ITEM_ID]: POOL_TEXT } });
      assert.equal(r.ok, false, "expected the entry to be refused (the dated line is not in the format's own mapped section)");
      const msg = r.errors.find((e) => e.includes("timeline mirror"));
      assert.ok(msg, `expected a timeline mirror error, got: ${JSON.stringify(r.errors)}`);
      assert.ok(
        msg.includes(heading),
        `expected the refusal to name the format's OWN mapped section ${JSON.stringify(heading)}, got: ${msg}`,
      );
      assert.ok(
        !msg.includes("Confirmed Regulatory Timeline"),
        `a non-regulatory refusal must never name the regulatory heading, got: ${msg}`,
      );
    });

    test(`a stray "Confirmed Regulatory Timeline" heading does NOT satisfy ${formatType}'s own mirror (it is not this format's section)`, () => {
      const entry = {
        item_id: ITEM_ID,
        source_pool_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b85",
        body: `# Confirmed Regulatory Timeline\n\n${DATED_LINE}\n`,
        metadata: validMetadata({ format_type: formatType }),
        claims: [validClaim({ section: key, source_span: "this span never appears in the stray heading body" })],
      };
      const file = { batch: "record-briefs-l20-test", generated_at: "2026-09-13T00:00:00Z", entries: [entry] };
      const r = validateRecordBriefsFile(file, { poolTextByItemId: { [ITEM_ID]: POOL_TEXT } });
      assert.equal(r.ok, false, "a dummy regulatory heading must never satisfy a non-regulatory format's own timeline mirror");
      const msg = r.errors.find((e) => e.includes("timeline mirror"));
      assert.ok(msg, `expected a timeline mirror error, got: ${JSON.stringify(r.errors)}`);
      assert.ok(msg.includes(heading), `expected the refusal to name ${JSON.stringify(heading)}, got: ${msg}`);
    });
  });
}
