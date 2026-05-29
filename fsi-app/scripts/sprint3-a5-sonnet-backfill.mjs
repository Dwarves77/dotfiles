/**
 * sprint3-a5-sonnet-backfill.mjs
 *
 * Sprint 3 A5.4 (2026-05-28). Sonnet-driven backfill for the 304 active
 * D1 (Regulations) items whose `full_brief` markdown predates the
 * SKILL.md §3-§15 contract — i.e., the A5.2 parser-based backfill
 * (scripts/sprint3-a5-backfill.mjs) found zero recognizable section
 * headings and emitted no rows for them. The A5.2 parser covered 64
 * of 368 active D1 items; this script covers the remaining 304.
 *
 * For each uncovered D1 item we:
 *   1. Read full_brief + url + title + note + jurisdiction + topic
 *      from intelligence_items.
 *   2. Call Sonnet 4.6 (claude-sonnet-4-6) with the web_search tool
 *      enabled. The system prompt asks Sonnet to emit JSON keyed by
 *      the 7 SKILL.md section keys (§3, §4, §8, §10, §11, §14, §15)
 *      with content_md strings populated only from grounded content.
 *      Integrity rule: omit any section that cannot be grounded.
 *   3. Upsert each section into intelligence_item_sections via
 *      ON CONFLICT (item_id, section_key) DO UPDATE.
 *
 * Integrity rule (per CLAUDE.md): no fabricated content. A 0-section
 * result is an honest answer for items where grounding can't be found
 * — the customer surface renders the "Detailed sections pending"
 * affordance shipped in commit 4fd83b5.
 *
 * Idempotency: re-runnable. Items already in the checkpoint file
 * (.a5-sonnet-checkpoint.json) are skipped on restart. Upserts use
 * ON CONFLICT so partial re-runs don't duplicate rows.
 *
 * Budget cap: $30 USD hard ceiling. Tracking per-call cost via Sonnet
 * 4.6 pricing ($3/M input, $15/M output, plus $10/1k web searches).
 * Halts and reports cumulative spend exceeds $30 before completing.
 *
 * Apply-to-production: dev/prod share the same Supabase project
 * (kwrsbpiseruzbfwjpvsp). Writes go directly to production via
 * service-role key. No migration file needed.
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");

// ── env ─────────────────────────────────────────────────────────────
const envText = readFileSync(resolve(APP_ROOT, ".env.local"), "utf8");
const env = (k) => envText.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();

const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const ANTHROPIC_KEY = env("ANTHROPIC_API_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("[A5.4] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (!ANTHROPIC_KEY) {
  console.error("[A5.4] Missing ANTHROPIC_API_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── mode + constants ───────────────────────────────────────────────
// Two modes:
//   brief-anchor (default) — process D1 items that HAVE full_brief but
//     no sections; the brief is the primary content anchor. Closed.
//   url-anchor             — process D1 items that have NO full_brief and
//     no sections; fetch source_url via web_search as the primary anchor.
//     Filtered to CRITICAL/HIGH priority only (Option C, 2026-05-28).
const MODE = process.argv.includes("--mode=url-anchor") ? "url-anchor" : "brief-anchor";

// CLI flag --budget=N overrides the default budget cap (USD).
const budgetArg = process.argv.find((a) => a.startsWith("--budget="));
const BUDGET_CAP_USD = budgetArg
  ? parseFloat(budgetArg.split("=")[1])
  : MODE === "url-anchor" ? 15.0 : 30.0;

// Sonnet 4.6 pricing (per million tokens).
const PRICE_PER_M_INPUT = 3.0;
const PRICE_PER_M_OUTPUT = 15.0;
// Web search: $10 per 1k searches → $0.01 per search.
const PRICE_PER_WEB_SEARCH = 0.01;
// Max web searches per item — bumped for url-anchor mode (need to fetch
// the source URL + ground sections from the fetched content).
const WEB_SEARCH_MAX_USES = MODE === "url-anchor" ? 5 : 3;

const SKILL_VERSION = "2026-04-29";
// Separate checkpoint per mode so the url-anchor pass doesn't pollute the
// brief-anchor pass's cumulative cost / completed list.
const CHECKPOINT_PATH = resolve(__dirname, `.a5-sonnet-checkpoint-${MODE}.json`);
const LOG_PATH = resolve(__dirname, ".a5-sonnet-backfill.log");

console.log(`[A5.4] mode=${MODE} budget_cap=$${BUDGET_CAP_USD.toFixed(2)} web_search_max_uses=${WEB_SEARCH_MAX_USES}`);

const SECTION_KEYS = ["3", "4", "8", "10", "11", "14", "15"];
const SECTION_ORDER = { "3": 3, "4": 4, "8": 8, "10": 10, "11": 11, "14": 14, "15": 15 };
const SECTION_HEADINGS = {
  "3": "Issues Requiring Immediate Action",
  "4": "How the Workspace Sits in the Compliance Chain",
  "8": "Substantive Requirements",
  "10": "Registration and Reporting Obligations",
  "11": "Operational System Requirements",
  "14": "Confirmed Regulatory Timeline",
  "15": "Sources",
};

// ── checkpoint ─────────────────────────────────────────────────────
let checkpoint = { completed_ids: [], total_cost: 0, started_at: null };
if (existsSync(CHECKPOINT_PATH)) {
  try {
    checkpoint = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf8"));
    console.log(`[A5.4] resumed from checkpoint: ${checkpoint.completed_ids.length} items already processed, cumulative cost $${checkpoint.total_cost.toFixed(2)}`);
  } catch (e) {
    console.warn(`[A5.4] failed to read checkpoint, starting fresh: ${e.message}`);
    checkpoint = { completed_ids: [], total_cost: 0, started_at: new Date().toISOString() };
  }
} else {
  checkpoint = { completed_ids: [], total_cost: 0, started_at: new Date().toISOString() };
}

function saveCheckpoint() {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2));
}

function log(line) {
  const stamped = `${new Date().toISOString()} ${line}\n`;
  appendFileSync(LOG_PATH, stamped);
}

// ── tolerant JSON extractor ────────────────────────────────────────
// Strategies, tried in order:
//   1. Fenced ```json...``` block (with or without trailing newline)
//   2. Fenced ```...``` block
//   3. Outermost {...} blob via first-/last-brace
//   4. Same blob with unescaped newlines inside string literals repaired
//   5. Per-section regex extraction as last resort (recovers individual
//      section content even when the surrounding object is malformed)
//
// Returns the parsed object or null if every strategy fails.
function tolerantJsonParse(rawText) {
  if (!rawText) return null;

  const tryParse = (s) => {
    try { return JSON.parse(s); } catch { return null; }
  };

  // 1. Fenced ```json ... ```
  const fence1 = /```json\s*\n?([\s\S]*?)\n?\s*```/i.exec(rawText);
  if (fence1) {
    const r = tryParse(fence1[1].trim());
    if (r && typeof r === "object") return r;
  }

  // 2. Plain ``` ... ``` containing {...}
  const fence2 = /```\s*\n?(\{[\s\S]*?\})\s*\n?\s*```/.exec(rawText);
  if (fence2) {
    const r = tryParse(fence2[1].trim());
    if (r && typeof r === "object") return r;
  }

  // 3. Outermost braces.
  const first = rawText.indexOf("{");
  const last = rawText.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const blob = rawText.slice(first, last + 1);
    const r = tryParse(blob);
    if (r && typeof r === "object") return r;

    // 4. Repair unescaped real newlines/tabs inside string values.
    // Walks the blob, tracks in-string state, and escapes raw control
    // chars that JSON.parse rejects.
    const repaired = repairJsonStringControls(blob);
    if (repaired !== blob) {
      const r2 = tryParse(repaired);
      if (r2 && typeof r2 === "object") return r2;
    }
  }

  // 5. Per-section regex extraction. Recovers individual section_key
  // values even when the surrounding object is unparseable. Matches
  // both bare-key ("3": "...") and quoted-key forms.
  const out = {};
  for (const key of ["3", "4", "8", "10", "11", "14", "15"]) {
    const re = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "s");
    const m = re.exec(rawText);
    if (m && m[1].trim().length > 0) {
      // Decode standard JSON string escapes.
      out[key] = m[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
  }
  if (Object.keys(out).length > 0) return out;
  return null;
}

// Walks a JSON-ish blob and escapes raw newline/tab inside string
// literals. Outside strings, the chars are left as-is (JSON treats
// them as whitespace, which is fine).
function repairJsonStringControls(blob) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < blob.length; i++) {
    const c = blob[i];
    if (escaped) {
      out += c;
      escaped = false;
      continue;
    }
    if (c === "\\" && inString) {
      out += c;
      escaped = true;
      continue;
    }
    if (c === '"') {
      out += c;
      inString = !inString;
      continue;
    }
    if (inString) {
      if (c === "\n") { out += "\\n"; continue; }
      if (c === "\r") { out += "\\r"; continue; }
      if (c === "\t") { out += "\\t"; continue; }
    }
    out += c;
  }
  return out;
}

// ── identify uncovered D1 items ────────────────────────────────────
console.log("[A5.4] querying active D1 items…");
const { data: allD1, error: qErr } = await supabase
  .from("intelligence_items")
  .select("id, legacy_id, title, summary, jurisdictions, topic_tags, source_url, full_brief, priority")
  .eq("domain", 1)
  .eq("is_archived", false);

if (qErr) {
  console.error(`[A5.4] query failed: ${qErr.message}`);
  process.exit(1);
}

console.log(`[A5.4] total active D1 items: ${(allD1 || []).length}`);

// Determine which items have ≥1 section in intelligence_item_sections.
// We pull section item_ids in a single query and intersect.
const { data: existingSections, error: sErr } = await supabase
  .from("intelligence_item_sections")
  .select("item_id");

if (sErr) {
  console.error(`[A5.4] section query failed: ${sErr.message}`);
  process.exit(1);
}

const itemsWithSections = new Set((existingSections || []).map((r) => r.item_id));
console.log(`[A5.4] items with ≥1 existing section row: ${itemsWithSections.size}`);

// Eligibility depends on mode.
//   brief-anchor: items with non-empty full_brief and zero section rows.
//   url-anchor:   items with EMPTY full_brief, zero section rows, and
//                 priority IN (CRITICAL, HIGH). source_url required.
const uncovered = (allD1 || [])
  .filter((r) => !itemsWithSections.has(r.id))
  .filter((r) => {
    const briefEmpty = !(r.full_brief || "").trim();
    const urlOk = !!(r.source_url || "").trim();
    if (MODE === "url-anchor") {
      const priorityOk = r.priority === "CRITICAL" || r.priority === "HIGH";
      return briefEmpty && urlOk && priorityOk;
    }
    return !briefEmpty;
  });

console.log(`[A5.4] uncovered D1 items eligible for Sonnet pass (${MODE}): ${uncovered.length}`);

// Filter out items already in checkpoint.
const completedSet = new Set(checkpoint.completed_ids);
const remaining = uncovered.filter((r) => !completedSet.has(r.id));
console.log(`[A5.4] remaining after checkpoint filter: ${remaining.length}`);

if (remaining.length === 0) {
  console.log("[A5.4] nothing to do — all uncovered items already processed.");
  printFinalReport(uncovered.length);
  process.exit(0);
}

// ── system prompts ─────────────────────────────────────────────────
const BRIEF_ANCHOR_SYSTEM_PROMPT = `You are the Freight Sustainability Intelligence Agent backfilling the 7 numbered sections (§3, §4, §8, §10, §11, §14, §15) of the SKILL.md Regulatory Fact Document contract for a single D1 (Regulations domain) intelligence item.

## Inputs you receive
Per item: title, jurisdiction(s), topic tag(s), source URL, and the EXISTING legacy full_brief markdown (which predates the current §3-§15 contract — it lacks the numbered headings the A5.2 parser looks for, but may still contain grounded substance you can repurpose).

## Your job
Produce a JSON object with up to 7 keys — the section_key strings "3", "4", "8", "10", "11", "14", "15" — where each value is a markdown content body for that section, anchored to the workspace profile (freight forwarder; cargo verticals live events, fine art, luxury goods, film and TV, high-value automotive, humanitarian; transport mode priority air → road → ocean; trade lanes Americas/Europe/Asia).

You MAY use the web_search tool to ground specific facts (deadlines, registration formats, regulator FAQ excerpts, source citations). Use it sparingly — 1-3 searches per item is typical. The legacy full_brief is your primary anchor; web search is supplementary grounding.

## INTEGRITY RULE — non-negotiable
- Omit any section you cannot ground. Empty/missing key in the JSON output is the correct answer for ungrounded sections.
- No invented facts, no fabricated operators or cost figures, no speculative legal interpretation.
- A result with 3 of 7 sections honestly populated is correct. A result with all 7 sections populated through invention is wrong.
- Workspace-anchored: never name a company or individual; reference "the workspace" or "workspaces in [role]" or by operational profile.
- Cite sources inline at the end of each subsection in the format: *Source: [Title], [Issuing Body], [Date]. [URL].*
- For §15 Sources, emit a markdown table with columns: # | Title | Type (with Tier) | Issuing Body | Date | URL.

## Section contracts (SKILL.md derived)

§3 Issues Requiring Immediate Action — Actions the workspace must take in the next 30 days. Each bullet leads with a SKILL severity token (ACTION REQUIRED, COST ALERT, WINDOW CLOSING, COMPETITIVE EDGE, MONITORING), then an action verb, then cost/consequence, then deadline. Format as bulleted paragraphs.

§4 How the Workspace Sits in the Compliance Chain — Plain prose mapping the regulation's supply-chain role taxonomy onto the workspace's freight-forwarder operations. Identify role placement requiring legal confirmation. Trailing source citation in *Source: ...* italics.

§8 Substantive Requirements — Markdown table with 4 columns: Obligation | Deadline | Status | Next Action. One row per substantive obligation the regulation imposes. Header + separator + data rows in standard markdown table form.

§10 Registration and Reporting Obligations — Prose covering EPR/producer/jurisdictional registration. Format published vs. promised but not yet released. Data fields the workspace must collect. Registration scope.

§11 Operational System Requirements — Prose covering what the workspace must build or modify operationally: tracking systems, reporting infrastructure, training, supplier onboarding, contract clauses. Each requirement with scope, deadline, gap from baseline.

§14 Confirmed Regulatory Timeline — Bulleted list. Each entry: date — event label (source: ...). Past milestones noted as "in force as of [date]". Future milestones with conditional triggers if any.

§15 Sources — Markdown table with columns: # | Title | Type (with Tier 1-6 inline) | Issuing Body | Date | URL. Tier 1 = binding law, Tier 2 = regulator guidance, Tier 3 = intergovernmental body, Tier 4 = industry body, Tier 5 = news reporting, Tier 6 = analysis/opinion.

## Output format

Return ONLY a JSON object inside a single fenced code block, like:

\`\`\`json
{
  "3": "markdown content for §3...",
  "8": "markdown table for §8...",
  "14": "bulleted timeline for §14...",
  "15": "sources table for §15..."
}
\`\`\`

Omit keys for sections you cannot ground. Do not emit empty strings — if a section is omitted, leave its key out of the JSON entirely.

After the JSON block, do not write anything else. No preamble, no closing remarks.`;

// URL-anchor variant — for EMPTY-shell items that have no full_brief.
// The agent must fetch the source URL via web_search FIRST, then ground
// sections in the fetched content. Up to 5 searches per item.
const URL_ANCHOR_SYSTEM_PROMPT = `You are the Freight Sustainability Intelligence Agent backfilling the 7 numbered sections (§3, §4, §8, §10, §11, §14, §15) of the SKILL.md Regulatory Fact Document contract for a single D1 (Regulations domain) intelligence item.

## Inputs you receive
Per item: title, jurisdiction(s), topic tag(s), source URL, priority tier, and a short summary paragraph. THIS ITEM HAS NO EXISTING FULL_BRIEF. The source URL is your primary anchor.

## Your job — URL-FIRST, then sections
FIRST: Use web_search to fetch and read the source URL. Read the regulatory text or official publication directly.
THEN: Produce a JSON object with up to 7 keys — the section_key strings "3", "4", "8", "10", "11", "14", "15" — where each value is a markdown content body for that section, anchored to the workspace profile (freight forwarder; cargo verticals live events, fine art, luxury goods, film and TV, high-value automotive, humanitarian; transport mode priority air → road → ocean; trade lanes Americas/Europe/Asia).

You have up to 5 web_search uses. Typical allocation: 1 to fetch the source URL, 1-2 for grounding deadlines/dates/registration formats, 1-2 for finding companion regulator guidance or industry interpretation cited inline.

## INTEGRITY RULE — non-negotiable
- Omit any section you cannot ground in the fetched URL content or a verifiable web_search result. Empty/missing key in the JSON output is the correct answer for ungrounded sections.
- If the source URL returns 404, paywalled content, a generic portal landing page, or content unrelated to the item title, RETURN AN EMPTY JSON OBJECT \`{}\`. Do not invent sections from the title alone. The customer surface renders an honest "Detailed sections pending" affordance for these items — that is the correct outcome when the source is unreachable.
- No invented facts, no fabricated operators or cost figures, no speculative legal interpretation.
- A result with 3 of 7 sections honestly populated is correct. A result with all 7 sections populated through invention is wrong.
- Workspace-anchored: never name a company or individual; reference "the workspace" or "workspaces in [role]" or by operational profile.
- Cite sources inline at the end of each subsection in the format: *Source: [Title], [Issuing Body], [Date]. [URL].*
- For §15 Sources, emit a markdown table with columns: # | Title | Type (with Tier) | Issuing Body | Date | URL.

## Section contracts (SKILL.md derived)

§3 Issues Requiring Immediate Action — Actions the workspace must take in the next 30 days. Each bullet leads with a SKILL severity token (ACTION REQUIRED, COST ALERT, WINDOW CLOSING, COMPETITIVE EDGE, MONITORING), then an action verb, then cost/consequence, then deadline. Format as bulleted paragraphs.

§4 How the Workspace Sits in the Compliance Chain — Plain prose mapping the regulation's supply-chain role taxonomy onto the workspace's freight-forwarder operations. Identify role placement requiring legal confirmation. Trailing source citation in *Source: ...* italics.

§8 Substantive Requirements — Markdown table with 4 columns: Obligation | Deadline | Status | Next Action. One row per substantive obligation the regulation imposes. Header + separator + data rows in standard markdown table form.

§10 Registration and Reporting Obligations — Prose covering EPR/producer/jurisdictional registration. Format published vs. promised but not yet released. Data fields the workspace must collect. Registration scope.

§11 Operational System Requirements — Prose covering what the workspace must build or modify operationally: tracking systems, reporting infrastructure, training, supplier onboarding, contract clauses. Each requirement with scope, deadline, gap from baseline.

§14 Confirmed Regulatory Timeline — Bulleted list. Each entry: date — event label (source: ...). Past milestones noted as "in force as of [date]". Future milestones with conditional triggers if any.

§15 Sources — Markdown table with columns: # | Title | Type (with Tier 1-6 inline) | Issuing Body | Date | URL. Tier 1 = binding law, Tier 2 = regulator guidance, Tier 3 = intergovernmental body, Tier 4 = industry body, Tier 5 = news reporting, Tier 6 = analysis/opinion. The source URL the operator gave you appears as row 1; rows 2+ are companions found via web_search.

## Output format

Return ONLY a JSON object inside a single fenced code block, like:

\`\`\`json
{
  "3": "markdown content for §3...",
  "8": "markdown table for §8...",
  "14": "bulleted timeline for §14...",
  "15": "sources table for §15..."
}
\`\`\`

Omit keys for sections you cannot ground. Do not emit empty strings — if a section is omitted, leave its key out of the JSON entirely. An empty object \`{}\` is the correct answer when the source URL is unreachable.

After the JSON block, do not write anything else. No preamble, no closing remarks.`;

const SYSTEM_PROMPT = MODE === "url-anchor" ? URL_ANCHOR_SYSTEM_PROMPT : BRIEF_ANCHOR_SYSTEM_PROMPT;

// ── per-item processing ────────────────────────────────────────────
const tally = { ok: 0, zero_sections: 0, sonnet_failed: 0, parse_failed: 0, db_failed: 0 };
const sectionCoverage = { "3": 0, "4": 0, "8": 0, "10": 0, "11": 0, "14": 0, "15": 0 };
const itemsWithZero = [];

log(`# RUN start ${new Date().toISOString()} — ${remaining.length} items remaining, cumulative cost $${checkpoint.total_cost.toFixed(2)}`);

for (let i = 0; i < remaining.length; i++) {
  const row = remaining[i];
  const idx = i + 1;
  const total = remaining.length;

  // Budget gate — check BEFORE the call.
  if (checkpoint.total_cost >= BUDGET_CAP_USD) {
    console.log(`\n[A5.4] BUDGET CAP HIT: cumulative cost $${checkpoint.total_cost.toFixed(2)} >= $${BUDGET_CAP_USD}. Halting before item ${idx}/${total}.`);
    log(`BUDGET_CAP_HIT cumulative=$${checkpoint.total_cost.toFixed(2)} at_item=${idx}/${total}`);
    break;
  }

  const userMessage = MODE === "url-anchor"
    ? `INPUT ITEM (D1 Regulations, EMPTY-shell backfill):
- legacy_id: ${row.legacy_id || row.id.slice(0, 8)}
- title: ${row.title}
- priority: ${row.priority || "(unknown)"}
- jurisdictions: ${JSON.stringify(row.jurisdictions || [])}
- topic_tags: ${JSON.stringify(row.topic_tags || [])}
- source_url: ${row.source_url || "(none)"}
- summary: ${(row.summary || "").slice(0, 800)}

THIS ITEM HAS NO FULL_BRIEF. Begin by using web_search to fetch the source_url and read its content. Then produce the JSON object with up to 7 section keys per the system prompt. Omit any section you cannot ground. Return an empty {} if the source URL is unreachable, paywalled, or returns content unrelated to the title.`
    : `INPUT ITEM (D1 Regulations):
- legacy_id: ${row.legacy_id || row.id.slice(0, 8)}
- title: ${row.title}
- jurisdictions: ${JSON.stringify(row.jurisdictions || [])}
- topic_tags: ${JSON.stringify(row.topic_tags || [])}
- source_url: ${row.source_url || "(none)"}
- summary: ${(row.summary || "").slice(0, 500)}

EXISTING LEGACY FULL_BRIEF (predates §3-§15 contract; your primary anchor):
${(row.full_brief || "").slice(0, 30000)}

Produce the JSON object with up to 7 section keys per the system prompt. Use web_search sparingly to ground specific facts when needed. Omit any section you cannot ground.`;

  let claudeRes;
  const sonnetStart = Date.now();
  try {
    claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: WEB_SEARCH_MAX_USES,
          },
        ],
      }),
      signal: AbortSignal.timeout(360_000),
    });
  } catch (e) {
    const isTimeout = e.name === "TimeoutError" || e.name === "AbortError";
    console.log(`[A5.4] item ${idx}/${total} (${row.legacy_id || row.id.slice(0, 8)}): SONNET_${isTimeout ? "TIMEOUT" : "NETWORK"} ${e.message?.slice(0, 200)}`);
    log(`[${row.legacy_id || row.id}] SONNET_${isTimeout ? "TIMEOUT" : "NETWORK"} ${e.message?.slice(0, 200)}`);
    tally.sonnet_failed++;
    continue;
  }

  if (!claudeRes.ok) {
    const errBody = await claudeRes.text();
    console.log(`[A5.4] item ${idx}/${total} (${row.legacy_id || row.id.slice(0, 8)}): SONNET_${claudeRes.status} ${errBody.slice(0, 200)}`);
    log(`[${row.legacy_id || row.id}] SONNET_${claudeRes.status} ${errBody.slice(0, 200)}`);
    tally.sonnet_failed++;
    // If it's a 429 / overload, halt rather than burning the rest of the queue.
    if (claudeRes.status === 429 || claudeRes.status === 529) {
      console.log(`[A5.4] HALT on ${claudeRes.status} — rate limited / overloaded. Re-run later.`);
      log(`HALT_ON_${claudeRes.status} at_item=${idx}/${total}`);
      break;
    }
    continue;
  }

  const data = await claudeRes.json();
  const sonnetMs = Date.now() - sonnetStart;

  // Cost computation: tokens + web search usage.
  const inputTokens = data.usage?.input_tokens || 0;
  const outputTokens = data.usage?.output_tokens || 0;
  // server_tool_use.web_search_requests is where the SDK reports
  // billable searches; fall back to counting server_tool_use blocks.
  let webSearches = data.usage?.server_tool_use?.web_search_requests || 0;
  if (!webSearches && Array.isArray(data.content)) {
    webSearches = data.content.filter((b) => b.type === "server_tool_use" && b.name === "web_search").length;
  }
  const tokenCost = (inputTokens / 1e6) * PRICE_PER_M_INPUT + (outputTokens / 1e6) * PRICE_PER_M_OUTPUT;
  const searchCost = webSearches * PRICE_PER_WEB_SEARCH;
  const itemCost = tokenCost + searchCost;
  checkpoint.total_cost += itemCost;

  // Parse JSON block from text content.
  const rawText = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  let sectionsObj = tolerantJsonParse(rawText);
  if (!sectionsObj) {
    console.log(`[A5.4] item ${idx}/${total} (${row.legacy_id || row.id.slice(0, 8)}): PARSE_FAIL cost=$${itemCost.toFixed(3)} cumulative=$${checkpoint.total_cost.toFixed(2)}`);
    log(`[${row.legacy_id || row.id}] PARSE_FAIL raw_full=${rawText.replace(/\n/g, " ").slice(0, 2000)} cost=$${itemCost.toFixed(3)}`);
    tally.parse_failed++;
    // Save checkpoint cost even on parse fail — we still paid for the tokens.
    saveCheckpoint();
    continue;
  }

  // Filter to recognized section keys with non-empty content.
  const keys = Object.keys(sectionsObj).filter((k) => SECTION_KEYS.includes(k) && typeof sectionsObj[k] === "string" && sectionsObj[k].trim().length > 0);

  if (keys.length === 0) {
    // Honest zero-section result. The customer surface renders the
    // "Detailed sections pending" affordance — this is acceptable per
    // the integrity rule.
    console.log(`[A5.4] item ${idx}/${total} (${row.legacy_id || row.id.slice(0, 8)}): 0 sections generated, $${itemCost.toFixed(3)} cost ($${checkpoint.total_cost.toFixed(2)} cumulative, ${sonnetMs}ms, ${webSearches} searches)`);
    log(`[${row.legacy_id || row.id}] ZERO_SECTIONS cost=$${itemCost.toFixed(3)} ms=${sonnetMs} searches=${webSearches}`);
    tally.zero_sections++;
    itemsWithZero.push({ id: row.id, legacy_id: row.legacy_id, title: row.title });
    checkpoint.completed_ids.push(row.id);
    saveCheckpoint();
    continue;
  }

  // Build upsert payload.
  const sectionRows = keys.map((key) => ({
    item_id: row.id,
    section_key: key,
    section_order: SECTION_ORDER[key] ?? 999,
    content_md: sectionsObj[key].trim(),
    is_conditional: false, // all 7 §3-§15 sections are spec-mandated "Always" per A5.2.
    source_ids: [], // Sonnet pass doesn't resolve source UUIDs; backfilled later if needed.
  }));

  const { error: upErr } = await supabase
    .from("intelligence_item_sections")
    .upsert(sectionRows, { onConflict: "item_id,section_key" });

  if (upErr) {
    console.log(`[A5.4] item ${idx}/${total} (${row.legacy_id || row.id.slice(0, 8)}): DB_FAIL ${upErr.message} cost=$${itemCost.toFixed(3)} cumulative=$${checkpoint.total_cost.toFixed(2)}`);
    log(`[${row.legacy_id || row.id}] DB_FAIL ${upErr.message} cost=$${itemCost.toFixed(3)}`);
    tally.db_failed++;
    // Don't mark checkpoint complete — retry on next run.
    saveCheckpoint();
    continue;
  }

  for (const k of keys) sectionCoverage[k] = (sectionCoverage[k] || 0) + 1;
  tally.ok++;
  checkpoint.completed_ids.push(row.id);
  saveCheckpoint();

  console.log(`[A5.4] item ${idx}/${total} (${row.legacy_id || row.id.slice(0, 8)}): ${keys.length} sections generated [${keys.join(",")}], $${itemCost.toFixed(3)} cost ($${checkpoint.total_cost.toFixed(2)} cumulative, ${sonnetMs}ms, ${webSearches} searches)`);
  log(`[${row.legacy_id || row.id}] OK sections=${keys.length} [${keys.join(",")}] cost=$${itemCost.toFixed(3)} ms=${sonnetMs} searches=${webSearches}`);
}

log(`# RUN end ${new Date().toISOString()} — ok=${tally.ok} zero=${tally.zero_sections} sonnet_fail=${tally.sonnet_failed} parse_fail=${tally.parse_failed} db_fail=${tally.db_failed} cost=$${checkpoint.total_cost.toFixed(2)}`);

printFinalReport(uncovered.length);

// ── final report helper ────────────────────────────────────────────
function printFinalReport(uncoveredTotal) {
  console.log("\n[A5.4] === Final coverage report ===");
  console.log(`Uncovered D1 items targeted:    ${uncoveredTotal}`);
  console.log(`Items processed this run:       ${tally.ok + tally.zero_sections + tally.sonnet_failed + tally.parse_failed + tally.db_failed}`);
  console.log(`  Sections written successfully: ${tally.ok}`);
  console.log(`  Zero-section (integrity OK):   ${tally.zero_sections}`);
  console.log(`  Sonnet failures:               ${tally.sonnet_failed}`);
  console.log(`  Parse failures:                ${tally.parse_failed}`);
  console.log(`  DB failures:                   ${tally.db_failed}`);
  console.log(`Cumulative checkpoint completed: ${checkpoint.completed_ids.length}`);
  console.log(`Total cost:                     $${checkpoint.total_cost.toFixed(2)}`);
  console.log("\nPer-section coverage (count of items where the section was written):");
  for (const key of SECTION_KEYS) {
    const pct = tally.ok > 0 ? ((sectionCoverage[key] / tally.ok) * 100).toFixed(1) : "0.0";
    console.log(`  §${key.padEnd(2)}: ${String(sectionCoverage[key]).padStart(4)} / ${tally.ok}  (${pct}%)`);
  }
  if (itemsWithZero.length > 0) {
    console.log(`\nFirst 10 items with 0 sections (integrity-rule omissions):`);
    for (const it of itemsWithZero.slice(0, 10)) {
      console.log(`  - ${it.legacy_id || it.id}: ${(it.title || "").slice(0, 80)}`);
    }
  }
  console.log("");
}
