// record-briefs.test.mjs -- proves schema.mjs's pure validator. Importing this module never invokes any
// CLI (schema.mjs has none -- it is a pure validator, no main() / no argv parsing, per this task's own
// brief). node:test + node:assert/strict only, plus a relative import of the module under test -- no npm
// dependency, portable to the no-npm-ci discipline job (glob-portability.test.mjs's own rule).
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateRecordBriefsFile,
  validateRecordBriefsEntry,
  validateRecordBriefsClaim,
  buildSyntheticFrontmatter,
  buildSyntheticRawText,
} from "./schema.mjs";

const ITEM_ID = "11111111-1111-1111-1111-111111111111";
const POOL_TEXT =
  "This Regulation shall enter into force on 1 January 2027 and applies to all Member States. " +
  "Penalties for non-compliance may include fines of up to EUR 500,000.";

function validMetadata(overrides = {}) {
  return {
    severity: "MONITORING",
    priority: "LOW",
    urgency_tier: "stable",
    format_type: "regulatory_fact_document",
    topic_tags: ["emissions"],
    signal_band: null,
    theme: null,
    what_is_it: "A regulation about emissions reporting for ocean carriers.",
    why_matters: "Affects freight forwarders handling EU-bound cargo.",
    key_data: ["EUR 500000 maximum fine"],
    cost_mechanism: null,
    requirement_trajectory: null,
    penalty_range: "up to EUR 500,000",
    enforcement_body: null,
    operational_scenario_tags: [],
    compliance_object_tags: ["freight-forwarder"],
    related_items: [],
    intersection_summary: null,
    sources_used: [],
    regeneration_skill_version: "2026-09-11",
    ...overrides,
  };
}

// Fix round 1, finding 1: every claim now carries `section` (the canonical section key of the entry's own
// format_type) -- "2" is "What This Regulation Is and Why It Applies to the Workspace", the section
// validEntry's default body states this claim's span in (see baseBody below).
function validClaim(overrides = {}) {
  return {
    slot_key: "effective_date",
    claim_kind: "FACT",
    claim_text: "[effective_date] The captured source states, verbatim: «shall enter into force on 1 January 2027»",
    source_span: "shall enter into force on 1 January 2027",
    source_url: "https://example.org/reg",
    section: "2",
    ...overrides,
  };
}

// A compliant "Substantive Requirements" section body (fix round 1, finding 5: this section is now
// REQUIRED for every regulatory_fact_document entry, so every fixture needs one, not just the ones that
// deliberately test it): an inert sentence (no modal verb -- criterion 4 needs no label on it), the three
// qualification-absence notes (article-citing, fix round 1 finding 4), then the accounting line as the
// LAST content in the section (fix round 1, finding 3). No claims attach to it by default (K=0, M=0).
function compliantSubstantiveRequirementsBlock() {
  return (
    "# Substantive Requirements\n\n" +
    "This section addresses no additional obligations beyond those already stated above.\n\n" +
    "No phase-in is stated in Articles 1 to 12.\n" +
    "No exceptions are stated in Articles 1 to 12.\n" +
    "No scope limits are stated in Articles 1 to 12.\n" +
    "Obligations surveyed: 1; workspace-adjacent: 0; extracted as FACT: 0.\n"
  );
}

// The full base body every validEntry() starts from: section "2" (carries the default claim's span),
// section "14" (Confirmed Regulatory Timeline, MIRROR (c)'s own requirement), and section "8" (Substantive
// Requirements, MIRROR (d)/(e)'s own requirement) -- compliant by default so the "happy path" tests stay
// happy; a test exercising a NON-compliant Substantive Requirements section passes its own
// `substantiveRequirements` override (a full "# Substantive Requirements\n\n..." block, since it always
// sits last in the body with nothing after it to fold into).
function baseBody({ substantiveRequirements = compliantSubstantiveRequirementsBlock() } = {}) {
  return (
    "# What This Regulation Is and Why It Applies to the Workspace\n\n" +
    "This instrument shall enter into force on 1 January 2027 and sets out reporting obligations.\n\n" +
    "# Confirmed Regulatory Timeline\n\n- 1 January 2027: Regulation enters into force.\n\n" +
    substantiveRequirements
  );
}

function validEntry(overrides = {}) {
  return {
    item_id: ITEM_ID,
    source_pool_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b85",
    body: baseBody(),
    metadata: validMetadata(),
    claims: [validClaim()],
    ...overrides,
  };
}

function validFile(entries = [validEntry()]) {
  return {
    batch: "record-briefs-001",
    generated_at: "2026-09-11T00:00:00Z",
    entries,
  };
}

const POOL = { [ITEM_ID]: POOL_TEXT };

// ── the three brief-named RED-then-GREEN cases ─────────────────────────────────────────────────────

describe("validateRecordBriefsFile: valid entry", () => {
  test("a fully valid file validates ok, with entries echoed back", () => {
    const r = validateRecordBriefsFile(validFile(), { poolTextByItemId: POOL });
    assert.equal(r.ok, true, `expected ok, got: ${JSON.stringify(r.ok ? [] : r.errors)}`);
    assert.equal(r.entries.length, 1);
    assert.equal(r.entries[0].item_id, ITEM_ID);
  });
});

