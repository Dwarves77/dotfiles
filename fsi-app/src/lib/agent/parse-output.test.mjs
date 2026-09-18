// parse-output.test.mjs -- proof for the six brief-contract exposure fields task 2.2 adds to
// parse-output.ts (brief-chain-build-plan-2026-09-11 Part 2, migration 316 columns cost_mechanism /
// penalty_range / enforcement_body / requirement_trajectory, plus why_matters / key_data joining the
// regeneration contract for the first time). requirement_trajectory mirrors trajectory_points'
// validation shape (parse-output.ts ~:560-600): inline JSON, optional (not in the required[] list),
// null on absence, AgentOutputParseError on a malformed shape. The other five fields follow the
// what_is_it rule (parse-output.ts ~:622-626): absence is an honest answer, never a parse failure.
import test from "node:test";
import assert from "node:assert/strict";
import { parseAgentOutput, AgentOutputParseError, crossLinkClaimSources } from "./parse-output.ts";

// Every key required by parseYamlFrontmatter's required[] list, with values that satisfy the
// severity->priority mapping and the signal_band/theme null-unless-format-matches gates.
const BASE_FIELDS = {
  severity: "MONITORING",
  priority: "LOW",
  urgency_tier: "stable",
  format_type: "regulatory_fact_document",
  topic_tags: "[emissions]",
  signal_band: "null",
  theme: "null",
  operational_scenario_tags: "[]",
  compliance_object_tags: "[]",
  related_items: "[]",
  intersection_summary: "null",
  sources_used: "[]",
  last_regenerated_at: "2026-09-11T00:00:00Z",
  regeneration_skill_version: "2026-09-11",
};

function buildOutput(overrides = {}) {
  const fields = { ...BASE_FIELDS, ...overrides };
  const yamlLines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`);
  return `# Overview\n\nBody text for the fixture, well over the section-content floor for this test's purposes.\n\n---\n${yamlLines.join("\n")}\n---\n`;
}

test("requirement_trajectory: a valid steps array parses into RequirementTrajectoryJSON", () => {
  const rt = '{"steps":[{"date":"2025","value":"40%","label":"of verified emissions"},{"date":"2027","value":"100%"}],"note":"phase-in per Article 9"}';
  const { metadata } = parseAgentOutput(buildOutput({ requirement_trajectory: rt }));
  assert.deepEqual(metadata.requirement_trajectory, {
    steps: [
      { date: "2025", value: "40%", label: "of verified emissions" },
      { date: "2027", value: "100%" },
    ],
    note: "phase-in per Article 9",
  });
});

test("requirement_trajectory: absent from the YAML block yields null", () => {
  const { metadata } = parseAgentOutput(buildOutput());
  assert.equal(metadata.requirement_trajectory, null);
});

test("requirement_trajectory: explicit null yields null", () => {
  const { metadata } = parseAgentOutput(buildOutput({ requirement_trajectory: "null" }));
  assert.equal(metadata.requirement_trajectory, null);
});

test("requirement_trajectory: steps not an array throws AgentOutputParseError", () => {
  const rt = '{"steps":"not-an-array"}';
  assert.throws(
    () => parseAgentOutput(buildOutput({ requirement_trajectory: rt })),
    AgentOutputParseError,
  );
});

test("requirement_trajectory: malformed JSON throws AgentOutputParseError", () => {
  assert.throws(
    () => parseAgentOutput(buildOutput({ requirement_trajectory: "{not-json" })),
    AgentOutputParseError,
  );
});

test("requirement_trajectory: a step missing a string value throws AgentOutputParseError", () => {
  const rt = '{"steps":[{"date":"2025"}]}';
  assert.throws(
    () => parseAgentOutput(buildOutput({ requirement_trajectory: rt })),
    AgentOutputParseError,
  );
});

