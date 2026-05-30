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

// Sprint 3 A2 (2026-05-25): signal_band and theme columns.
// signal_band — closed 3-value vocab, only valid when format_type is
//   market_signal_brief; null on all other formats.
// theme — mirrors TOPIC_TAG_VALUES (7 values), only valid when
//   format_type is research_summary; null on all other formats.
//   Distinct from topic_tags (multi-value): theme is the single most
//   central theme of the research finding.
const SIGNAL_BAND_VALUES = ["price", "corporate", "corridor"] as const;
const THEME_VALUES = TOPIC_TAG_VALUES;

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

/**
 * Sprint 3 A4-2 (2026-05-27): trajectory_points JSONB shape.
 * Only valid when signal_band === 'price'. Belt 2 of three:
 *   Belt 1: DB CHECK constraint (migration 107)
 *   Belt 2: parser validation (this file)
 *   Belt 3: component-layer guard (MarketPage / MarketSignalDetailSurface)
 */
export interface TrajectoryPointsJSON {
  points: Array<{ date: string; value: number }>;
  base_date: string;
  base_label: string;
}

export interface AgentMetadata {
  severity: typeof SEVERITY_VALUES[number];
  priority: typeof PRIORITY_VALUES[number];
  urgency_tier: typeof URGENCY_TIER_VALUES[number];
  format_type: typeof FORMAT_TYPE_VALUES[number];
  topic_tags: typeof TOPIC_TAG_VALUES[number][];
  signal_band: typeof SIGNAL_BAND_VALUES[number] | null;
  theme: typeof THEME_VALUES[number] | null;
  /**
   * B1 Price signal time-series. Only non-null when signal_band === 'price'.
   * Optional — agents are not yet required to emit this; the schema +
   * validation pipeline is ready (Sprint 3 A4-2). The system-prompt
   * extension that instructs agents to emit trajectory_points lands as
   * a separate dispatch (TIMESERIES-WORKER for richer ingestion, or an
   * agent-prompt extension dispatch for opportunistic emission).
   */
  trajectory_points: TrajectoryPointsJSON | null;
  /**
   * Sprint 3 R-A + M-A callout fields (migration 110, 2026-05-27).
   * All optional/nullable; agent emits when applicable per format:
   *   - what_it_changes      every brief (research + market + others)
   *   - does_not_resolve     research_summary featured items
   *   - conversion_trigger   market_signal_brief B1/B2 featured
   *   - cross_references     market_signal_brief B3 featured
   */
  what_it_changes: string | null;
  does_not_resolve: string | null;
  conversion_trigger: string | null;
  cross_references: string | null;
  operational_scenario_tags: string[];
  compliance_object_tags: typeof COMPLIANCE_OBJECT_VALUES[number][];
  related_items: string[];
  intersection_summary: string | null;
  sources_used: string[];
  last_regenerated_at: string;
  regeneration_skill_version: string;
}

// Sprint 4 Block 1 (task 1.8): claim-level provenance payload.
// The agent emits a Claim Provenance Ledger between the sentinels
//   <<<CLAIM_PROVENANCE_LEDGER ... CLAIM_PROVENANCE_LEDGER>>>
// (a single JSON array), positioned after "New Sources Identified" and
// before the YAML frontmatter. Each record maps to one
// section_claim_provenance row (per docs/designs/source-provenance-model.md
// section 3a). FACT records require a verbatim source_span plus a grounding
// source_id (UUID from the pool) OR source_url (newly found via web_search).
const CLAIM_KIND_VALUES = ["FACT", "ANALYSIS", "LEGAL", "GAP"] as const;
export type ClaimKind = typeof CLAIM_KIND_VALUES[number];

export interface ClaimProvenanceRecord {
  section: string;            // section key the claim appears in ("3","4","8",...)
  claim_text: string;         // verbatim claim as written in the prose
  claim_kind: ClaimKind;
  source_span: string | null; // verbatim quote from the grounding source (FACT)
  source_id: string | null;   // sources.id UUID from the pool (FACT)
  source_url: string | null;  // grounding URL when newly found (FACT)
  slot_key: string | null;    // item-type required slot this claim covers, else null
  // Filled by crossLinkClaimSources() at persist time, not by the agent:
  search_result_id?: string | null; // agent_run_searches.id whose result_url matched source_url
}

export interface ParsedAgentOutput {
  body: string; // Markdown body with YAML + claim ledger stripped (citation table preserved)
  metadata: AgentMetadata;
  claims: ClaimProvenanceRecord[]; // Sprint 4 task 1.8 — may be empty (honest no-claim result)
}

// Minimal shape of an agent_run_searches row needed for cross-linking. Kept
// structural so callers can pass DB rows or synthetic fixtures.
export interface AgentRunSearchLink {
  id: string;
  result_url: string | null;
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