describe("validateRecordBriefsFile: FACT span not in the pool text", () => {
  test("a FACT claim whose source_span is not verbatim in the pool text fails, naming the item", () => {
    const entry = validEntry({ claims: [validClaim({ source_span: "this sentence never appears anywhere" })] });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, false);
    const msg = r.errors.find((e) => e.includes("not a verbatim substring"));
    assert.ok(msg, `expected a verbatim-mismatch error, got: ${JSON.stringify(r.errors)}`);
    assert.match(msg, new RegExp(ITEM_ID));
  });

  test("a FACT claim with no pool text at all for its item fails the same way (missing key, not a crash)", () => {
    const entry = validEntry();
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: {} });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("not a verbatim substring") && e.includes(ITEM_ID)));
  });
});

// ── task 6.1b (brief-chain-build-plan-2026-09-11): the three new pre-write refusals, born from the
// 10-item pilot batch that generated and sectioned cleanly, then quarantined 10/10 at the ground step for
// defects this validator now catches before any grounding cost is spent. ─────────────────────────────

describe("validateRecordBriefsFile: Gate A mirror", () => {
  test("a figure/date token in the body with no covering FACT claim fails, naming the token and its class", () => {
    const entry = validEntry({
      body:
        validEntry().body +
        "\n\n# Issues Requiring Immediate Action\n\n*Specific deadline not confirmed as of 2027-03-01.*\n",
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, false);
    const msg = r.errors.find((e) => e.includes("Gate A mirror"));
    assert.ok(msg, `expected a Gate A mirror error, got: ${JSON.stringify(r.errors)}`);
    assert.match(msg, /2027-03-01/);
    assert.match(msg, /deadline/);
  });

  test("a token covered by a FACT claim's own text/span never fails (the happy path)", () => {
    const r = validateRecordBriefsFile(validFile(), { poolTextByItemId: POOL });
    assert.equal(r.ok, true, `expected ok, got: ${JSON.stringify(r.ok ? [] : r.errors)}`);
  });
});

describe("validateRecordBriefsFile: criterion 4 mirror (unlabeled assertion)", () => {
  test("a section matching the unlabeled-modal pattern with no analysis label or legal callout fails, naming the section", () => {
    const entry = validEntry({
      body: baseBody({ substantiveRequirements: "# Substantive Requirements\n\nThe operator must register with the agency.\n" }),
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, false);
    const msg = r.errors.find((e) => e.includes("criterion 4 mirror"));
    assert.ok(msg, `expected a criterion 4 mirror error, got: ${JSON.stringify(r.errors)}`);
    assert.match(msg, /Substantive Requirements/);
  });

  test("the SAME assertion labeled with a recognised analysis label passes", () => {
    const entry = validEntry({
      body: baseBody({
        substantiveRequirements:
          "# Substantive Requirements\n\n*Analytical inference:* The operator must register with the agency.\n\n" +
          "No phase-in is stated in Articles 1 to 12.\nNo exceptions are stated in Articles 1 to 12.\n" +
          "No scope limits are stated in Articles 1 to 12.\nObligations surveyed: 1; workspace-adjacent: 0; extracted as FACT: 0.\n",
      }),
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, true, `expected ok, got: ${JSON.stringify(r.ok ? [] : r.errors)}`);
  });

  test("the SAME assertion behind the legal callout passes", () => {
    const entry = validEntry({
      body: baseBody({
        substantiveRequirements:
          "# Substantive Requirements\n\n*Legal Confirmation Required:* The operator must register with the agency.\n\n" +
          "No phase-in is stated in Articles 1 to 12.\nNo exceptions are stated in Articles 1 to 12.\n" +
          "No scope limits are stated in Articles 1 to 12.\nObligations surveyed: 1; workspace-adjacent: 0; extracted as FACT: 0.\n",
      }),
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, true, `expected ok, got: ${JSON.stringify(r.ok ? [] : r.errors)}`);
  });

  // Fix round 1, finding 2: content outside every canonical section (a preamble, a non-canonical heading
  // standing alone) is never checked -- the real write path (extractCanonicalSections's own
  // number-first-then-heading-then-alts walk) never persists it either, so a criterion-4 "violation"
  // there would be a false positive the live database can never reproduce.
  test("content in the preamble before the first heading is NEVER checked (the real write path never persists it)", () => {
    const entry = validEntry({ body: "The operator must register before shipping.\n\n" + validEntry().body });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, true, `expected ok (preamble content is discarded by the real write path too), got: ${JSON.stringify(r.ok ? [] : r.errors)}`);
  });

  test("content under a non-canonical heading (not one of the format's own section names) is NEVER checked either", () => {
    const entry = validEntry({
      body:
        "# Regulation Brief\n\nThis instrument sets out reporting obligations." +
        "\n\n# What This Regulation Is and Why It Applies to the Workspace\n\nThis instrument shall enter into force on 1 January 2027 and sets out reporting obligations." +
        "\n\n# A heading that is not a canonical section name\n\nThe operator must register with the agency." +
        "\n\n# Confirmed Regulatory Timeline\n\n- 1 January 2027: Regulation enters into force.\n\n" +
        compliantSubstantiveRequirementsBlock(),
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, true, `expected ok, got: ${JSON.stringify(r.ok ? [] : r.errors)}`);
  });

  // Fix round 1, finding 2's own worked example: the write path's H1-matched section runs to the NEXT
  // H1, folding in any H2/H3+ sub-heading -- so a label anywhere in that combined text satisfies the
  // WHOLE section, wherever the unlabeled modal verb sits. A bespoke finer split (the prior version of
  // this mirror) would isolate the two and wrongly refuse this -- the exact over-refusal the fix closes.
  test("an H1 section's early unlabeled sentence is satisfied by a label on its own H2/H3 sub-heading, matching the live write path's folded row", () => {
    const entry = validEntry({
      body: baseBody({
        substantiveRequirements:
          "# Substantive Requirements\n\nThe operator must register with the agency.\n\n" +
          "### Detail sub-point\n\n*Analytical inference:* further detail on the registration process.\n\n" +
          "No phase-in is stated in Articles 1 to 12.\nNo exceptions are stated in Articles 1 to 12.\n" +
          "No scope limits are stated in Articles 1 to 12.\nObligations surveyed: 1; workspace-adjacent: 0; extracted as FACT: 0.\n",
      }),
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, true, `expected ok (the H3 sub-heading folds into the parent H1 row), got: ${JSON.stringify(r.ok ? [] : r.errors)}`);
  });

  test("this mirror is STRICTER than the live DB rule: a FACT claim attached to the section is NOT an escape here", () => {
    // The live validate_item_provenance criterion 4 also accepts a FACT claim carrying the same
    // section_key as an alternative to a label -- this validator has no section_key/claim attachment to
    // check pre-write, so the unlabeled assertion still fails even though a FACT claim exists elsewhere
    // in the same entry.
    const entry = validEntry({
      body: baseBody({ substantiveRequirements: "# Substantive Requirements\n\nThe operator must register with the agency.\n" }),
      claims: [
        validClaim(),
        { slot_key: null, claim_kind: "FACT", claim_text: "the fine is up to EUR 500,000", source_span: "fines of up to EUR 500,000", source_url: "https://example.org/reg", section: "8" },
      ],
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("criterion 4 mirror")));
  });
});

describe("validateRecordBriefsFile: timeline mirror", () => {
  test("a body with no Confirmed Regulatory Timeline section fails, naming the missing heading", () => {
    const entry = validEntry({ body: "# Regulation Brief\n\nThis instrument sets out reporting obligations." });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, false);
    const msg = r.errors.find((e) => e.includes("timeline mirror"));
    assert.ok(msg, `expected a timeline mirror error, got: ${JSON.stringify(r.errors)}`);
    assert.match(msg, /no "Confirmed Regulatory Timeline" section/);
  });

  test("a Confirmed Regulatory Timeline section whose only line fails to parse (no colon/dash separator) fails, printing the parser's view", () => {
    const entry = validEntry({
      body:
        "# Regulation Brief\n\nThis instrument sets out reporting obligations." +
        "\n\n# Confirmed Regulatory Timeline\n\n- 1 January 2027 regulation enters into force with no separator\n",
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, false);
    const msg = r.errors.find((e) => e.includes("timeline mirror"));
    assert.ok(msg, `expected a timeline mirror error, got: ${JSON.stringify(r.errors)}`);
    assert.match(msg, /ZERO rows/);
  });

  test("a colon-separated entry (the lane's own shape, no dash glyph) counts as at least one row", () => {
    const r = validateRecordBriefsFile(validFile(), { poolTextByItemId: POOL }); // validEntry's default body
    assert.equal(r.ok, true, `expected ok, got: ${JSON.stringify(r.ok ? [] : r.errors)}`);
  });

  test("the section-sign heading variant (\\u00A714 ...) is also accepted", () => {
    const entry = validEntry({
      body:
        "# What This Regulation Is and Why It Applies to the Workspace\n\nThis instrument shall enter into force on 1 January 2027 and sets out reporting obligations." +
        `\n\n# ${String.fromCharCode(0xa7)}14 Confirmed Regulatory Timeline\n\n- 1 January 2027: Regulation enters into force.\n\n` +
        compliantSubstantiveRequirementsBlock(),
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, true, `expected ok, got: ${JSON.stringify(r.ok ? [] : r.errors)}`);
  });
});

// ── task 6.2b (brief-chain-build-plan-2026-09-11): the two more pre-write refusals from
// task-6.1-audit.md's ranked fixes 1 and 2, born from the pilot's own numbers -- CLP (2.59M char pool)
// and Environmental Permitting 2016 (965k char pool) returned 4-5 FACT claims in "Substantive
// Requirements" with no accounting of what was surveyed, and all ten pilot items scored 0/10 on
// per-year trajectory and calculation-basis language with no way to tell a thin source apart from a
// lane that did not look far enough. Fix round 1 (review-6.2b.md) closed five findings against this
// pair of mirrors -- see schema.mjs's own RECORD_BRIEFS_SCHEMA_VERSION comment for the full list. ────

describe("validateRecordBriefsFile: claim section attachment (fix round 1, finding 1)", () => {
  test("a claim missing .section fails at the per-claim shape check", () => {
    const errors = validateRecordBriefsClaim(
      { slot_key: null, claim_kind: "GAP", claim_text: "x", source_span: null, source_url: null },
      0,
      ITEM_ID,
      POOL_TEXT,
    );
    assert.ok(errors.some((e) => e.includes("section must be a non-empty string")), JSON.stringify(errors));
  });

  test("a claim whose .section is not a canonical key for the entry's format_type fails, naming the valid keys", () => {
    const entry = validEntry({ claims: [validClaim({ section: "99" })] });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, false);
    const msg = r.errors.find((e) => e.includes("is not a canonical section key"));
    assert.ok(msg, `expected a bad-section-key error, got: ${JSON.stringify(r.errors)}`);
    assert.match(msg, /"99"/);
  });

  test("a claim whose source_span is verbatim in the pool but NOT present in its declared section's own text fails", () => {
    // The default claim's span is about the effective date (section "2"'s own content) -- declaring it
    // as section "14" (Confirmed Regulatory Timeline, whose own text never states that span) must fail.
    const entry = validEntry({ claims: [validClaim({ section: "14" })] });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, false);
    const msg = r.errors.find((e) => e.includes("is not present in section") && e.includes('"14"'));
    assert.ok(msg, `expected a span-not-in-section error, got: ${JSON.stringify(r.errors)}`);
  });

  test("a claim whose section is canonical and whose source_span IS present in that section's own text passes (the happy path)", () => {
    const r = validateRecordBriefsFile(validFile(), { poolTextByItemId: POOL }); // validEntry's default claim: section "2"
    assert.equal(r.ok, true, `expected ok, got: ${JSON.stringify(r.ok ? [] : r.errors)}`);
  });
});

describe("validateRecordBriefsFile: depth-accounting mirror (task-6.1-audit.md fix 1)", () => {
  // Fix round 1, finding 1: attachment is now the explicit `.section` field, not text-containment --
  // this claim declares section "8" (Substantive Requirements) directly.
  const attachedClaim = {
    slot_key: null,
    claim_kind: "FACT",
    claim_text: "the operator must register with the agency",
    source_span: "operator must register with the agency",
    source_url: "https://example.org/reg",
    section: "8",
  };
  // attachedClaim's own source_span must be verbatim in the item's pool text (record-facts.mjs's
  // assertVerbatim) -- POOL_TEXT (defined above) never states it.
  const POOL_WITH_REGISTRATION_DUTY = { [ITEM_ID]: `${POOL_TEXT} The operator must register with the agency.` };

  test("a Substantive Requirements section with no accounting line fails, naming the missing form", () => {
    const entry = validEntry({
      body: baseBody({
        substantiveRequirements:
          "# Substantive Requirements\n\n*Analytical inference:* the operator must register with the agency.\n\n" +
          "No phase-in is stated in Articles 1 to 12.\nNo exceptions are stated in Articles 1 to 12.\nNo scope limits are stated in Articles 1 to 12.\n",
      }),
      claims: [validClaim(), attachedClaim],
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL_WITH_REGISTRATION_DUTY });
    assert.equal(r.ok, false);
    const msg = r.errors.find((e) => e.includes("depth accounting") && e.includes("missing"));
    assert.ok(msg, `expected a missing-accounting-line error, got: ${JSON.stringify(r.errors)}`);
  });

  // Fix round 1, finding 2's own explicit ask: the qualification mirror must still fire when the
  // depth-accounting line itself is missing -- the state of every currently-applied batch.
  test("qualification refusals fire even when the depth-accounting line itself is missing (fix round 1, finding 2)", () => {
    const entry = validEntry({
      body: baseBody({
        substantiveRequirements: "# Substantive Requirements\n\n*Analytical inference:* the operator must register with the agency.\n",
      }),
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("depth accounting") && e.includes("missing")), JSON.stringify(r.errors));
    assert.ok(r.errors.some((e) => e.includes("qualification accounting") && e.includes("trajectory")), JSON.stringify(r.errors));
    assert.ok(r.errors.some((e) => e.includes("qualification accounting") && e.includes("exception")), JSON.stringify(r.errors));
    assert.ok(r.errors.some((e) => e.includes("qualification accounting") && e.includes("scope")), JSON.stringify(r.errors));
  });

  test("extracted-as-FACT overstating the entry's own attached FACT claims fails, naming both counts", () => {
    const entry = validEntry({
      body: baseBody({
        substantiveRequirements:
          "# Substantive Requirements\n\n*Analytical inference:* the operator must register with the agency.\n\n" +
          "No phase-in is stated in Articles 1 to 12.\nNo exceptions are stated in Articles 1 to 12.\nNo scope limits are stated in Articles 1 to 12.\n" +
          "Obligations surveyed: 3; workspace-adjacent: 3; extracted as FACT: 3.\n",
      }),
      claims: [validClaim(), attachedClaim],
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL_WITH_REGISTRATION_DUTY });
    assert.equal(r.ok, false);
    const msg = r.errors.find((e) => e.includes("depth accounting") && e.includes("overstates"));
    assert.ok(msg, `expected an overstated-K error, got: ${JSON.stringify(r.errors)}`);
    assert.match(msg, /extracted as FACT: 3/);
    assert.match(msg, /1 FACT/);
  });

  test("extracted-as-FACT below workspace-adjacent with no Shortfall line fails", () => {
    const entry = validEntry({
      body: baseBody({
        substantiveRequirements:
          "# Substantive Requirements\n\n*Analytical inference:* the operator must register with the agency.\n\n" +
          "No phase-in is stated in Articles 1 to 12.\nNo exceptions are stated in Articles 1 to 12.\nNo scope limits are stated in Articles 1 to 12.\n" +
          "Obligations surveyed: 4; workspace-adjacent: 3; extracted as FACT: 1.\n",
      }),
      claims: [validClaim(), attachedClaim],
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL_WITH_REGISTRATION_DUTY });
    assert.equal(r.ok, false);
    const msg = r.errors.find((e) => e.includes("depth accounting") && e.includes("Shortfall"));
    assert.ok(msg, `expected a missing-shortfall error, got: ${JSON.stringify(r.errors)}`);
  });

  test("the SAME shortfall passes once a Shortfall line names a reason", () => {
    const entry = validEntry({
      body: baseBody({
        substantiveRequirements:
          "# Substantive Requirements\n\n*Analytical inference:* the operator must register with the agency.\n\n" +
          "No phase-in is stated in Articles 1 to 12.\nNo exceptions are stated in Articles 1 to 12.\nNo scope limits are stated in Articles 1 to 12.\n" +
          "Obligations surveyed: 4; workspace-adjacent: 3; extracted as FACT: 1.\n" +
          "Shortfall: the other two obligations duplicate the registration duty already stated.\n",
      }),
      claims: [validClaim(), attachedClaim],
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL_WITH_REGISTRATION_DUTY });
    assert.equal(r.ok, true, `expected ok, got: ${JSON.stringify(r.ok ? [] : r.errors)}`);
  });

  // Fix round 1, finding 3: the accounting line must be the LAST content in the section -- a lane that
  // tallies honestly and then keeps writing past the tally (a new, uncounted obligation) is refused.
  test("an obligation sentence following the accounting line fails (fix round 1, finding 3)", () => {
    const entry = validEntry({
      body: baseBody({
        substantiveRequirements:
          "# Substantive Requirements\n\n*Analytical inference:* the operator must register with the agency.\n\n" +
          "No phase-in is stated in Articles 1 to 12.\nNo exceptions are stated in Articles 1 to 12.\nNo scope limits are stated in Articles 1 to 12.\n" +
          "Obligations surveyed: 1; workspace-adjacent: 1; extracted as FACT: 1.\n" +
          "*Analytical inference:* a further obligation the tally above never counted.\n",
      }),
      claims: [validClaim(), attachedClaim],
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL_WITH_REGISTRATION_DUTY });
    assert.equal(r.ok, false);
    const msg = r.errors.find((e) => e.includes("depth accounting") && e.includes("content follows the accounting line"));
    assert.ok(msg, `expected a trailing-content error, got: ${JSON.stringify(r.errors)}`);
  });

  test("a Shortfall line immediately after the accounting line is the one permitted exception to 'nothing follows'", () => {
    const entry = validEntry({
      body: baseBody({
        substantiveRequirements:
          "# Substantive Requirements\n\n*Analytical inference:* the operator must register with the agency.\n\n" +
          "No phase-in is stated in Articles 1 to 12.\nNo exceptions are stated in Articles 1 to 12.\nNo scope limits are stated in Articles 1 to 12.\n" +
          "Obligations surveyed: 4; workspace-adjacent: 3; extracted as FACT: 1.\n" +
          "Shortfall: the other two obligations duplicate the registration duty already stated.\n",
      }),
      claims: [validClaim(), attachedClaim],
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL_WITH_REGISTRATION_DUTY });
    assert.equal(r.ok, true, `expected ok (a Shortfall line is permitted), got: ${JSON.stringify(r.ok ? [] : r.errors)}`);
  });

  // Fix round 1, finding 5: a regulatory_fact_document entry with no extractable Substantive Requirements
  // section at all is now refused (a regulatory brief without that section is not complete) -- the shape
  // of the real chunk-1 item review-6.2b.md's own Finding 6 named.
  test("a regulatory_fact_document entry with no extractable Substantive Requirements section fails (fix round 1, finding 5)", () => {
    const entry = validEntry({
      body:
        "# What This Regulation Is and Why It Applies to the Workspace\n\n" +
        "This instrument shall enter into force on 1 January 2027 and sets out reporting obligations." +
        "\n\n# Confirmed Regulatory Timeline\n\n- 1 January 2027: Regulation enters into force.\n",
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, false);
    const msg = r.errors.find((e) => e.includes("depth accounting") && e.includes("is not present"));
    assert.ok(msg, `expected a section-not-present error, got: ${JSON.stringify(r.errors)}`);
  });

  // The pilot's own shape (task-6.1-audit.md finding 2): CLP (2.59M chars) and Environmental Permitting
  // 2016 (965k chars) each returned 4-5 FACT claims with no accounting at all. This fixture proves the
  // large-pool floor fires even when K equals workspace-adjacent (no ordinary shortfall triggered).
  test("a source pool over 200,000 chars with extracted-as-FACT under 5 and no Shortfall line fails", () => {
    const spans = ["clp obligation span one", "clp obligation span two", "clp obligation span three", "clp obligation span four"];
    const largePoolText = "filler text ".repeat(20_000) + spans.join(". ") + ". " + POOL_TEXT;
    assert.ok(largePoolText.length > 200_000, "fixture pool must exceed the 200,000-char floor");
    const claims = spans.map((s) => ({ slot_key: null, claim_kind: "FACT", claim_text: s, source_span: s, source_url: "https://example.org/reg", section: "8" }));
    const substantiveRequirements =
      "# Substantive Requirements\n\n*Analytical inference:* " +
      spans.join(". ") +
      ".\n\nNo phase-in is stated in Articles 1 to 12.\nNo exceptions are stated in Articles 1 to 12.\nNo scope limits are stated in Articles 1 to 12.\n" +
      "Obligations surveyed: 60; workspace-adjacent: 4; extracted as FACT: 4.\n";
    const entry = validEntry({ body: baseBody({ substantiveRequirements }), claims: [validClaim(), ...claims] });
    const pool = { [ITEM_ID]: largePoolText };
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: pool });
    assert.equal(r.ok, false);
    const msg = r.errors.find((e) => e.includes("depth accounting") && e.includes("large-pool"));
    assert.ok(msg, `expected a large-pool error, got: ${JSON.stringify(r.errors)}`);

    const entryWithShortfall = validEntry({
      body: baseBody({
        substantiveRequirements: substantiveRequirements.replace(
          "extracted as FACT: 4.\n",
          "extracted as FACT: 4.\nShortfall: the remaining obligations fall outside workspace-adjacent activity.\n",
        ),
      }),
      claims: [validClaim(), ...claims],
    });
    const r2 = validateRecordBriefsFile(validFile([entryWithShortfall]), { poolTextByItemId: pool });
    assert.equal(r2.ok, true, `expected ok once a Shortfall line is added, got: ${JSON.stringify(r2.ok ? [] : r2.errors)}`);
  });
});

describe("validateRecordBriefsFile: qualification-accounting mirror (task-6.1-audit.md fix 2)", () => {
  test("no trajectory/exception/scope capture and no absence notes fails all three, naming each category", () => {
    const entry = validEntry({
      body: baseBody({
        substantiveRequirements:
          "# Substantive Requirements\n\n*Analytical inference:* the operator must register with the agency.\n\n" +
          "Obligations surveyed: 1; workspace-adjacent: 0; extracted as FACT: 0.\n",
      }),
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("qualification accounting") && e.includes("trajectory")), JSON.stringify(r.errors));
    assert.ok(r.errors.some((e) => e.includes("qualification accounting") && e.includes("exception")), JSON.stringify(r.errors));
    assert.ok(r.errors.some((e) => e.includes("qualification accounting") && e.includes("scope")), JSON.stringify(r.errors));
  });

  test("the SAME section passes once all three absence notes are added (no capture needed when genuinely absent)", () => {
    const r = validateRecordBriefsFile(validFile(), { poolTextByItemId: POOL }); // validEntry's default body is already compliant
    assert.equal(r.ok, true, `expected ok, got: ${JSON.stringify(r.ok ? [] : r.errors)}`);
  });

  test("a metadata.requirement_trajectory satisfies the trajectory check without the absence sentence", () => {
    const entry = validEntry({
      metadata: validMetadata({
        requirement_trajectory: {
          steps: [
            { date: "2030-01-01", value: "50%" },
            { date: "2035-01-01", value: "70%" },
          ],
        },
      }),
      body: baseBody({
        substantiveRequirements:
          "# Substantive Requirements\n\n*Analytical inference:* the operator must register with the agency.\n\n" +
          "No exceptions are stated in Articles 1 to 12.\nNo scope limits are stated in Articles 1 to 12.\n" +
          "Obligations surveyed: 1; workspace-adjacent: 0; extracted as FACT: 0.\n",
      }),
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, true, `expected ok, got: ${JSON.stringify(r.ok ? [] : r.errors)}`);
  });

  // Fix round 1, finding 4: capture now reads the claim's own verbatim source_span (never free-form
  // claim_text), and the span must be UNNEGATED.
  test("an attached FACT claim naming an unnegated exception in its source_span satisfies the exceptions check without the absence sentence", () => {
    const exceptionClaim = {
      slot_key: null,
      claim_kind: "FACT",
      claim_text: "the duty carries a carve-out for small shipments",
      source_span: "Shipments under 500kg are exempt from this requirement",
      source_url: "https://example.org/reg",
      section: "8",
    };
    const entry = validEntry({
      body: baseBody({
        substantiveRequirements:
          "# Substantive Requirements\n\n*Analytical inference:* the operator must register with the agency; " +
          "shipments under 500kg are exempt from this requirement.\n\n" +
          "No phase-in is stated in Articles 1 to 12.\nNo scope limits are stated in Articles 1 to 12.\n" +
          "Obligations surveyed: 1; workspace-adjacent: 0; extracted as FACT: 0.\n",
      }),
      claims: [validClaim(), exceptionClaim],
    });
    const pool = { [ITEM_ID]: `${POOL_TEXT} Shipments under 500kg are exempt from this requirement.` };
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: pool });
    assert.equal(r.ok, true, `expected ok, got: ${JSON.stringify(r.ok ? [] : r.errors)}`);
  });

  // Fix round 1, finding 4's own worked example: a NEGATED span must not satisfy "an exception is
  // captured" -- it asserts the opposite.
  test("a NEGATED exception span ('No party is exempt...') does NOT satisfy the exceptions check", () => {
    const negatedClaim = {
      slot_key: null,
      claim_kind: "FACT",
      claim_text: "no party is exempt from this requirement",
      source_span: "No party is exempt from this requirement",
      source_url: "https://example.org/reg",
      section: "8",
    };
    const entry = validEntry({
      body: baseBody({
        substantiveRequirements:
          "# Substantive Requirements\n\n*Analytical inference:* the operator must register with the agency; " +
          "no party is exempt from this requirement.\n\n" +
          "No phase-in is stated in Articles 1 to 12.\nNo scope limits are stated in Articles 1 to 12.\n" +
          "Obligations surveyed: 1; workspace-adjacent: 0; extracted as FACT: 0.\n",
      }),
      claims: [validClaim(), negatedClaim],
    });
    const pool = { [ITEM_ID]: `${POOL_TEXT} No party is exempt from this requirement.` };
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: pool });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("qualification accounting") && e.includes("exception")), JSON.stringify(r.errors));
  });

  // Fix round 1, finding 4: "does not apply" is genuinely restrictive language, not a negated scope claim
  // -- the negation window looks BEFORE the match, never at the match's own text, so this must still pass.
  test("'does not apply' (a genuine scope restriction, not a negated one) still satisfies the scope check", () => {
    const scopeClaim = {
      slot_key: null,
      claim_kind: "FACT",
      claim_text: "the duty does not apply to small consignments",
      source_span: "This Regulation does not apply to consignments under 500kg",
      source_url: "https://example.org/reg",
      section: "8",
    };
    const entry = validEntry({
      body: baseBody({
        substantiveRequirements:
          "# Substantive Requirements\n\n*Analytical inference:* the operator must register with the agency; " +
          "this Regulation does not apply to consignments under 500kg.\n\n" +
          "No phase-in is stated in Articles 1 to 12.\nNo exceptions are stated in Articles 1 to 12.\n" +
          "Obligations surveyed: 1; workspace-adjacent: 0; extracted as FACT: 0.\n",
      }),
      claims: [validClaim(), scopeClaim],
    });
    const pool = { [ITEM_ID]: `${POOL_TEXT} This Regulation does not apply to consignments under 500kg.` };
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: pool });
    assert.equal(r.ok, true, `expected ok, got: ${JSON.stringify(r.ok ? [] : r.errors)}`);
  });

  // Fix round 1, finding 4: the old fixed sentence ("No exceptions stated in the source.") is now refused
  // -- it must cite an article/section range.
  test("the old fixed absence sentence with no article citation no longer satisfies the check", () => {
    const entry = validEntry({
      body: baseBody({
        substantiveRequirements:
          "# Substantive Requirements\n\n*Analytical inference:* the operator must register with the agency.\n\n" +
          "No phase-in stated in the source.\nNo exceptions stated in the source.\nNo scope limits stated in the source.\n" +
          "Obligations surveyed: 1; workspace-adjacent: 0; extracted as FACT: 0.\n",
      }),
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("qualification accounting") && e.includes("trajectory")), JSON.stringify(r.errors));
    assert.ok(r.errors.some((e) => e.includes("qualification accounting") && e.includes("exception")), JSON.stringify(r.errors));
    assert.ok(r.errors.some((e) => e.includes("qualification accounting") && e.includes("scope")), JSON.stringify(r.errors));
  });
});

