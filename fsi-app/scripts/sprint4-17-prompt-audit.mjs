/**
 * sprint4-17-prompt-audit.mjs  (Sprint 4 Block 1 — task 1.7 auto-test)
 *
 * Confirms the claim-level provenance contract added to
 * src/lib/agent/system-prompt.ts "takes effect": that the agent, given the
 * new SYSTEM_PROMPT, actually emits the inline FACT/ANALYSIS/LEGAL labels,
 * the explicit-GAP form, and a well-formed Claim Provenance Ledger with the
 * regulation required-slots covered.
 *
 * STRICTLY NON-PERSISTING. This script issues ONLY read queries against
 * Supabase (select). It NEVER calls .insert/.update/.upsert/.delete. It calls
 * the Anthropic API to generate, inspects the raw text, prints a contract
 * compliance matrix, and writes nothing back. Cost is bounded by --max-items
 * and --max-searches; default run is 3 items.
 *
 * Usage:
 *   node scripts/sprint4-17-prompt-audit.mjs            # 3 items, web_search max 4
 *   node scripts/sprint4-17-prompt-audit.mjs --max-searches=0   # no web_search (cheapest, structural only)
 *   node scripts/sprint4-17-prompt-audit.mjs --max-items=1
 */

import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");
process.chdir(APP_ROOT);

