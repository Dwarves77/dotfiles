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

function validClaim(overrides = {}) {
  return {
    slot_key: "effective_date",
    claim_kind: "FACT",
    claim_text: "[effective_date] The captured source states, verbatim: «shall enter into force on 1 January 2027»",
    source_span: "shall enter into force on 1 January 2027",
    source_url: "https://example.org/reg",
    ...overrides,
  };
}

function validEntry(overrides = {}) {
  return {
    item_id: ITEM_ID,
    source_pool_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b85",
    body:
      "# Regulation Brief\n\nThis instrument sets out reporting obligations." +
      "\n\n# Confirmed Regulatory Timeline\n\n- 1 January 2027: Regulation enters into force.\n",
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
    assert.equal(r.ok, true);
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
    assert.equal(r.ok, true);
  });
});

describe("validateRecordBriefsFile: criterion 4 mirror (unlabeled assertion)", () => {
  test("a section matching the unlabeled-modal pattern with no analysis label or legal callout fails, naming the section", () => {
    const entry = validEntry({
      body: validEntry().body + "\n\n# Substantive Requirements\n\nThe operator must register with the agency.\n",
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, false);
    const msg = r.errors.find((e) => e.includes("criterion 4 mirror"));
    assert.ok(msg, `expected a criterion 4 mirror error, got: ${JSON.stringify(r.errors)}`);
    assert.match(msg, /Substantive Requirements/);
  });

  test("the SAME assertion labeled with a recognised analysis label passes", () => {
    const entry = validEntry({
      body:
        validEntry().body +
        "\n\n# Substantive Requirements\n\n*Analytical inference:* The operator must register with the agency.\n",
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, true);
  });

  test("the SAME assertion behind the legal callout passes", () => {
    const entry = validEntry({
      body:
        validEntry().body +
        "\n\n# Substantive Requirements\n\n*Legal Confirmation Required:* The operator must register with the agency.\n",
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, true);
  });

  test("an unlabeled assertion in the preamble before the first heading is caught too", () => {
    const entry = validEntry({ body: "The operator must register before shipping.\n\n" + validEntry().body });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("criterion 4 mirror") && e.includes("preamble")));
  });

  test("this mirror is STRICTER than the live DB rule: a FACT claim attached to the section is NOT an escape here", () => {
    // The live validate_item_provenance criterion 4 also accepts a FACT claim carrying the same
    // section_key as an alternative to a label -- this validator has no section_key/claim attachment to
    // check pre-write, so the unlabeled assertion still fails even though a FACT claim exists elsewhere
    // in the same entry.
    const entry = validEntry({
      body: validEntry().body + "\n\n# Substantive Requirements\n\nThe operator must register with the agency.\n",
      claims: [validClaim(), { slot_key: null, claim_kind: "FACT", claim_text: "the fine is up to EUR 500,000", source_span: "fines of up to EUR 500,000", source_url: "https://example.org/reg" }],
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
    assert.equal(r.ok, true);
  });

  test("the section-sign heading variant (\\u00A714 ...) is also accepted", () => {
    const entry = validEntry({
      body:
        "# Regulation Brief\n\nThis instrument sets out reporting obligations." +
        `\n\n# ${String.fromCharCode(0xa7)}14 Confirmed Regulatory Timeline\n\n- 1 January 2027: Regulation enters into force.\n`,
    });
    const r = validateRecordBriefsFile(validFile([entry]), { poolTextByItemId: POOL });
    assert.equal(r.ok, true);
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
      { slot_key: "penalty_summary", claim_kind: "GAP", claim_text: "[penalty_summary] No statement located.", source_span: null, source_url: null },
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
      "# Title\n\nSection one.\n\n---\n\nSection two, after a markdown rule." +
      "\n\n# Confirmed Regulatory Timeline\n\n- 1 January 2027: Regulation enters into force.\n";
    const raw = buildSyntheticRawText(body, validMetadata());
    // parseAgentOutput is exercised indirectly via validateRecordBriefsEntry -- this test proves the raw
    // text itself is well-formed by checking the whole entry validates ok end to end.
    const r = validateRecordBriefsFile(validFile([validEntry({ body })]), { poolTextByItemId: POOL });
    assert.equal(r.ok, true, `expected ok, got errors: ${JSON.stringify(r.ok ? [] : r.errors)}`);
    assert.match(raw, /---\nseverity: MONITORING/);
  });
});