describe("validateRecordBriefsFile: metadata vocabulary miss", () => {
  test("an invalid severity value fails, naming the item and the field", () => {
    const entry = validEntry({ metadata: validMetadata({ severity: "NOT_A_REAL_SEVERITY" }) });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, false);
    const msg = r.errors.find((e) => e.includes("Invalid severity"));
    assert.ok(msg, `expected an Invalid severity error, got: ${JSON.stringify(r.errors)}`);
    assert.match(msg, new RegExp(ITEM_ID));
    assert.match(msg, /metadata:/);
  });

  test("an out-of-vocabulary topic_tags value fails via the SAME reused parser rule", () => {
    const entry = validEntry({ metadata: validMetadata({ topic_tags: ["not-a-real-topic"] }) });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("out-of-vocabulary")));
  });

  test("signal_band non-null while format_type is not market_signal_brief fails (the parser's own cross-field rule)", () => {
    const entry = validEntry({ metadata: validMetadata({ signal_band: "price" }) });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("signal_band may only be non-null")));
  });

  test("a severity/priority mismatch against the locked mapping fails", () => {
    const entry = validEntry({ metadata: validMetadata({ severity: "ACTION REQUIRED", priority: "LOW" }) });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("does not match the locked mapping")));
  });
});

// ── whole-file structural shape ─────────────────────────────────────────────────────────────────────

