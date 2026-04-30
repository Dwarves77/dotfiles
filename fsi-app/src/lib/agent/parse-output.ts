// Parses the agent's output under the SKILL.md 2026-04-28 contract.
//
// The agent emits a markdown brief, optionally followed by a "New Sources
// Identified" markdown table, followed by a mandatory YAML frontmatter
// block fenced with --- delimiters at the very end. This module extracts
// the YAML, strips it from the markdown body, validates the schema, and
// returns both pieces.
//
// Inline YAML parser — the frontmatter shape is fixed (7 scalar keys plus
// one array). A custom parser avoids adding a new runtime dependency for
// what is a deterministic, documented payload.

const SEVERITY_VALUES = [
  "ACTION REQUIRED",
  "COST ALERT",
  "WINDOW CLOSING",
  "COMPETITIVE EDGE",
  "MONITORING",
] as const;
const PRIORITY_VALUES = ["CRITICAL", "HIGH", "MODERATE", "LOW"] as const;
const URGENCY_TIER_VALUES = ["watch", "elevated", "stable", "informational"] as const;
const FORMAT_TYPE_VALUES = [
  "regulatory_fact_document",
  "technology_profile",
  "operations_profile",
  "market_signal_brief",
  "research_summary",
] as const;

// Closed vocabulary mirroring SKILL.md "7 Topic Categories". Tags outside this
// list fail the regeneration. The vocabulary drives the dynamic per-item source
// pool, dashboard filters, and source-coverage matrix.
const TOPIC_TAG_VALUES = [
  "emissions",
  "fuels",
  "transport",
  "reporting",
  "packaging",
  "corridors",
  "research",
] as const;

// Closed vocabulary for compliance_object_tags (SKILL.md 18 values). Tags
// outside this list fail the regeneration. Drives intersection detection.
const COMPLIANCE_OBJECT_VALUES = [
  "carrier-ocean", "carrier-air", "carrier-road", "carrier-rail",
  "vessel-operator", "aircraft-operator", "road-fleet-operator",
  "freight-forwarder", "customs-broker", "nvocc",
  "shipper", "importer", "exporter", "manufacturer-producer", "distributor",
  "port-operator", "airport-operator", "terminal-operator", "warehouse-operator",
] as const;
// (Note: 19 values total because the original spec said "18" but required
// nvocc as a separate role from freight-forwarder/customs-broker. The closed
// list as enforced is the 19 above. SKILL.md narrative groups them into 18
// for readability; the validator follows the actual list.)

// operational_scenario_tags is intentionally OPEN vocabulary per SKILL.md —
// agents prefer the core glossary but may emit new values when needed. The
// validator only enforces shape (lower-case kebab-case, no whitespace) and
// upper bound (≤5 tags).
const OPERATIONAL_SCENARIO_TAG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/i;

const SEVERITY_TO_PRIORITY: Record<string, string> = {
  "ACTION REQUIRED": "CRITICAL",
  "COST ALERT": "HIGH",
  "WINDOW CLOSING": "HIGH",
  "COMPETITIVE EDGE": "MODERATE",
  MONITORING: "LOW",
};

export interface AgentMetadata {
  severity: typeof SEVERITY_VALUES[number];
  priority: typeof PRIORITY_VALUES[number];
  urgency_tier: typeof URGENCY_TIER_VALUES[number];
  format_type: typeof FORMAT_TYPE_VALUES[number];
  topic_tags: typeof TOPIC_TAG_VALUES[number][];
  operational_scenario_tags: string[];
  compliance_object_tags: typeof COMPLIANCE_OBJECT_VALUES[number][];
  related_items: string[];
  intersection_summary: string | null;
  sources_used: string[];
  last_regenerated_at: string;
  regeneration_skill_version: string;
}

export interface ParsedAgentOutput {
  body: string; // Markdown body with YAML stripped (citation table preserved)
  metadata: AgentMetadata;
}

export class AgentOutputParseError extends Error {
  constructor(message: string, public readonly raw?: string) {
    super(message);
    this.name = "AgentOutputParseError";
  }
}

/**
 * Locates the YAML frontmatter block at the END of the agent output.
 * The block is fenced by `---` on its own line, opening and closing.
 * Returns the inner YAML text and the index where the opening `---` starts,
 * so the body can be sliced cleanly.
 */