  // Fallback A: agent wrapped the YAML in code fences but never emitted
  // the --- delimiters. If the fence contents look like YAML (contain at
  // least the regeneration_skill_version key — a stable marker that's
  // hard to confuse with markdown body content), use the fence body
  // directly.
  if (fenceContent !== null && fenceStart !== null && /^\s*regeneration_skill_version\s*:/m.test(fenceContent)) {
    return { yaml: fenceContent, start: fenceStart, end: original.length };
  }

  // Fallback B: agent emitted raw YAML at the end with no fences at all
  // (no --- and no ```). Find the magic regeneration_skill_version line
  // and walk backwards line-by-line to find the start of the YAML block.
  // A YAML line matches /^\s*[a-z_]+\s*:/ — once we hit a line that
  // doesn't, that's the boundary.
  const skillVersionMatch = original.match(/^[ \t]*regeneration_skill_version[ \t]*:/m);
  if (skillVersionMatch) {
    const lines = original.split(/\r?\n/);
    let lastIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/^[ \t]*regeneration_skill_version[ \t]*:/.test(lines[i])) { lastIdx = i; break; }
    }
    if (lastIdx >= 0) {
      let firstIdx = lastIdx;
      while (firstIdx > 0) {
        const prev = lines[firstIdx - 1];
        // Allow blank lines and YAML key:value lines (and array continuations like `- foo:`)
        if (/^\s*$/.test(prev)) break; // blank line is the boundary
        if (/^[ \t]*[a-z_]+[ \t]*:/.test(prev)) { firstIdx--; continue; }
        // Non-YAML line — stop
        break;
      }
      // Compute byte offset to firstIdx
      let charOffset = 0;
      for (let i = 0; i < firstIdx; i++) charOffset += lines[i].length + 1;
      const yamlContent = lines.slice(firstIdx, lastIdx + 1).join("\n");
      return { yaml: yamlContent, start: charOffset, end: original.length };
    }
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
    "signal_band",
    "theme",
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

  // Sprint 3 A2: signal_band — null OR one of 3 values, AND only
  // non-null when format_type is market_signal_brief.
  const signalBandRawValue = fields.signal_band.trim().toLowerCase();
  const signalBand: typeof SIGNAL_BAND_VALUES[number] | null =
    signalBandRawValue === "null" || signalBandRawValue === "" ? null : (signalBandRawValue as any);
  if (signalBand !== null) {
    if (!SIGNAL_BAND_VALUES.includes(signalBand as any)) {
      throw new AgentOutputParseError(
        `Invalid signal_band: "${signalBand}". Allowed: ${SIGNAL_BAND_VALUES.join(", ")} or null`
      );
    }
    if (fields.format_type !== "market_signal_brief") {
      throw new AgentOutputParseError(
        `signal_band may only be non-null when format_type is market_signal_brief (got format_type="${fields.format_type}")`
      );
    }
  }

  // Sprint 3 A2: theme — null OR one of 7 values, AND only non-null
  // when format_type is research_summary.
  const themeRawValue = fields.theme.trim().toLowerCase();
  const theme: typeof THEME_VALUES[number] | null =
    themeRawValue === "null" || themeRawValue === "" ? null : (themeRawValue as any);
  if (theme !== null) {
    if (!THEME_VALUES.includes(theme as any)) {
      throw new AgentOutputParseError(
        `Invalid theme: "${theme}". Allowed: ${THEME_VALUES.join(", ")} or null`
      );
    }
    if (fields.format_type !== "research_summary") {
      throw new AgentOutputParseError(
        `theme may only be non-null when format_type is research_summary (got format_type="${fields.format_type}")`
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

  // intersection_summary: scalar string OR null. Cap 2000 chars with
  // truncate-on-overflow rather than fail. Losing an entire 13-field
  // regeneration because this one supplementary field is 55 chars over
  // some arbitrary cap is bad cost/benefit — the brief, the topic_tags,
  // and the structural intersection metadata (tags + related_items) are
  // all still good. Truncate the long tail and keep the rest.
  // Cap history: 500 → 600 → 800 → 1500 → 2000-with-truncate.
  const interSumRaw = fields.intersection_summary;
  let interSum: string | null;
  if (interSumRaw === "null" || interSumRaw === "" || interSumRaw === "~") {
    interSum = null;
  } else {
    interSum = interSumRaw;
    if (interSum.length > 2000) {
      // Truncate at 1997 + ellipsis. Log to console so the operator can
      // see how often the cap is hit at scale; it's not a parse failure.
      console.warn(`[parse-output] intersection_summary truncated from ${interSum.length} → 2000 chars`);
      interSum = interSum.slice(0, 1997) + "...";
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

  // Sprint 3 A4-2 (2026-05-27): trajectory_points is OPTIONAL — not in
  // the required[] list. Agents are not yet required to emit it. When
  // present, it must be inline JSON (single-line YAML value), and it
  // is only valid when signal_band === 'price'. Belt 2 of three.
  let trajectoryPoints: TrajectoryPointsJSON | null = null;
  const trajRaw = fields.trajectory_points;
  if (trajRaw !== undefined && trajRaw.trim() !== "" && trajRaw.trim().toLowerCase() !== "null") {
    // Reject when signal_band is not 'price'. Mirrors migration 107's
    // CHECK constraint so the agent gets a clear error pre-insert.
    if (signalBand !== "price") {
      throw new AgentOutputParseError(
        `trajectory_points may only be non-null when signal_band === 'price' (got signal_band="${signalBand ?? "null"}")`
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trajRaw);
    } catch (e) {
      throw new AgentOutputParseError(
        `trajectory_points must be inline JSON when present: ${(e as Error).message}`
      );
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new AgentOutputParseError(`trajectory_points must be a JSON object, got: ${typeof parsed}`);
    }
    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.points) || typeof obj.base_date !== "string" || typeof obj.base_label !== "string") {
      throw new AgentOutputParseError(
        `trajectory_points missing required keys. Expected { points: [...], base_date: "YYYY-MM-DD", base_label: string }`
      );
    }
    for (const pt of obj.points) {
      if (typeof pt !== "object" || pt === null) {
        throw new AgentOutputParseError(`trajectory_points.points entries must be objects`);
      }
      const p = pt as Record<string, unknown>;
      if (typeof p.date !== "string" || typeof p.value !== "number") {
        throw new AgentOutputParseError(
          `trajectory_points.points entries must have { date: string, value: number }`
        );
      }
    }
    trajectoryPoints = {
      points: obj.points as TrajectoryPointsJSON["points"],
      base_date: obj.base_date,
      base_label: obj.base_label,
    };
  }

  // Sprint 3 R-A + M-A callout fields (migration 110, 2026-05-27).
  // OPTIONAL — agents are not required to emit them. Each field is a
  // single-line short string (~50-200 chars) that the renderer drops
  // into a callout block per the SURFACE-MOCKUP-RECONCILE audit.
  //
  // Parser keeps them as plain string passthroughs with an empty/null
  // sentinel match. The agent prompt extension (system-prompt.ts)
  // instructs the model on when each field applies; the parser does
  // not enforce that gating — render time can suppress mis-applied
  // fields if needed.
  function readOptionalString(key: string): string | null {
    const raw = fields[key];
    if (raw === undefined) return null;
    const v = raw.trim();
    if (v === "" || v.toLowerCase() === "null") return null;
    return v;
  }
  const whatItChanges = readOptionalString("what_it_changes");
  const doesNotResolve = readOptionalString("does_not_resolve");
  const conversionTrigger = readOptionalString("conversion_trigger");
  const crossReferences = readOptionalString("cross_references");

  return {
    severity: fields.severity as AgentMetadata["severity"],
    priority: fields.priority as AgentMetadata["priority"],
    urgency_tier: fields.urgency_tier as AgentMetadata["urgency_tier"],
    format_type: fields.format_type as AgentMetadata["format_type"],
    topic_tags: topicTags as AgentMetadata["topic_tags"],
    signal_band: signalBand,
    theme: theme,
    trajectory_points: trajectoryPoints,
    what_it_changes: whatItChanges,
    does_not_resolve: doesNotResolve,
    conversion_trigger: conversionTrigger,
    cross_references: crossReferences,
    operational_scenario_tags: opScenTags,
    compliance_object_tags: compObjTags as AgentMetadata["compliance_object_tags"],
    related_items: relatedItems,
    intersection_summary: interSum,
    sources_used: sourcesUsed,
    last_regenerated_at: ts,
    regeneration_skill_version: fields.regeneration_skill_version,
  };
}

// Sprint 4 task 1.8: locate + parse the Claim Provenance Ledger. Returns the
// validated records and the [start,end) span of the block in rawText so the
// caller can strip it from the body. Returns null when no ledger is present
// (additive: pre-Sprint-4 outputs simply have none — the YAML block remains
// the hard requirement).
const CLAIM_LEDGER_RE = /<<<CLAIM_PROVENANCE_LEDGER\s*([\s\S]*?)\s*CLAIM_PROVENANCE_LEDGER>>>/;
const CLAIM_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function locateClaimLedger(
  rawText: string,
): { claims: ClaimProvenanceRecord[]; start: number; end: number } | null {
  const m = CLAIM_LEDGER_RE.exec(rawText);
  if (!m) return null;
  const inner = m[1].trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(inner);
  } catch (e) {
    throw new AgentOutputParseError(
      `Claim Provenance Ledger is not valid JSON: ${(e as Error).message}`,
      inner.slice(0, 500),
    );
  }
  if (!Array.isArray(parsed)) {
    throw new AgentOutputParseError("Claim Provenance Ledger must be a JSON array");
  }
  const claims: ClaimProvenanceRecord[] = parsed.map((raw, i) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new AgentOutputParseError(`Claim ledger record ${i} is not an object`);
    }
    const o = raw as Record<string, unknown>;
    const kind = o.claim_kind;
    if (typeof kind !== "string" || !CLAIM_KIND_VALUES.includes(kind as ClaimKind)) {
      throw new AgentOutputParseError(`Claim ledger record ${i} has invalid claim_kind: ${String(kind)}`);
    }
    const claimText = typeof o.claim_text === "string" ? o.claim_text : "";
    if (!claimText.trim()) {
      throw new AgentOutputParseError(`Claim ledger record ${i} has empty claim_text`);
    }
    const section = o.section == null ? "" : String(o.section);
    const sourceSpan = o.source_span == null ? null : String(o.source_span);
    const sourceId = o.source_id == null ? null : String(o.source_id);
    const sourceUrl = o.source_url == null ? null : String(o.source_url);
    const slotKey = o.slot_key == null ? null : String(o.slot_key);
    // FACT records must be grounded: span + (id OR url). Mirrors the
    // validate_item_provenance criterion-3 check, surfaced at parse time so a
    // malformed FACT is caught before it reaches the gate.
    if (kind === "FACT") {
      if (!sourceSpan || !sourceSpan.trim()) {
        throw new AgentOutputParseError(`FACT claim ${i} ("${claimText.slice(0, 50)}") is missing source_span`);
      }
      if (!sourceId && !sourceUrl) {
        throw new AgentOutputParseError(`FACT claim ${i} ("${claimText.slice(0, 50)}") has neither source_id nor source_url`);
      }
    }
    if (sourceId !== null && !CLAIM_UUID_RE.test(sourceId)) {
      throw new AgentOutputParseError(`Claim ledger record ${i} has non-UUID source_id: ${sourceId}`);
    }
    return {
      section,
      claim_text: claimText,
      claim_kind: kind as ClaimKind,
      source_span: sourceSpan,
      source_id: sourceId,
      source_url: sourceUrl,
      slot_key: slotKey,
      search_result_id: null,
    };
  });
  return { claims, start: m.index, end: m.index + m[0].length };
}

