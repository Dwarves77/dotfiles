// Phase B.2 full regeneration runner.
//
// Sequentially regenerates all intelligence_items under the SKILL.md
// 2026-04-29 contract (13 emission fields, intersection-readiness).
//
// Behavior:
//   - Pulls candidates: source_url is not null, item_type is a known
//     format, regeneration_skill_version != "2026-04-29".
//   - Sorts by priority CRITICAL → HIGH → MODERATE → LOW (most urgent
//     items get fresh briefs first; if the run is interrupted, the
//     remaining work is the lowest-priority tail).
//   - For each item: Browserless fetch → Sonnet call → parse → DB
//     update. Writes one log line per item to b2-progress.log.
//   - Idempotent: re-running picks up where it left off because
//     successfully regenerated items have regeneration_skill_version
//     set to the current contract.
//
// Cost: ~$0.15 per item × ~152 items ≈ $22.80 estimated.
// Time: ~150 sec per item × 152 ≈ 6.3 hours wall time sequential.
//
// Usage:
//   node supabase/seed/b2-runner.mjs                 # process all
//   node supabase/seed/b2-runner.mjs --limit=10      # first 10 only
//   node supabase/seed/b2-runner.mjs --legacy=g2,g6  # specific items
//   node supabase/seed/b2-runner.mjs --dry-run       # no writes

import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import { mkdirSync, writeFileSync, rmSync, appendFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, "..", ".."));

process.loadEnvFile(".env.local");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// Args
const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const legacyArg = args.find((a) => a.startsWith("--legacy="));
const dryRun = args.includes("--dry-run");
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;
const legacyList = legacyArg ? legacyArg.split("=")[1].split(",") : null;

const SKILL_VERSION = "2026-04-29";
const LOG_PATH = resolve(process.cwd(), "supabase", "seed", "b2-progress.log");

// Compile shared TS modules
mkdirSync("./.test-out", { recursive: true });
writeFileSync("./.test-out/tsconfig.json", JSON.stringify({
  compilerOptions: { target: "es2022", module: "es2022", moduleResolution: "node", esModuleInterop: true, outDir: "./out", strict: false },
  include: [
    "../src/lib/agent/parse-output.ts",
    "../src/lib/agent/system-prompt.ts",
    "../src/lib/agent/source-pool.ts",
    "../src/lib/sources/browserless.ts",
  ],
}));
execSync("npx tsc -p ./.test-out/tsconfig.json", { stdio: "inherit" });
const outDir = resolve(process.cwd(), ".test-out", "out");
const { SYSTEM_PROMPT } = await import(`file://${outDir}/agent/system-prompt.js`);
const { parseAgentOutput } = await import(`file://${outDir}/agent/parse-output.js`);
const { buildSourcePool } = await import(`file://${outDir}/agent/source-pool.js`);
const { browserlessRender } = await import(`file://${outDir}/sources/browserless.js`);

// Build the work queue
let q = supabase
  .from("intelligence_items")
  .select("id, legacy_id, title, source_url, source_id, item_type, domain, jurisdictions, topic_tags, full_brief, priority, regeneration_skill_version, is_archived")
  .not("source_url", "is", null)
  .neq("source_url", "")
  .eq("is_archived", false);

const { data: allItems } = await q;

// Filter by legacy list if provided
let candidates = allItems || [];
if (legacyList) {
  candidates = candidates.filter((i) => legacyList.includes(i.legacy_id));
}

// Skip ghost FK targets (ss1-ss5) and items with no item_type fitting our formats
const KNOWN_FORMATS = new Set([
  "regulation", "directive", "standard", "guidance", "framework",
  "technology", "innovation", "tool",
  "regional_data",
  "market_signal", "initiative",
  "research_finding",
]);
candidates = candidates.filter((i) => i.item_type && KNOWN_FORMATS.has(i.item_type));
candidates = candidates.filter((i) => !i.legacy_id?.startsWith("ss") && !i.legacy_id?.startsWith("arc"));

// Skip items already regenerated under current contract
const todo = candidates.filter((i) => i.regeneration_skill_version !== SKILL_VERSION);
const done = candidates.filter((i) => i.regeneration_skill_version === SKILL_VERSION);

// Sort by priority — CRITICAL first
const PRI_ORDER = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };
todo.sort((a, b) => (PRI_ORDER[a.priority] ?? 9) - (PRI_ORDER[b.priority] ?? 9));

const targets = todo.slice(0, limit);