describe("validateRecordBriefsFile: whole-file shape", () => {
  test("a non-object file is rejected", () => {
    assert.equal(validateRecordBriefsFile([1, 2, 3]).ok, false);
    assert.equal(validateRecordBriefsFile(null).ok, false);
    assert.equal(validateRecordBriefsFile("x").ok, false);
  });

  test("entries not an array fails closed, without attempting per-entry checks", () => {
    const r = validateRecordBriefsFile({ batch: "b", generated_at: "2026-09-11T00:00:00Z", entries: "nope" });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("entries must be an array")));
  });

  test("missing batch/generated_at are reported", () => {
    const r = validateRecordBriefsFile({ entries: [] });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("batch must be")));
    assert.ok(r.errors.some((e) => e.includes("generated_at must be")));
  });

  test("an empty entries array is structurally valid (zero briefs is honest, not an error)", () => {
    const r = validateRecordBriefsFile(validFile([]));
    assert.equal(r.ok, true);
    assert.deepEqual(r.entries, []);
  });

  test("multiple entries collect errors from every entry, not just the first", () => {
    const bad1 = validEntry({ item_id: "22222222-2222-2222-2222-222222222222", source_pool_hash: "" });
    const bad2 = validEntry({ item_id: "33333333-3333-3333-3333-333333333333", body: "" });
    const r = validateRecordBriefsFile(validFile([bad1, bad2]), { poolTextByItemId: POOL });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("22222222") && e.includes("source_pool_hash")));
    assert.ok(r.errors.some((e) => e.includes("33333333") && e.includes("body must be")));
  });
});