test("cost_mechanism / penalty_range / enforcement_body: emitted strings pass through; absence is null, not a failure", () => {
  const { metadata } = parseAgentOutput(
    buildOutput({
      cost_mechanism: '"Surcharge passed through on the carrier invoice."',
      penalty_range: '"EUR 50 to EUR 100 per tonne CO2e"',
      enforcement_body: '"European Commission"',
    }),
  );
  assert.equal(metadata.cost_mechanism, "Surcharge passed through on the carrier invoice.");
  assert.equal(metadata.penalty_range, "EUR 50 to EUR 100 per tonne CO2e");
  assert.equal(metadata.enforcement_body, "European Commission");

  const { metadata: absent } = parseAgentOutput(buildOutput());
  assert.equal(absent.cost_mechanism, null);
  assert.equal(absent.penalty_range, null);
  assert.equal(absent.enforcement_body, null);
});

test("why_matters: emitted string passes through on every format; absence is null", () => {
  const { metadata } = parseAgentOutput(
    buildOutput({ why_matters: '"Raises procurement costs for ocean carriers ahead of the Q1 filing window."' }),
  );
  assert.equal(metadata.why_matters, "Raises procurement costs for ocean carriers ahead of the Q1 filing window.");

  const { metadata: absent } = parseAgentOutput(buildOutput());
  assert.equal(absent.why_matters, null);
});

test("key_data: emitted inline array passes through; absence is an empty array, not a failure", () => {
  const { metadata } = parseAgentOutput(
    buildOutput({ key_data: "[Effective 2026-01-01, Penalty EUR 100 per tonne]" }),
  );
  assert.deepEqual(metadata.key_data, ["Effective 2026-01-01", "Penalty EUR 100 per tonne"]);

  const { metadata: absent } = parseAgentOutput(buildOutput());
  assert.deepEqual(absent.key_data, []);
});

// Lane L40 (2026-09-17): crossLinkClaimSources attributes a FACT to the pool row that CONTAINS its span.
const SPAN = "State Freight Plans developed pursuant to 49 U.S.C. 70202 are multimodal in scope.";
const fact = (source_url, source_span = SPAN) => ({ section: "2", claim_text: "x", claim_kind: "FACT", source_span, source_id: null, source_url, slot_key: null });

test("L40: two rows share a URL; the FACT goes to the row whose capture contains the span, not the stub", () => {
  const rows = [
    { id: "stub", result_url: "https://a.example/doc.pdf", result_content: "Wisconsin 2023 State Freight Plan" },
    { id: "full", result_url: "https://a.example/doc.pdf", result_content: "... " + SPAN + " ..." },
  ];
  const [out] = crossLinkClaimSources([fact("https://a.example/doc.pdf")], rows);
  assert.equal(out.search_result_id, "full");
  assert.equal(out.source_url, "https://a.example/doc.pdf");
});

test("L40: the cited URL's rows lack the span but another pool row carries it verbatim; the FACT is re-homed to that row and its URL", () => {
  const rows = [
    { id: "landing", result_url: "https://fr.example/documents/2026-03648", result_content: "landing page, 1118 chars of chrome" },
    { id: "fulltext", result_url: "https://fr.example/documents/full_text/2026-03648.txt", result_content: "GUIDANCE " + SPAN },
  ];
  const [out] = crossLinkClaimSources([fact("https://fr.example/documents/2026-03648")], rows);
  assert.equal(out.search_result_id, "fulltext");
  assert.equal(out.source_url, "https://fr.example/documents/full_text/2026-03648.txt");
});

test("L40: no row contains the span; the URL match applies as before (criterion 3 refuses downstream), and rows without content keep the URL behaviour", () => {
  const rows = [
    { id: "r1", result_url: "https://a.example/p", result_content: "nothing relevant" },
    { id: "r2", result_url: "https://a.example/p", result_content: "still nothing" },
  ];
  const [out] = crossLinkClaimSources([fact("https://a.example/p")], rows);
  assert.equal(out.search_result_id, "r2");
  const [noContent] = crossLinkClaimSources([fact("https://a.example/p")], [{ id: "r3", result_url: "https://a.example/p" }]);
  assert.equal(noContent.search_result_id, "r3");
  const [gap] = crossLinkClaimSources([{ ...fact("https://a.example/p", null), claim_kind: "GAP" }], rows);
  assert.equal(gap.search_result_id, "r2");
  const [unmatched] = crossLinkClaimSources([fact("https://elsewhere.example/q")], rows);
  assert.equal(unmatched.search_result_id, null);
});