function findYamlBlock(text: string): { yaml: string; start: number; end: number } | null {
  // Strip a single trailing ```yaml ... ``` or ``` ... ``` code-fence wrapper
  // if the agent emitted one. The contract forbids it (see system-prompt.ts),
  // but agents sometimes wrap YAML in code fences anyway. Be tolerant.
  const original = text.trimEnd();
  let trimmed = original;
  let fenceContent: string | null = null;
  let fenceStart: number | null = null;
  const fenceMatch = trimmed.match(/```(?:yaml|yml)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch) {
    fenceContent = fenceMatch[1];
    fenceStart = fenceMatch.index!;
    trimmed = trimmed.slice(0, fenceMatch.index!) + fenceMatch[1];
  }
  // Match a closing --- at the very end (allowing trailing whitespace)
  // then walk backward to find the matching opening ---.
  const closeMatch = trimmed.match(/(^|\n)---\s*$/);
  if (closeMatch) {
    const closeStart = closeMatch.index! + (closeMatch[1] === "\n" ? 1 : 0);

    // Find the previous --- on its own line before closeStart.
    // Use [ \t]*\n (horizontal whitespace only) instead of \s*\n — \s consumes
    // newlines and would gobble the leading \n of an adjacent ---\n line, which
    // misses the actual YAML opening fence when an agent emits markdown rules
    // before the YAML block.
    const before = trimmed.slice(0, closeStart);
    const openMatch = [...before.matchAll(/(^|\n)---[ \t]*\n/g)].pop();
    if (openMatch) {
      const openStart = openMatch.index! + (openMatch[1] === "\n" ? 1 : 0);
      const openEnd = openStart + openMatch[0].length - (openMatch[1] === "\n" ? 1 : 0);
      // openEnd points to the first character of the YAML body.
      const yaml = before.slice(openEnd);
      return { yaml, start: openStart, end: trimmed.length };
    }
  }

  // Fallback: agent wrapped the YAML in code fences but never emitted the
  // --- delimiters. If the fence contents look like YAML (contain at least
  // the regeneration_skill_version key — a stable marker that's hard to
  // confuse with markdown body content), use the fence body as the YAML.
  if (fenceContent !== null && fenceStart !== null && /^\s*regeneration_skill_version\s*:/m.test(fenceContent)) {
    return { yaml: fenceContent, start: fenceStart, end: original.length };
  }

  return null;
}

/**
 * Parses the YAML frontmatter block.
 *
 * Expected shape (key order is not enforced):
 *
 *   severity: ACTION REQUIRED
 *   priority: CRITICAL
 *   urgency_tier: watch
 *   format_type: regulatory_fact_document
 *   sources_used: [a1b2c3d4-..., e5f6g7h8-...]
 *   last_regenerated_at: 2026-04-28T18:42:00Z
 *   regeneration_skill_version: "2026-04-28"
 *
 * Throws AgentOutputParseError on any malformed line, missing required
 * field, or invalid enum value.
 */
function parseYamlFrontmatter(yaml: string): AgentMetadata {
  const fields: Record<string, string> = {};
  const lines = yaml.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    // Tolerate stray markdown code-fence lines (```yaml, ```yml, ```) that the
    // agent sometimes emits despite the prompt forbidding them. Skip them
    // rather than fail the regeneration on a stylistic glitch.
    if (line.startsWith("```")) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      throw new AgentOutputParseError(`Malformed YAML line (no colon): ${line.slice(0, 80)}`);
    }
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes (single or double)
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }

  const required = [
    "severity",
    "priority",
    "urgency_tier",
    "format_type",
    "topic_tags",
    "operational_scenario_tags",
    "compliance_object_tags",
    "related_items",
    "intersection_summary",
    "sources_used",
    "last_regenerated_at",
    "regeneration_skill_version",
  ];
  for (const k of required) {
    if (!(k in fields)) {
      throw new AgentOutputParseError(`Missing required field: ${k}`);
    }
  }

  // Validate enums
  if (!SEVERITY_VALUES.includes(fields.severity as any)) {
    throw new AgentOutputParseError(`Invalid severity: "${fields.severity}". Allowed: ${SEVERITY_VALUES.join(", ")}`);
  }
  if (!PRIORITY_VALUES.includes(fields.priority as any)) {
    throw new AgentOutputParseError(`Invalid priority: "${fields.priority}". Allowed: ${PRIORITY_VALUES.join(", ")}`);
  }
  if (!URGENCY_TIER_VALUES.includes(fields.urgency_tier as any)) {
    throw new AgentOutputParseError(`Invalid urgency_tier: "${fields.urgency_tier}". Allowed: ${URGENCY_TIER_VALUES.join(", ")}`);
  }
  if (!FORMAT_TYPE_VALUES.includes(fields.format_type as any)) {
    throw new AgentOutputParseError(`Invalid format_type: "${fields.format_type}". Allowed: ${FORMAT_TYPE_VALUES.join(", ")}`);
  }

  // Verify severity → priority mapping holds
  const expectedPriority = SEVERITY_TO_PRIORITY[fields.severity];
  if (expectedPriority !== fields.priority) {
    throw new AgentOutputParseError(
      `Priority "${fields.priority}" does not match the locked mapping for severity "${fields.severity}" (expected "${expectedPriority}")`
    );
  }

  // Parse topic_tags array (closed vocabulary, 0-3 values).
  const tagsRaw = fields.topic_tags.trim();
  if (!tagsRaw.startsWith("[") || !tagsRaw.endsWith("]")) {
    throw new AgentOutputParseError(`topic_tags must be a YAML inline array, got: ${tagsRaw.slice(0, 100)}`);
  }
  const tagsInner = tagsRaw.slice(1, -1).trim();
  const topicTags: string[] = tagsInner
    ? tagsInner.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter((s) => s.length > 0)
    : [];
  if (topicTags.length > 3) {
    throw new AgentOutputParseError(`topic_tags exceeds 3 values: ${topicTags.join(", ")}`);
  }
  for (const tag of topicTags) {
    if (!TOPIC_TAG_VALUES.includes(tag as any)) {
      throw new AgentOutputParseError(
        `topic_tags contains an out-of-vocabulary value: "${tag}". Allowed: ${TOPIC_TAG_VALUES.join(", ")}`
      );
    }
  }

  // Parse operational_scenario_tags (open vocabulary, 0-5 values, kebab-case shape)
  const opScenRaw = fields.operational_scenario_tags.trim();
  if (!opScenRaw.startsWith("[") || !opScenRaw.endsWith("]")) {
    throw new AgentOutputParseError(`operational_scenario_tags must be a YAML inline array, got: ${opScenRaw.slice(0, 100)}`);
  }
  const opScenInner = opScenRaw.slice(1, -1).trim();
  const opScenTags: string[] = opScenInner
    ? opScenInner.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter((s) => s.length > 0)
    : [];
  if (opScenTags.length > 5) {
    throw new AgentOutputParseError(`operational_scenario_tags exceeds 5 values: ${opScenTags.join(", ")}`);
  }
  for (const tag of opScenTags) {
    if (!OPERATIONAL_SCENARIO_TAG_RE.test(tag)) {
      throw new AgentOutputParseError(
        `operational_scenario_tags contains a malformed value: "${tag}". Expected lower-case kebab-case (e.g. ocean-bunkering).`
      );
    }
  }

  // Parse compliance_object_tags (closed vocabulary, 0-4 values)
  const compObjRaw = fields.compliance_object_tags.trim();
  if (!compObjRaw.startsWith("[") || !compObjRaw.endsWith("]")) {
    throw new AgentOutputParseError(`compliance_object_tags must be a YAML inline array, got: ${compObjRaw.slice(0, 100)}`);
  }
  const compObjInner = compObjRaw.slice(1, -1).trim();
  const compObjTags: string[] = compObjInner
    ? compObjInner.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter((s) => s.length > 0)
    : [];
  if (compObjTags.length > 4) {
    throw new AgentOutputParseError(`compliance_object_tags exceeds 4 values: ${compObjTags.join(", ")}`);
  }
  for (const tag of compObjTags) {
    if (!COMPLIANCE_OBJECT_VALUES.includes(tag as any)) {
      throw new AgentOutputParseError(
        `compliance_object_tags contains an out-of-vocabulary value: "${tag}". Allowed: ${COMPLIANCE_OBJECT_VALUES.join(", ")}`
      );
    }
  }

  // Parse related_items (UUID array, may be empty)
  const relRaw = fields.related_items.trim();
  if (!relRaw.startsWith("[") || !relRaw.endsWith("]")) {
    throw new AgentOutputParseError(`related_items must be a YAML inline array, got: ${relRaw.slice(0, 100)}`);
  }
  const relInner = relRaw.slice(1, -1).trim();
  const relatedItems: string[] = relInner
    ? relInner.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter((s) => s.length > 0)
    : [];
  // Validate UUID shape (use same regex as sources_used; defined below — defined here too for safety)
  const uuidReEarly = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const id of relatedItems) {
    if (!uuidReEarly.test(id)) {
      throw new AgentOutputParseError(`related_items contains a non-UUID value: ${id}`);
    }
  }

  // intersection_summary: scalar string OR null. Length cap ≤1500 chars.
  // Cap history: 500 → 600 (CBAM at 597) → 800 (B.2 retry at 694) →
  // 1500 (g1 EU Fit for 55 at 857; Fit for 55 is meta-regulation
  // spanning 13+ components, naturally produces dense intersection
  // content). 1500 ≈ 250 words ≈ short paragraph — final ceiling.
  // If a brief ever exceeds 1500, that's the agent rambling, not
  // genuine content density.
  const interSumRaw = fields.intersection_summary;
  let interSum: string | null;
  if (interSumRaw === "null" || interSumRaw === "" || interSumRaw === "~") {
    interSum = null;
  } else {
    interSum = interSumRaw;
    if (interSum.length > 1500) {
      throw new AgentOutputParseError(`intersection_summary exceeds 1500 chars (${interSum.length})`);
    }
  }

  // Parse sources_used array
  // Accept: [], [uuid], [uuid, uuid, ...]
  const sourcesRaw = fields.sources_used.trim();
  if (!sourcesRaw.startsWith("[") || !sourcesRaw.endsWith("]")) {
    throw new AgentOutputParseError(`sources_used must be a YAML inline array, got: ${sourcesRaw.slice(0, 100)}`);
  }
  const inner = sourcesRaw.slice(1, -1).trim();
  const sourcesUsed: string[] = inner
    ? inner.split(",").map((s) => {
        const v = s.trim().replace(/^["']|["']$/g, "");
        return v;
      }).filter((s) => s.length > 0)
    : [];
  // Validate UUID shape
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const id of sourcesUsed) {
    if (!uuidRe.test(id)) {
      throw new AgentOutputParseError(`sources_used contains a non-UUID value: ${id}`);
    }
  }

  // last_regenerated_at — accept any ISO 8601-ish string; let downstream Postgres validate.
  const ts = fields.last_regenerated_at;
  if (!ts || isNaN(Date.parse(ts))) {
    throw new AgentOutputParseError(`Invalid last_regenerated_at: "${ts}"`);
  }

  return {
    severity: fields.severity as AgentMetadata["severity"],
    priority: fields.priority as AgentMetadata["priority"],
    urgency_tier: fields.urgency_tier as AgentMetadata["urgency_tier"],
    format_type: fields.format_type as AgentMetadata["format_type"],
    topic_tags: topicTags as AgentMetadata["topic_tags"],
    operational_scenario_tags: opScenTags,
    compliance_object_tags: compObjTags as AgentMetadata["compliance_object_tags"],
    related_items: relatedItems,
    intersection_summary: interSum,
    sources_used: sourcesUsed,
    last_regenerated_at: ts,
    regeneration_skill_version: fields.regeneration_skill_version,
  };
}

/**
 * Parse the full agent output: body + metadata.
 * Throws AgentOutputParseError if the YAML block is missing or malformed.
 */
export function parseAgentOutput(rawText: string): ParsedAgentOutput {
  const block = findYamlBlock(rawText);
  if (!block) {
    throw new AgentOutputParseError(
      "YAML frontmatter block not found at end of output. Expected `---` opening and closing fences.",
      rawText.slice(-500)
    );
  }
  const metadata = parseYamlFrontmatter(block.yaml);
  const body = rawText.slice(0, block.start).replace(/\s+$/, "");
  return { body, metadata };
}
