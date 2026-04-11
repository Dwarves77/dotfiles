import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const envFile = readFileSync(".env.local", "utf8");
const env = {};
envFile.split("\n").forEach((line) => {
  const [key, ...rest] = line.split("=");
  if (key && rest.length) env[key.trim()] = rest.join("=").trim();
});

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const supabase = createClient(
  "https://kwrsbpiseruzbfwjpvsp.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3cnNicGlzZXJ1emJmd2pwdnNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDg1NzkzOCwiZXhwIjoyMDU2NDMzOTM4fQ.zPd4fS8kqnwGXif54aJe7zbcSdFf5-t7GXewSSfeNcE"
);

// Same system prompt from src/lib/agent/system-prompt.ts — synopsis generation portion only
const SYSTEM_PROMPT = `You receive a full intelligence brief for one regulatory item and all 15 freight forwarding sector contexts. Generate a sector-specific synopsis for EVERY sector in a single JSON response.

SOURCE AUTHORITY HIERARCHY — apply to every claim:
1. Confirmed primary text — cite specific articles and dates
2. Official guidance — cite document reference, state it is interpretive
3. Secondary legal — name the firm/association, label as secondary
4. Industry operator interpretation — label clearly as navigation only
5. Legal Confirmation Required — flag wherever no source has confirmed

SECTOR SYNOPSIS STRUCTURE (three parts per sector):
Part 1 — WHAT CHANGED: One paragraph citing the legal instrument, article, effective date, and change type.
Part 2 — WHAT IT MEANS FOR THIS SECTOR: 2-4 paragraphs specific to this sector's cargo, modes, roles. Use Action Required — Confirm for Your Business flags. Include third party exposure.
Part 3 — WHAT TO DO: Numbered actions with WHO, WHEN, WHAT.

If urgency_score is 0.1 write one sentence only. Do not pad low-relevance synopses.

URGENCY SCORING per sector (0.1 to 1.0):
1.0 — directly affects this sector
0.9 — affects primary transport mode
0.6 — indirect pass-through
0.3 — adjacent spillover
0.1 — no meaningful connection

Return ONLY valid JSON. No markdown fences. No preamble.
{
  "synopses": {
    "fine-art": { "summary": "markdown synopsis", "urgency_score": 0.0 },
    "live-events": { "summary": "...", "urgency_score": 0.0 },
    "luxury-goods": { "summary": "...", "urgency_score": 0.0 },
    "film-tv": { "summary": "...", "urgency_score": 0.0 },
    "automotive": { "summary": "...", "urgency_score": 0.0 },
    "humanitarian": { "summary": "...", "urgency_score": 0.0 },
    "bulk-commodity": { "summary": "...", "urgency_score": 0.0 },
    "cold-chain": { "summary": "...", "urgency_score": 0.0 },
    "pharmaceutical": { "summary": "...", "urgency_score": 0.0 },
    "e-commerce": { "summary": "...", "urgency_score": 0.0 },
    "industrial-equipment": { "summary": "...", "urgency_score": 0.0 },
    "oil-gas": { "summary": "...", "urgency_score": 0.0 },
    "dangerous-goods": { "summary": "...", "urgency_score": 0.0 },
    "general-air": { "summary": "...", "urgency_score": 0.0 },
    "general-ocean": { "summary": "...", "urgency_score": 0.0 }
  }
}
All 15 sectors must be present. Never omit a sector.`;

async function run() {
  // Load sector contexts
  const { data: sectors } = await supabase
    .from("sector_contexts")
    .select("sector, display_name, synopsis_prompt, transport_modes, cargo_types, compliance_roles, urgency_weights")
    .order("sector");

  if (!sectors?.length) { console.log("No sector contexts found"); return; }

  // Load items with full_brief that don't have synopses yet
  const { data: items } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, title, priority, full_brief")
    .eq("is_archived", false)
    .not("full_brief", "is", null)
    .order("priority");

  const { data: existing } = await supabase
    .from("intelligence_summaries")
    .select("item_id");
  const hasSynopses = new Set((existing || []).map((e) => e.item_id));

  const needSynopses = items.filter((i) => !hasSynopses.has(i.id));

  console.log(`\n=== SYNOPSIS GENERATOR ===`);
  console.log(`Sector contexts: ${sectors.length}`);
  console.log(`Items with briefs: ${items.length}`);
  console.log(`Already have synopses: ${hasSynopses.size}`);
  console.log(`Need synopses: ${needSynopses.length}`);
  console.log(`\nStarting...\n`);

  let done = 0;
  let failed = 0;

  for (const item of needSynopses) {
    process.stdout.write(`[${done + 1}/${needSynopses.length}] ${item.legacy_id || "?"} — ${item.title}...`);

    try {
      const userMessage = `INTELLIGENCE ITEM:
Title: ${item.title}
Priority: ${item.priority}

FULL BRIEF:
${item.full_brief.slice(0, 12000)}

SECTOR CONTEXTS:
${JSON.stringify(sectors, null, 2)}`;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 12000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      const rawText = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      let cleanText = rawText.trim();
      if (cleanText.startsWith("```")) cleanText = cleanText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");

      let parsed;
      try {
        parsed = JSON.parse(cleanText);
      } catch {
        const start = cleanText.indexOf("{");
        const end = cleanText.lastIndexOf("}");
        if (start !== -1 && end !== -1) parsed = JSON.parse(cleanText.slice(start, end + 1));
      }

      if (!parsed?.synopses || Object.keys(parsed.synopses).length < 10) {
        console.log(` FAILED (incomplete response: ${Object.keys(parsed?.synopses || {}).length} sectors)`);
        failed++;
        continue;
      }

      // Delete any existing synopses for this item
      await supabase.from("intelligence_summaries").delete().eq("item_id", item.id);

      // Batch insert all 15 sector synopses
      const rows = Object.entries(parsed.synopses).map(([sector, data]) => ({
        item_id: item.id,
        sector,
        summary: data.summary || "",
        urgency_score: data.urgency_score ?? null,
        generated_at: new Date().toISOString(),
        model_version: "claude-sonnet-4-20250514",
      }));

      const { error } = await supabase.from("intelligence_summaries").insert(rows);
      if (error) {
        console.log(` WRITE ERROR: ${error.message}`);
        failed++;
      } else {
        console.log(` OK (${Object.keys(parsed.synopses).length} sectors)`);
        done++;
      }
    } catch (err) {
      console.log(` ERROR: ${err.message?.slice(0, 100)}`);
      failed++;
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 1500));
  }

  const { count } = await supabase.from("intelligence_summaries").select("*", { count: "exact", head: true });
  console.log(`\n=== COMPLETE ===`);
  console.log(`Generated: ${done}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total synopses in DB: ${count}`);
}

run();