console.log("=== B.2 RUNNER ===");
console.log(`SKILL contract version: ${SKILL_VERSION}`);
console.log(`Total candidate items: ${candidates.length}`);
console.log(`Already regenerated:   ${done.length}`);
console.log(`Remaining (todo):      ${todo.length}`);
console.log(`This run will process: ${targets.length}${legacyList ? ` (filtered by legacy_id)` : ""}${dryRun ? " [DRY RUN]" : ""}`);
console.log(`Logging to: ${LOG_PATH}`);
console.log("");

if (targets.length === 0) {
  console.log("Nothing to do. All candidates are at current contract version.");
  rmSync("./.test-out", { recursive: true });
  process.exit(0);
}

if (!existsSync(LOG_PATH)) {
  appendFileSync(LOG_PATH, `# B.2 progress log — started ${new Date().toISOString()}\n`);
}
appendFileSync(LOG_PATH, `\n# RUN start ${new Date().toISOString()} — ${targets.length} items, dryRun=${dryRun}\n`);

let totalCost = 0;
const tally = { ok: 0, fetch_failed: 0, sonnet_failed: 0, parse_failed: 0, db_failed: 0 };

for (let i = 0; i < targets.length; i++) {
  const item = targets[i];
  const t0 = Date.now();
  console.log(`\n[${i + 1}/${targets.length}] [${item.legacy_id || item.id.slice(0, 8)}] ${item.title.slice(0, 60)} (${item.item_type}, ${item.priority})`);

  // 1. Browserless fetch
  let sourceContent = "";
  let fetchMs = 0;
  try {
    const r = await browserlessRender(item.source_url, { maxTextLength: 80000 });
    sourceContent = r.text;
    fetchMs = r.renderMs;
    console.log(`    fetch: ${r.status} OK render=${fetchMs}ms text=${r.textLength}`);
  } catch (e) {
    const msg = e.message?.slice(0, 200) || String(e).slice(0, 200);
    console.log(`    ✗ fetch: ${msg}`);
    appendFileSync(LOG_PATH, `${new Date().toISOString()} [${item.legacy_id || item.id}] FETCH_FAIL ${msg}\n`);
    tally.fetch_failed++;
    continue;
  }

  // 2. Source pool
  const pool = await buildSourcePool(supabase, {
    id: item.id,
    source_id: item.source_id,
    domain: item.domain,
    jurisdictions: item.jurisdictions,
    topic_tags: item.topic_tags,
  });

  // 3. User message
  const userMessage = `INPUT ITEM:
- id: ${item.id}
- title: ${item.title}
- item_type: ${item.item_type}
- domain: ${item.domain ?? "(null)"}
- jurisdictions: ${JSON.stringify(item.jurisdictions || [])}
- topic_tags: ${JSON.stringify(item.topic_tags || [])}
- source_url: ${item.source_url}
- existing brief preview: ${(item.full_brief || "").slice(0, 1500)}

SOURCE CONTENT (truncated):
${sourceContent}

WORKSPACE PROFILE:
- cargo_verticals: live events, fine art, luxury goods, film and TV, high-value automotive, humanitarian
- transport_mode_priority: air primary, road secondary, ocean tertiary
- trade_lanes: Americas, Europe, Asia
- supply_chain_role: freight forwarder

AVAILABLE SOURCES (for sources_used and related_items; use only these UUIDs):
${JSON.stringify(pool.sources, null, 2)}

Generate the brief per the format selected by item_type, then emit the YAML frontmatter block as instructed. The frontmatter MUST include all 12 metadata fields.`;

  // 4. Sonnet call (with 240s timeout — longest legitimate call observed
  // was 234s; anything longer is hung and should fail fast so the queue
  // moves on rather than blocking the entire run).
  const sonnetStart = Date.now();
  let claudeRes;
  try {
    claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 24000, system: SYSTEM_PROMPT, messages: [{ role: "user", content: userMessage }] }),
      signal: AbortSignal.timeout(240_000),
    });
  } catch (e) {
    const isTimeout = e.name === "TimeoutError" || e.name === "AbortError";
    console.log(`    ✗ sonnet ${isTimeout ? "timeout (>240s)" : "network"}: ${e.message?.slice(0, 200)}`);
    appendFileSync(LOG_PATH, `${new Date().toISOString()} [${item.legacy_id || item.id}] SONNET_${isTimeout ? "TIMEOUT" : "NETWORK"} ${e.message}\n`);
    tally.sonnet_failed++;
    continue;
  }
  if (!claudeRes.ok) {
    const errBody = await claudeRes.text();
    console.log(`    ✗ sonnet ${claudeRes.status}: ${errBody.slice(0, 200)}`);
    appendFileSync(LOG_PATH, `${new Date().toISOString()} [${item.legacy_id || item.id}] SONNET_${claudeRes.status} ${errBody.slice(0, 200)}\n`);
    tally.sonnet_failed++;
    continue;
  }
  const data = await claudeRes.json();
  const sonnetMs = Date.now() - sonnetStart;
  const rawText = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const cost = (data.usage.input_tokens / 1e6) * 3 + (data.usage.output_tokens / 1e6) * 15;
  totalCost += cost;
  console.log(`    sonnet: ${sonnetMs}ms in=${data.usage.input_tokens} out=${data.usage.output_tokens} cost=$${cost.toFixed(3)} total=$${totalCost.toFixed(2)}`);

  // 5. Parse
  let body, metadata;
  try {
    const parsed = parseAgentOutput(rawText);
    body = parsed.body;
    metadata = parsed.metadata;
  } catch (e) {
    console.log(`    ✗ parse: ${e.message}`);
    appendFileSync(LOG_PATH, `${new Date().toISOString()} [${item.legacy_id || item.id}] PARSE_FAIL ${e.message}  raw_tail=${rawText.slice(-200).replace(/\n/g, " ")}\n`);
    tally.parse_failed++;
    continue;
  }

  // 6. Persist
  if (!dryRun) {
    const { error: updErr } = await supabase
      .from("intelligence_items")
      .update({
        full_brief: body,
        severity: metadata.severity,
        priority: metadata.priority,
        urgency_tier: metadata.urgency_tier,
        format_type: metadata.format_type,
        topic_tags: metadata.topic_tags,
        operational_scenario_tags: metadata.operational_scenario_tags,
        compliance_object_tags: metadata.compliance_object_tags,
        related_items: metadata.related_items,
        intersection_summary: metadata.intersection_summary,
        sources_used: metadata.sources_used,
        last_regenerated_at: metadata.last_regenerated_at,
        regeneration_skill_version: metadata.regeneration_skill_version,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    if (updErr) {
      console.log(`    ✗ DB: ${updErr.message}`);
      appendFileSync(LOG_PATH, `${new Date().toISOString()} [${item.legacy_id || item.id}] DB_FAIL ${updErr.message}\n`);
      tally.db_failed++;
      continue;
    }
  }

  const totalMs = Date.now() - t0;
  console.log(`    ✓ brief=${body.length} sev=${metadata.severity} fmt=${metadata.format_type} op_scen=${metadata.operational_scenario_tags.length} comp_obj=${metadata.compliance_object_tags.length} rel=${metadata.related_items.length} inter=${metadata.intersection_summary ? "Y" : "n"} src=${metadata.sources_used.length} (${totalMs}ms total)`);
  appendFileSync(LOG_PATH, `${new Date().toISOString()} [${item.legacy_id || item.id}] OK brief=${body.length} sev=${metadata.severity} fmt=${metadata.format_type} op_scen=${metadata.operational_scenario_tags.length} comp_obj=${metadata.compliance_object_tags.length} rel=${metadata.related_items.length} inter=${metadata.intersection_summary ? "Y" : "n"} src=${metadata.sources_used.length} cost=$${cost.toFixed(3)} ms=${totalMs}\n`);
  tally.ok++;
}

console.log("\n" + "=".repeat(60));
console.log("RUN COMPLETE");
console.log("=".repeat(60));
console.log(`Processed:        ${targets.length}`);
console.log(`Successful:       ${tally.ok}`);
console.log(`Fetch failures:   ${tally.fetch_failed}`);
console.log(`Sonnet failures:  ${tally.sonnet_failed}`);
console.log(`Parse failures:   ${tally.parse_failed}`);
console.log(`DB failures:      ${tally.db_failed}`);
console.log(`Total spend:      $${totalCost.toFixed(2)}`);

appendFileSync(LOG_PATH, `# RUN end ${new Date().toISOString()} — ok=${tally.ok} fetch_fail=${tally.fetch_failed} sonnet_fail=${tally.sonnet_failed} parse_fail=${tally.parse_failed} db_fail=${tally.db_failed} cost=$${totalCost.toFixed(2)}\n`);

rmSync("./.test-out", { recursive: true });