// ── entry-level shape ────────────────────────────────────────────────────────────────────────────────

describe("validateRecordBriefsEntry", () => {
  test("item_id must be a UUID", () => {
    const errors = validateRecordBriefsEntry(validEntry({ item_id: "not-a-uuid" }), 0, { poolTextByItemId: POOL });
    assert.ok(errors.some((e) => e.includes("item_id must be a UUID")));
  });

  test("metadata that is not an object fails", () => {
    const errors = validateRecordBriefsEntry(validEntry({ metadata: "nope" }), 0, { poolTextByItemId: POOL });
    assert.ok(errors.some((e) => e.includes("metadata must be an object")));
  });

  test("claims that is not an array fails", () => {
    const errors = validateRecordBriefsEntry(validEntry({ claims: "nope" }), 0, { poolTextByItemId: POOL });
    assert.ok(errors.some((e) => e.includes("claims must be an array")));
  });
});

// ── claim-level shape ────────────────────────────────────────────────────────────────────────────────

describe("validateRecordBriefsClaim", () => {
  test("an invalid claim_kind fails", () => {
    const errors = validateRecordBriefsClaim(validClaim({ claim_kind: "OPINION" }), 0, ITEM_ID, POOL_TEXT);
    assert.ok(errors.some((e) => e.includes("claim_kind must be one of")));
  });

  test("a FACT claim missing source_span fails without attempting a verbatim check", () => {
    const errors = validateRecordBriefsClaim(validClaim({ source_span: null }), 0, ITEM_ID, POOL_TEXT);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /requires a non-empty source_span/);
  });

  test("a FACT claim with neither source_url nor source_id fails", () => {
    const errors = validateRecordBriefsClaim(validClaim({ source_url: null }), 0, ITEM_ID, POOL_TEXT);
    assert.ok(errors.some((e) => e.includes("requires source_url or source_id")));
  });

  test("a FACT claim with a valid source_id (no source_url) passes the source-presence check", () => {
    const errors = validateRecordBriefsClaim(
      validClaim({ source_url: null, source_id: "44444444-4444-4444-4444-444444444444" }),
      0,
      ITEM_ID,
      POOL_TEXT
    );
    assert.deepEqual(errors, []);
  });

  test("an empty claim_text fails", () => {
    const errors = validateRecordBriefsClaim(validClaim({ claim_text: "  " }), 0, ITEM_ID, POOL_TEXT);
    assert.ok(errors.some((e) => e.includes("claim_text must be a non-empty string")));
  });

  test("a GAP claim needs no source_span or source_url at all", () => {
    const errors = validateRecordBriefsClaim(
      { slot_key: "penalty_summary", claim_kind: "GAP", claim_text: "[penalty_summary] No statement located.", source_span: null, source_url: null, section: "8" },
      0,
      ITEM_ID,
      POOL_TEXT
    );
    assert.deepEqual(errors, []);
  });
});

