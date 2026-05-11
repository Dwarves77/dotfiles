// One-off: backfill the 2026-05-09 smoke-test stub row
// (finance.ec.europa.eu, intelligence_items.id=53c3fcd5-...) with the
// same Haiku call the patched drain worker now uses. Brings the row
// out of "title=source.name, summary='', pipeline_stage='draft'" state.
//
// Per docs/wave1b-stub-quality-investigation-2026-05-11.md Section
// "Resolution".
//
// Usage:
//   node scripts/tmp/backfill-finance-ec-europa.mjs

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(resolve(__dirname, "..", "..", ".env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !ANTHROPIC_API_KEY || !BROWSERLESS_API_KEY) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ANTHROPIC_API_KEY / BROWSERLESS_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const TARGET_ITEM_ID = "53c3fcd5-a234-4e97-a294-908dacb01c04";
const TARGET_SOURCE_URL = "https://finance.ec.europa.eu/";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const HAIKU_SYSTEM = `You are a content classifier. Given source URL, source metadata, and a content excerpt, return STRICT JSON {"item_type":"...","severity":"...","priority":"...","urgency_tier":"...","topic_tags":[],"jurisdictions":[],"title_candidate":"...","summary":"...","rationale":"..."}.

item_type: regulation|directive|standard|guidance|technology|market_signal|regional_data|research_finding|innovation|framework|tool|initiative
severity: ACTION REQUIRED|COST ALERT|WINDOW CLOSING|COMPETITIVE EDGE|MONITORING
priority: CRITICAL|HIGH|MODERATE|LOW
urgency_tier: watch|elevated|stable|informational

Output JSON only.`;

async function browserlessRender(url) {
  const res = await fetch(`https://chrome.browserless.io/content?token=${BROWSERLESS_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      waitForSelector: { selector: "body", timeout: 5000 },
      gotoOptions: { waitUntil: "networkidle2", timeout: 15000 },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Browserless ${res.status}: ${body.slice(0, 200)}`);
  }
  const html = await res.text();
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { html, text, status: res.status };
}

async function haikuClassify(source, text) {
  const userMessage = `Source URL: ${source.url}
Source id: ${source.id}
Source tier: ${source.tier ?? "unknown"}
Content excerpt:
---
${text.slice(0, 6000)}
---
Output the JSON object only.`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 800,
      system: HAIKU_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Haiku ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const blocks = data.content ?? [];
  const rawText = blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
  const m = rawText.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON in Haiku output");
  return JSON.parse(m[0]);
}

async function main() {
  // Fetch source row to grab tier + access_method.
  const { data: source, error: srcErr } = await supabase
    .from("sources")
    .select("id, name, url, tier, access_method")
    .eq("url", TARGET_SOURCE_URL)
    .single();
  if (srcErr || !source) {
    console.error(`source lookup failed: ${srcErr?.message ?? "no row"}`);
    process.exit(2);
  }
  console.log(`source: ${source.name} (${source.id})`);

  console.log("fetching content via Browserless...");
  const fetched = await browserlessRender(source.url);
  console.log(`fetched ${fetched.html.length} bytes html, ${fetched.text.length} chars text`);

  console.log("classifying via Haiku...");
  const cls = await haikuClassify(source, fetched.text);
  console.log("haiku output:", JSON.stringify(cls, null, 2));

  const update = {
    title: (cls.title_candidate ?? source.name).slice(0, 200),
    summary: (cls.summary ?? "").slice(0, 1000),
    severity: cls.severity ?? null,
    priority: cls.priority ?? "MODERATE",
    urgency_tier: cls.urgency_tier ?? null,
    item_type: cls.item_type ?? "regulation",
    topic_tags: cls.topic_tags ?? [],
    jurisdictions: cls.jurisdictions ?? [],
  };
  console.log("updating intelligence_items row with:", JSON.stringify(update, null, 2));

  const { error: updErr } = await supabase
    .from("intelligence_items")
    .update(update)
    .eq("id", TARGET_ITEM_ID);
  if (updErr) {
    console.error(`UPDATE failed: ${updErr.message}`);
    process.exit(3);
  }

  // Read back to confirm.
  const { data: row } = await supabase
    .from("intelligence_items")
    .select("id, title, summary, severity, priority, urgency_tier, item_type, pipeline_stage, topic_tags, jurisdictions, full_brief")
    .eq("id", TARGET_ITEM_ID)
    .single();
  console.log("\n=== AFTER ===");
  console.log(JSON.stringify({
    id: row.id,
    title: row.title,
    summary: row.summary,
    summary_len: row.summary?.length,
    severity: row.severity,
    priority: row.priority,
    urgency_tier: row.urgency_tier,
    item_type: row.item_type,
    pipeline_stage: row.pipeline_stage,
    topic_tags: row.topic_tags,
    jurisdictions: row.jurisdictions,
    brief_len: row.full_brief?.length,
  }, null, 2));
  console.log("\nDONE");
}

main().catch((e) => {
  console.error("[backfill] fatal", e);
  process.exit(99);
});
