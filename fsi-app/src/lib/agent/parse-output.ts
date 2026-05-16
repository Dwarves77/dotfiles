// Parses the agent's output under the SKILL.md 2026-04-28 contract.
//
// The agent emits a markdown brief, optionally followed by a "New Sources
// Identified" markdown table, followed by a mandatory YAML frontmatter
// block fenced with --- delimiters at the very end. This module:
//
//   1. Locates the YAML block at the end of the output (with multi-fallback
//      logic for agents that wrap the YAML in code fences or omit delimiters).
//   2. Splits the YAML into a plain object (minimal inline YAML splitter;
//      the frontmatter shape is fixed scalars + inline arrays, no nesting).
//   3. Validates the object against AgentMetadataSchema from vocabularies.ts.
//   4. Returns body + metadata, or throws AgentOutputParseError.
//
// Validation is delegated to fsi-app/src/lib/agent/vocabularies.ts (the
// canonical Zod schemas for severity, priority, topic_tags, compliance
// objects, operational scenarios, etc.). Drift between this file and the
// DB CHECK constraints in migration 078 is impossible because both read
// from the same vocabularies.ts.
//
// History: replaced a ~220-line hand-rolled validator with Zod via
// vocabularies.ts in dispatch 2 (2026-05-15). The findYamlBlock finder
// is unchanged — it does separate work (locating the block) from the
// validator (validating its contents).

import { AgentMetadataSchema, type AgentMetadata } from "./vocabularies";

export type { AgentMetadata };

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
 *
 * Multi-fallback: the prompt forbids code-fence wrappers around the YAML
 * but agents sometimes emit them anyway. Also handles the case where the
 * agent omits the --- delimiters entirely.
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
 * Splits the YAML frontmatter into a raw object suitable for Zod
 * validation. The frontmatter shape is fixed (scalar keys plus inline
 * arrays); a full YAML parser would be overkill. This splitter:
 *
 *   - Trims and skips blank lines, comment lines (#), and stray code
 *     fence lines (```yaml, ```)
 *   - Strips surrounding quotes from scalar values
 *   - Parses inline arrays `[a, b, c]` into string[]
 *   - Normalizes null sentinels ("null", "~", "") to JS null for
 *     intersection_summary
 *   - Coerces 2000+ char intersection_summary to a 2000-char truncation
 *     (consistent with prior behavior; the cap is not a parse failure)
 *
 * Returns a raw object that AgentMetadataSchema validates. Schema
 * validation is the canonical correctness gate; this splitter only
 * does shape-level parsing.
 */
function splitYamlToRaw(yaml: string): Record<string, unknown> {
  const fields: Record<string, string> = {};
  for (const rawLine of yaml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith("```")) continue; // stray code fence; tolerate
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      throw new AgentOutputParseError(`Malformed YAML line (no colon): ${line.slice(0, 80)}`);
    }
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }

  // Parse inline arrays for the four array-typed fields. Each value is
  // a string surrounded by [ ... ] containing comma-separated entries
  // (possibly quoted). An empty array is [].
  const parseInlineArray = (key: string): string[] => {
    const raw = (fields[key] ?? "").trim();
    if (!raw.startsWith("[") || !raw.endsWith("]")) {
      throw new AgentOutputParseError(
        `${key} must be a YAML inline array, got: ${raw.slice(0, 100)}`
      );
    }
    const inner = raw.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter((s) => s.length > 0);
  };

  // intersection_summary: scalar string OR null. Cap at 2000 chars with
  // truncation rather than fail. Losing an entire 13-field regeneration
  // because this one supplementary field is 55 chars over a cap is bad
  // cost/benefit. Cap history: 500 → 600 → 800 → 1500 → 2000-with-truncate.
  let intersectionSummary: string | null;
  const rawIS = fields.intersection_summary;
  if (rawIS === undefined) {
    throw new AgentOutputParseError(`Missing required field: intersection_summary`);
  }
  if (rawIS === "null" || rawIS === "" || rawIS === "~") {
    intersectionSummary = null;
  } else if (rawIS.length > 2000) {
    console.warn(
      `[parse-output] intersection_summary truncated from ${rawIS.length} → 2000 chars`
    );
    intersectionSummary = rawIS.slice(0, 1997) + "...";
  } else {
    intersectionSummary = rawIS;
  }

  return {
    severity:                   fields.severity,
    priority:                   fields.priority,
    urgency_tier:               fields.urgency_tier,
    format_type:                fields.format_type,
    topic_tags:                 parseInlineArray("topic_tags"),
    operational_scenario_tags:  parseInlineArray("operational_scenario_tags"),
    compliance_object_tags:     parseInlineArray("compliance_object_tags"),
    related_items:              parseInlineArray("related_items"),
    intersection_summary:       intersectionSummary,
    sources_used:               parseInlineArray("sources_used"),
    last_regenerated_at:        fields.last_regenerated_at,
    regeneration_skill_version: fields.regeneration_skill_version,
  };
}

/**
 * Parse the full agent output: body + metadata.
 * Throws AgentOutputParseError if the YAML block is missing, malformed,
 * or fails schema validation.
 */
export function parseAgentOutput(rawText: string): ParsedAgentOutput {
  const block = findYamlBlock(rawText);
  if (!block) {
    throw new AgentOutputParseError(
      "YAML frontmatter block not found at end of output. Expected `---` opening and closing fences.",
      rawText.slice(-500)
    );
  }

  let raw: Record<string, unknown>;
  try {
    raw = splitYamlToRaw(block.yaml);
  } catch (e) {
    if (e instanceof AgentOutputParseError) throw e;
    throw new AgentOutputParseError(
      `YAML splitting failed: ${e instanceof Error ? e.message : String(e)}`,
      block.yaml.slice(0, 500)
    );
  }

  const parseResult = AgentMetadataSchema.safeParse(raw);
  if (!parseResult.success) {
    const issues = parseResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new AgentOutputParseError(
      `Agent metadata validation failed: ${issues}`,
      block.yaml.slice(0, 500)
    );
  }

  const body = rawText.slice(0, block.start).replace(/\s+$/, "");
  return { body, metadata: parseResult.data };
}