/**
 * Sprint 4 task 1.8: standalone ledger extractor for callers that only want
 * the claims (e.g. the workflow persist step) without re-parsing YAML.
 * Returns [] when no ledger block is present. Throws on a malformed ledger.
 */
export function extractClaimLedger(rawText: string): ClaimProvenanceRecord[] {
  const located = locateClaimLedger(rawText);
  return located ? located.claims : [];
}

/**
 * Sprint 4 task 1.8: cross-link each claim's grounding source to the
 * agent_run_searches row that surfaced it. For FACT claims grounded by a
 * web_search result (source_url set, source_id often null), match source_url
 * against the searches' result_url and stamp search_result_id. Pure function:
 * the workflow persist step calls it with the run's persisted search rows.
 * Returns a new array; does not mutate the input.
 */
export function crossLinkClaimSources(
  claims: ClaimProvenanceRecord[],
  searches: AgentRunSearchLink[],
): ClaimProvenanceRecord[] {
  const byUrl = new Map<string, string>();
  for (const s of searches) {
    if (s.result_url) byUrl.set(s.result_url, s.id);
  }
  return claims.map((c) => {
    if (c.source_url && byUrl.has(c.source_url)) {
      return { ...c, search_result_id: byUrl.get(c.source_url)! };
    }
    return { ...c, search_result_id: c.search_result_id ?? null };
  });
}

/**
 * Parse the full agent output: body + metadata + claim provenance ledger.
 * Throws AgentOutputParseError if the YAML block is missing or malformed, or
 * if a claim ledger is present but malformed.
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
  // Sprint 4 task 1.8: extract the claim ledger (sits before the YAML block)
  // and strip it from the stored body so full_brief stays clean prose.
  const ledger = locateClaimLedger(rawText);
  const claims = ledger ? ledger.claims : [];
  let body = rawText.slice(0, block.start);
  if (ledger && ledger.end <= block.start) {
    body = body.slice(0, ledger.start) + body.slice(ledger.end);
  }
  body = body.replace(/\s+$/, "");
  return { body, metadata, claims };
}
