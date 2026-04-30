// Phase B.2.5 pilot: regenerate 5 diverse items end-to-end through the
// new 13-field contract. Validates that the agent emits the four
// intersection-readiness fields cleanly and they persist to the DB.
//
// Selection: 1 regulation (CBAM), 1 directive (CSRD), 1 standard (ISO
// 14083), 1 technology (SAF / e-fuels item), 1 research finding. Spans
// all 5 format types except market_signal.

import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Run from project root regardless of where this script is invoked from
const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, "..", ".."));

process.loadEnvFile(".env.local");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TOKEN_BWS = process.env.BROWSERLESS_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

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
// tsc preserves include-path directory structure in outDir when multiple
// directories are included. lib/agent/* lands at out/agent/*; lib/sources/*
// lands at out/sources/*.
const { SYSTEM_PROMPT } = await import(`file://${outDir}/agent/system-prompt.js`);
const { parseAgentOutput } = await import(`file://${outDir}/agent/parse-output.js`);
const { buildSourcePool } = await import(`file://${outDir}/agent/source-pool.js`);
const { browserlessRender } = await import(`file://${outDir}/sources/browserless.js`);

// Pick 5 items by legacy_id covering 4-5 format types
const TARGETS_BY_LEGACY = ["t1"]; // CBAM retry after intersection_summary cap raised to 600

const { data: items } = await supabase
  .from("intelligence_items")
  .select("id, legacy_id, title, source_url, source_id, item_type, domain, jurisdictions, topic_tags, full_brief")
  .in("legacy_id", TARGETS_BY_LEGACY);

console.log("targets:");
for (const i of items || []) console.log(`  [${i.legacy_id}] ${i.title}  type=${i.item_type}  src=${i.source_url ? "yes" : "NO"}`);

const results = [];
let totalCost = 0;

for (const item of items || []) {
  console.log(`\n${"=".repeat(72)}\n[${item.legacy_id}] ${item.title}\n${"=".repeat(72)}`);
  if (!item.source_url) { console.log("  no source_url, skip"); continue; }

  // Fetch via Browserless
  let sourceContent = "";
  let fetchMs = 0;
  try {
    const r = await browserlessRender(item.source_url, { maxTextLength: 80000 });
    sourceContent = r.text;
    fetchMs = r.renderMs;
    console.log(`  fetch: ${r.status} OK render=${fetchMs}ms text=${r.textLength}`);
  } catch (e) {
    console.log(`  ✗ fetch failed: ${e.message?.slice(0, 200)}`);
    results.push({ legacy_id: item.legacy_id, status: "fetch_failed", err: e.message });
    continue;
  }

  // Source pool
  const pool = await buildSourcePool(supabase, {
    id: item.id,
    source_id: item.source_id,
    domain: item.domain,
    jurisdictions: item.jurisdictions,
    topic_tags: item.topic_tags,
  });

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

Generate the brief per the format selected by item_type, then emit the YAML frontmatter block as instructed. The frontmatter MUST include all 12 metadata fields (severity, priority, urgency_tier, format_type, topic_tags, operational_scenario_tags, compliance_object_tags, related_items, intersection_summary, sources_used, last_regenerated_at, regeneration_skill_version).`;

  const sonnetStart = Date.now();
  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 16000, system: SYSTEM_PROMPT, messages: [{ role: "user", content: userMessage }] }),
  });
  if (!claudeRes.ok) {
    const errBody = await claudeRes.text();
    console.log(`  ✗ Sonnet ${claudeRes.status}: ${errBody.slice(0, 200)}`);
    results.push({ legacy_id: item.legacy_id, status: "sonnet_failed" });
    continue;
  }
  const data = await claudeRes.json();
  const sonnetMs = Date.now() - sonnetStart;
  const rawText = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const cost = (data.usage.input_tokens / 1e6) * 3 + (data.usage.output_tokens / 1e6) * 15;
  totalCost += cost;
  console.log(`  sonnet: ${sonnetMs}ms in=${data.usage.input_tokens} out=${data.usage.output_tokens} cost=$${cost.toFixed(3)} total=$${totalCost.toFixed(3)}`);

  let body, metadata;
  try {
    const parsed = parseAgentOutput(rawText);
    body = parsed.body;
    metadata = parsed.metadata;
  } catch (e) {
    console.log(`  ✗ parse: ${e.message}`);
    console.log("  raw tail:", rawText.slice(-400));
    results.push({ legacy_id: item.legacy_id, status: "parse_failed", err: e.message });
    continue;
  }

  console.log(`  parsed OK:`);
  console.log(`    brief=${body.length} chars  severity=${metadata.severity}  format=${metadata.format_type}`);
  console.log(`    topic_tags=${JSON.stringify(metadata.topic_tags)}`);
  console.log(`    op_scenario_tags=${JSON.stringify(metadata.operational_scenario_tags)}`);
  console.log(`    compliance_object_tags=${JSON.stringify(metadata.compliance_object_tags)}`);
  console.log(`    related_items=${metadata.related_items.length}  intersection_summary=${metadata.intersection_summary ? `${metadata.intersection_summary.length}c` : "null"}`);
  console.log(`    sources_used=${metadata.sources_used.length}`);

  // Persist (this is a real B.2.5 pilot — write to DB)
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
  if (updErr) console.log(`  ✗ DB update: ${updErr.message}`);
  else console.log(`  ✓ DB updated`);

  results.push({
    legacy_id: item.legacy_id,
    status: "ok",
    fetchMs, sonnetMs, cost,
    briefLen: body.length,
    severity: metadata.severity,
    format: metadata.format_type,
    topic_tags: metadata.topic_tags,
    op_scenario_tags: metadata.operational_scenario_tags,
    compliance_object_tags: metadata.compliance_object_tags,
    related_items_n: metadata.related_items.length,
    intersection_present: metadata.intersection_summary !== null,
    sources_used_n: metadata.sources_used.length,
  });
}

console.log("\n" + "=".repeat(72));
console.log("PILOT SUMMARY");
console.log("=".repeat(72));
console.log(`total cost: $${totalCost.toFixed(3)}`);
console.log(`results: ${results.filter((r) => r.status === "ok").length} ok, ${results.filter((r) => r.status !== "ok").length} failed`);
for (const r of results) {
  if (r.status === "ok") {
    console.log(`  [${r.legacy_id}] ${r.format.padEnd(24)} brief=${r.briefLen.toString().padStart(5)} sev=${r.severity.padEnd(15)} op_scen=${r.op_scenario_tags.length} comp_obj=${r.compliance_object_tags.length} related=${r.related_items_n} inter=${r.intersection_present ? "Y" : "n"} src=${r.sources_used_n}`);
  } else {
    console.log(`  [${r.legacy_id}] ${r.status} ${r.err?.slice(0, 80) || ""}`);
  }
}

rmSync("./.test-out", { recursive: true });