// ── env ──
const envText = readFileSync(resolve(APP_ROOT, ".env.local"), "utf8");
const env = (k) => envText.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const ANTHROPIC_KEY = env("ANTHROPIC_API_KEY");
if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANTHROPIC_KEY) {
  console.error("[1.7-audit] missing env (SUPABASE url/key or ANTHROPIC key)");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── args ──
const argv = process.argv.slice(2);
const numArg = (name, def) => {
  const a = argv.find((x) => x.startsWith(`--${name}=`));
  return a ? parseInt(a.split("=")[1], 10) : def;
};
const MAX_ITEMS = numArg("max-items", 3);
const MAX_SEARCHES = numArg("max-searches", 4);

// ── compile SYSTEM_PROMPT from the .ts source (no imports in that file) ──
mkdirSync("./.audit-out", { recursive: true });
writeFileSync("./.audit-out/tsconfig.json", JSON.stringify({
  compilerOptions: { target: "es2022", module: "es2022", moduleResolution: "node", esModuleInterop: true, rootDir: "../src/lib/agent", outDir: "./out", strict: false },
  include: ["../src/lib/agent/system-prompt.ts"],
}));
execSync("npx tsc -p ./.audit-out/tsconfig.json", { stdio: "inherit" });
const { SYSTEM_PROMPT } = await import(`file://${resolve(APP_ROOT, ".audit-out", "out", "system-prompt.js")}`);

// ── select 3 representative items (READ ONLY) ──
// 1 regulation-family at CRITICAL/HIGH (slots + LEGAL + verify path),
// 1 regulation-family at MODERATE/LOW (verified path),
// 1 non-regulation (market_signal/research) — contract on non-reg.
const REG_FORMATS = ["regulation", "directive", "standard", "guidance", "framework"];
async function pick(filterFn, n) {
  const { data } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, title, summary, item_type, domain, jurisdictions, topic_tags, source_url, source_id, full_brief, priority")
    .eq("is_archived", false)
    .not("source_url", "is", null)
    .neq("source_url", "")
    .limit(400);
  return (data || []).filter(filterFn).slice(0, n);
}
const all = await pick(() => true, 400);
const regHi = all.filter((i) => REG_FORMATS.includes(i.item_type) && (i.priority === "CRITICAL" || i.priority === "HIGH"));
const regLo = all.filter((i) => REG_FORMATS.includes(i.item_type) && (i.priority === "MODERATE" || i.priority === "LOW"));
const nonReg = all.filter((i) => !REG_FORMATS.includes(i.item_type));
const picks = [regHi[0], regLo[0], nonReg[0]].filter(Boolean).slice(0, MAX_ITEMS);

console.log(`[1.7-audit] selected ${picks.length} items (max_searches=${MAX_SEARCHES}, NON-PERSISTING):`);
for (const p of picks) console.log(`  - [${p.legacy_id || p.id.slice(0, 8)}] ${p.item_type}/${p.priority}: ${p.title.slice(0, 60)}`);
console.log("");

// ── minimal source pool (READ ONLY) ──
async function poolFor(item) {
  const ids = new Set();
  const rows = [];
  if (item.source_id) {
    const { data } = await supabase.from("sources").select("id, url, title, publisher, published_at").eq("id", item.source_id).limit(1);
    for (const s of data || []) { if (!ids.has(s.id)) { ids.add(s.id); rows.push(s); } }
  }
  const { data: more } = await supabase
    .from("sources").select("id, url, title, publisher, published_at").eq("status", "active").limit(12);
  for (const s of more || []) { if (!ids.has(s.id)) { ids.add(s.id); rows.push(s); } }
  return rows.slice(0, 12);
}

// ── contract checks on raw output ──
const ANALYSIS_LABELS = [
  "*Per the workspace's reading:*",
  "*Analytical inference:*",
  "*Industry interpretation:*",
  "*Operational implication:*",
];
const LEGAL_LABEL = "*Legal Confirmation Required:*";
const REQUIRED_SLOTS = ["effective_date", "primary_deadline", "jurisdictional_scope", "penalty_summary"];

function auditOutput(item, rawText) {
  const r = { checks: {}, ledger: null, notes: [] };
  // Ledger block
  const m = /<<<CLAIM_PROVENANCE_LEDGER\s*([\s\S]*?)\s*CLAIM_PROVENANCE_LEDGER>>>/.exec(rawText);
  r.checks.ledger_block_present = !!m;
  if (m) {
    try {
      r.ledger = JSON.parse(m[1].trim());
      r.checks.ledger_valid_json = Array.isArray(r.ledger);
    } catch (e) {
      r.checks.ledger_valid_json = false;
      r.notes.push(`ledger JSON parse fail: ${e.message.slice(0, 120)}`);
    }
  }
  const ledger = Array.isArray(r.ledger) ? r.ledger : [];
  const kinds = new Set(ledger.map((x) => x.claim_kind));
  r.checks.kinds_valid = ledger.every((x) => ["FACT", "ANALYSIS", "LEGAL", "GAP"].includes(x.claim_kind));
  // FACT records well-formed
  const facts = ledger.filter((x) => x.claim_kind === "FACT");
  r.checks.fact_records_grounded = facts.length === 0 || facts.every((x) => x.source_span && (x.source_id || x.source_url));
  if (!r.checks.fact_records_grounded) {
    const bad = facts.filter((x) => !(x.source_span && (x.source_id || x.source_url)));
    for (const b of bad.slice(0, 3)) r.notes.push(`ungrounded FACT: span=${b.source_span ? "Y" : "N"} src_id=${b.source_id ? "Y" : "N"} src_url=${b.source_url ? "Y" : "N"} :: ${(b.claim_text || "").slice(0, 70)}`);
  }
  r.notes.push(`ledger rows=${ledger.length} FACT=${facts.length} ANALYSIS=${ledger.filter((x)=>x.claim_kind==="ANALYSIS").length} LEGAL=${ledger.filter((x)=>x.claim_kind==="LEGAL").length} GAP=${ledger.filter((x)=>x.claim_kind==="GAP").length}`);
  // Inline ANALYSIS labels present in prose iff ledger has ANALYSIS
  const analysisInProse = ANALYSIS_LABELS.some((l) => rawText.includes(l));
  r.checks.analysis_label_when_used = !kinds.has("ANALYSIS") || analysisInProse;
  // LEGAL routing
  const legalInProse = rawText.includes(LEGAL_LABEL);
  r.checks.legal_routed_when_used = !kinds.has("LEGAL") || legalInProse;
  // GAP explicit form
  const gapInProse = /\*Specific .*not available from primary sources as of/i.test(rawText);
  r.checks.gap_form_when_used = !kinds.has("GAP") || gapInProse;
  // Required slots for regulation-family items
  if (REG_FORMATS.includes(item.item_type)) {
    const covered = new Set(ledger.filter((x) => ["FACT", "GAP"].includes(x.claim_kind)).map((x) => x.slot_key).filter(Boolean));
    r.checks.required_slots_covered = REQUIRED_SLOTS.every((s) => covered.has(s));
    r.notes.push(`slots covered: ${[...covered].filter((s)=>REQUIRED_SLOTS.includes(s)).join(",") || "none"}`);
  }
  return r;
}

// ── run ──
let totalCost = 0;
const results = [];
for (let i = 0; i < picks.length; i++) {
  const item = picks[i];
  const pool = await poolFor(item);
  const userMessage = `INPUT ITEM:
- id: ${item.id}
- title: ${item.title}
- item_type: ${item.item_type}
- priority: ${item.priority}
- jurisdictions: ${JSON.stringify(item.jurisdictions || [])}
- topic_tags: ${JSON.stringify(item.topic_tags || [])}
- source_url: ${item.source_url}
- existing brief preview: ${(item.full_brief || item.summary || "").slice(0, 1500)}

WORKSPACE PROFILE:
- cargo_verticals: live events, fine art, luxury goods, film and TV, high-value automotive, humanitarian
- transport_mode_priority: air primary, road secondary, ocean tertiary
- trade_lanes: Americas, Europe, Asia
- supply_chain_role: freight forwarder

AVAILABLE SOURCES (use only these UUIDs for source_id):
${JSON.stringify(pool.map((s) => ({ id: s.id, url: s.url, title: s.title, publisher: s.publisher, date: s.published_at })), null, 2)}

Generate the brief per the format selected by item_type. Follow the claim-level provenance contract: label every substantive claim, span-ground every FACT or recast as an explicit GAP, route legal conclusions to the Legal Confirmation Required callout, and emit the Claim Provenance Ledger.`;

  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  };
  if (MAX_SEARCHES > 0) {
    body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: MAX_SEARCHES }];
  }

  const t0 = Date.now();
  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(360_000),
    });
  } catch (e) {
    console.log(`[1.7-audit] item ${i + 1}: API error ${e.message?.slice(0, 160)}`);
    results.push({ item, error: e.message });
    continue;
  }
  if (!res.ok) {
    console.log(`[1.7-audit] item ${i + 1}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    results.push({ item, error: `HTTP ${res.status}` });
    continue;
  }
  const data = await res.json();
  const rawText = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const inTok = data.usage?.input_tokens || 0, outTok = data.usage?.output_tokens || 0;
  let searches = data.usage?.server_tool_use?.web_search_requests || 0;
  const cost = (inTok / 1e6) * 3 + (outTok / 1e6) * 15 + searches * 0.01;
  totalCost += cost;
  const audit = auditOutput(item, rawText);
  results.push({ item, audit, cost, ms: Date.now() - t0, searches, rawLen: rawText.length });

  console.log(`\n=== item ${i + 1}/${picks.length}: [${item.legacy_id || item.id.slice(0, 8)}] ${item.item_type}/${item.priority} ===`);
  console.log(`  cost=$${cost.toFixed(3)} (in=${inTok} out=${outTok} searches=${searches}) ${Date.now() - t0}ms raw=${rawText.length}ch`);
  for (const [k, v] of Object.entries(audit.checks)) console.log(`  [${v ? "PASS" : "FAIL"}] ${k}`);
  for (const n of audit.notes) console.log(`    · ${n}`);
}

// ── summary ──
console.log("\n" + "=".repeat(64));
console.log("1.7 PROMPT AUDIT SUMMARY");
console.log("=".repeat(64));
let pass = 0, fail = 0;
for (const r of results) {
  if (!r.audit) { console.log(`  ${r.item.legacy_id || r.item.id.slice(0,8)}: ERROR ${r.error}`); continue; }
  const checks = Object.values(r.audit.checks);
  const ok = checks.every(Boolean);
  ok ? pass++ : fail++;
  const failed = Object.entries(r.audit.checks).filter(([, v]) => !v).map(([k]) => k);
  console.log(`  ${r.item.legacy_id || r.item.id.slice(0,8)} (${r.item.item_type}/${r.item.priority}): ${ok ? "ALL PASS" : "FAIL → " + failed.join(", ")}`);
}
console.log(`\nItems all-pass: ${pass}/${results.length}   total cost: $${totalCost.toFixed(2)}`);
console.log("NOTE: nothing was written to the database (read-only + generate-and-inspect).");

rmSync("./.audit-out", { recursive: true, force: true });