// ── synthetic frontmatter serialization edge cases ──────────────────────────────────────────────────

describe("buildSyntheticFrontmatter", () => {
  test("a key_data entry containing a comma is refused (the shared inline-array format has no escaping)", () => {
    assert.throws(
      () => buildSyntheticFrontmatter(validMetadata({ key_data: ["EUR 500,000 fine"] })),
      /contains a comma/
    );
  });

  test("a free-text field containing a newline is refused (the shared format has no multi-line scalar)", () => {
    assert.throws(
      () => buildSyntheticFrontmatter(validMetadata({ what_is_it: "line one\nline two" })),
      /contains a newline/
    );
  });

  test("a free-text field that both starts and ends with a matching quote character is refused", () => {
    assert.throws(
      () => buildSyntheticFrontmatter(validMetadata({ why_matters: '"quoted on both ends"' })),
      /matching quote character/
    );
  });

  test("requirement_trajectory serializes as inline JSON regardless of nested content", () => {
    const yaml = buildSyntheticFrontmatter(
      validMetadata({ requirement_trajectory: { steps: [{ date: "2027-01-01", value: "10%" }], note: "phase-in" } })
    );
    assert.match(yaml, /^requirement_trajectory: \{.*"steps".*\}$/m);
  });

  test("null optional fields serialize as the literal null parseAgentOutput expects", () => {
    const yaml = buildSyntheticFrontmatter(validMetadata({ cost_mechanism: null, enforcement_body: null }));
    assert.match(yaml, /^cost_mechanism: null$/m);
    assert.match(yaml, /^enforcement_body: null$/m);
  });
});

describe("buildSyntheticRawText", () => {
  test("a body containing its own literal '---' line still parses (the opening fence closest to the YAML wins)", () => {
    const body =
      "# What This Regulation Is and Why It Applies to the Workspace\n\n" +
      "This instrument shall enter into force on 1 January 2027 and sets out reporting obligations.\n\n---\n\nSection two, after a markdown rule." +
      "\n\n# Confirmed Regulatory Timeline\n\n- 1 January 2027: Regulation enters into force.\n\n" +
      compliantSubstantiveRequirementsBlock();
    const raw = buildSyntheticRawText(body, validMetadata());
    // parseAgentOutput is exercised indirectly via validateRecordBriefsEntry -- this test proves the raw
    // text itself is well-formed by checking the whole entry validates ok end to end.
    const r = validateRecordBriefsFile(validFile([validEntry({ body })]), { poolTextByItemId: POOL });
    assert.equal(r.ok, true, `expected ok, got errors: ${JSON.stringify(r.ok ? [] : r.errors)}`);
    assert.match(raw, /---\nseverity: MONITORING/);
  });
});
