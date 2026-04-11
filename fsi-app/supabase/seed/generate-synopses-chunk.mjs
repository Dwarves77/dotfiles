import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const chunkFile = process.argv[2];
if (!chunkFile) { console.log("Usage: node generate-synopses-chunk.mjs <chunk-file.json>"); process.exit(1); }

const envFile = readFileSync(".env.local", "utf8");
const env = {};
envFile.split("\n").forEach((line) => { const [k,...v] = line.split("="); if(k&&v.length) env[k.trim()] = v.join("=").trim(); });

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const supabase = createClient("https://kwrsbpiseruzbfwjpvsp.supabase.co","eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3cnNicGlzZXJ1emJmd2pwdnNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDg1NzkzOCwiZXhwIjoyMDU2NDMzOTM4fQ.zPd4fS8kqnwGXif54aJe7zbcSdFf5-t7GXewSSfeNcE");

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

If urgency_score is 0.1 write one sentence only.

URGENCY SCORING per sector (0.1 to 1.0):
1.0 — directly affects this sector
0.9 — affects primary transport mode
0.6 — indirect pass-through
0.3 — adjacent spillover
0.1 — no meaningful connection

Return ONLY valid JSON. No markdown fences.
{"synopses":{"fine-art":{"summary":"...","urgency_score":0.0},"live-events":{"summary":"...","urgency_score":0.0},"luxury-goods":{"summary":"...","urgency_score":0.0},"film-tv":{"summary":"...","urgency_score":0.0},"automotive":{"summary":"...","urgency_score":0.0},"humanitarian":{"summary":"...","urgency_score":0.0},"bulk-commodity":{"summary":"...","urgency_score":0.0},"cold-chain":{"summary":"...","urgency_score":0.0},"pharmaceutical":{"summary":"...","urgency_score":0.0},"e-commerce":{"summary":"...","urgency_score":0.0},"industrial-equipment":{"summary":"...","urgency_score":0.0},"oil-gas":{"summary":"...","urgency_score":0.0},"dangerous-goods":{"summary":"...","urgency_score":0.0},"general-air":{"summary":"...","urgency_score":0.0},"general-ocean":{"summary":"...","urgency_score":0.0}}}
All 15 sectors must be present.`;

async function run() {
  const itemIds = JSON.parse(readFileSync(chunkFile, "utf8"));
  const {data: sectors} = await supabase.from("sector_contexts").select("*").order("sector");
  console.log(`[${chunkFile}] Processing ${itemIds.length} items...`);

  let done = 0, failed = 0;
  for (const id of itemIds) {
    const {data: item} = await supabase.from("intelligence_items").select("id, legacy_id, title, priority, full_brief").eq("id", id).single();
    if (!item?.full_brief) { console.log(`  SKIP ${id} (no brief)`); continue; }

    // Check if already done (by another worker)
    const {data: ex} = await supabase.from("intelligence_summaries").select("id").eq("item_id", id).limit(1);
    if (ex?.length) { console.log(`  SKIP ${item.legacy_id} (already done)`); done++; continue; }

    process.stdout.write(`  [${done+1}/${itemIds.length}] ${item.legacy_id} — ${item.title}...`);
    try {
      const resp = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514", max_tokens: 12000, system: SYSTEM_PROMPT,
        messages: [{role:"user", content:`ITEM: ${item.title} (${item.priority})\n\nBRIEF:\n${item.full_brief.slice(0,12000)}\n\nSECTORS:\n${JSON.stringify(sectors,null,2)}`}],
      });
      let text = resp.content.filter(b=>b.type==="text").map(b=>b.text).join("").trim();
      if (text.startsWith("\`\`\`")) text = text.replace(/^\`\`\`(?:json)?\s*/,"").replace(/\s*\`\`\`$/,"");
      let parsed;
      try { parsed = JSON.parse(text); } catch { const s=text.indexOf("{"), e=text.lastIndexOf("}"); if(s!==-1&&e!==-1) parsed=JSON.parse(text.slice(s,e+1)); }
      if (!parsed?.synopses || Object.keys(parsed.synopses).length < 10) { console.log(` FAIL (incomplete)`); failed++; continue; }

      await supabase.from("intelligence_summaries").delete().eq("item_id", item.id);
      const rows = Object.entries(parsed.synopses).map(([sector,data])=>({item_id:item.id, sector, summary:data.summary||"", urgency_score:data.urgency_score??null, generated_at:new Date().toISOString(), model_version:"claude-sonnet-4-20250514"}));
      const {error} = await supabase.from("intelligence_summaries").insert(rows);
      if (error) { console.log(` WRITE ERR`); failed++; } else { console.log(` OK`); done++; }
    } catch(e) { console.log(` ERR: ${e.message?.slice(0,80)}`); failed++; }
    await new Promise(r=>setTimeout(r,1000));
  }
  console.log(`[${chunkFile}] Done: ${done} | Failed: ${failed}`);
}
run();
