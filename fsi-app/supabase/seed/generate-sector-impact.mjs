import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// Load env
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

const SECTORS = [
  "Fine Art & Museum Logistics",
  "Live Events & Touring",
  "Luxury Goods",
  "Cold Chain & Perishables",
  "Pharmaceutical & Life Sciences",
  "E-Commerce & Parcel",
  "Bulk Commodity",
  "Automotive & Motorsport",
  "Industrial Equipment & Heavy Lift",
  "Oil & Gas",
  "Chemicals & Hazmat",
  "Electronics & Semiconductors",
  "Agriculture & Food",
  "General Ocean FCL/LCL",
  "General Air Freight",
  "General Road & Trucking",
];

const SYSTEM_PROMPT = `You are a freight sector analyst for Caro's Ledge. For a given regulation, you produce a sector impact matrix showing:
1. How the regulation affects each freight sector differently
2. The relevance level (DIRECT / INDIRECT / MINIMAL)
3. Expected timeline to operational impact
4. One specific action per sector

Output MUST be a markdown table with these exact columns:

| Sector | Relevance | How It Affects This Sector | Time to Impact | Key Action |
|---|---|---|---|---|

Rules:
- DIRECT = regulation explicitly names or governs activities this sector performs
- INDIRECT = regulation affects costs, supply chains, or clients this sector serves
- MINIMAL = no meaningful operational connection
- "Time to Impact" = when this sector will feel the effect (e.g. "Now", "Q1 2026", "2028", "2030")
- "Key Action" = one specific thing an operator in this sector should do
- Write from the perspective of a freight forwarder operating in that sector
- Be specific — not "monitor the situation" but "request carrier ETS surcharge breakdown for EU port calls"
- Every sector gets a row, even if relevance is MINIMAL (explain why it's minimal)`;

async function generateSectorImpact(item) {
  const context = `
REGULATION: ${item.title}
PRIORITY: ${item.priority}
JURISDICTIONS: ${(item.jurisdictions || []).join(", ")}
TRANSPORT MODES: ${(item.transport_modes || []).join(", ")}

BRIEF SUMMARY:
${item.what_is_it || ""}

WHY IT MATTERS:
${item.why_matters || ""}

KEY DATA:
${(item.key_data || []).join("\n")}

CURRENT NOTE:
${item.summary || ""}
`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Generate a sector impact matrix for this regulation across all 16 freight sectors listed. Be specific about HOW each sector is affected and WHEN.\n\n${context}`,
        },
      ],
    });

    const textBlocks = response.content.filter((b) => b.type === "text");
    return textBlocks.map((b) => b.text).join("\n\n");
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    return null;
  }
}

async function run() {
  // Get all items that already have a full_brief (append sector impact to them)
  const { data: items, error } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, title, summary, what_is_it, why_matters, key_data, priority, jurisdictions, transport_modes, full_brief")
    .eq("is_archived", false)
    .not("full_brief", "is", null)
    .order("priority");

  if (error) {
    console.error("Failed to fetch items:", error.message);
    return;
  }

  // Filter to items that don't already have sector impact
  const needsSectorImpact = items.filter((i) => i.full_brief && !i.full_brief.includes("Sector Impact Matrix"));

  console.log(`\n=== SECTOR IMPACT GENERATOR ===`);
  console.log(`Items with briefs: ${items.length}`);
  console.log(`Already have sector impact: ${items.length - needsSectorImpact.length}`);
  console.log(`Need sector impact: ${needsSectorImpact.length}`);
  console.log(`\nStarting...\n`);

  let done = 0;

  for (const item of needsSectorImpact) {
    process.stdout.write(`[${done + 1}/${needsSectorImpact.length}] ${item.legacy_id} — ${item.title}...`);

    const sectorTable = await generateSectorImpact(item);

    if (sectorTable && sectorTable.length > 200) {
      // Append sector impact section to existing brief
      const updatedBrief = item.full_brief +
        "\n\n---\n\n## Sector Impact Matrix\n\nHow this regulation affects different freight sectors — relevance, timeline, and required actions.\n\n" +
        sectorTable;

      const { error: err } = await supabase
        .from("intelligence_items")
        .update({ full_brief: updatedBrief })
        .eq("id", item.id);

      if (item.legacy_id) {
        await supabase
          .from("resources")
          .update({ full_brief: updatedBrief })
          .eq("id", item.legacy_id);
      }

      if (err) {
        console.log(` SAVE ERROR`);
      } else {
        console.log(` OK (+${sectorTable.length} chars)`);
        done++;
      }
    } else {
      console.log(` FAILED`);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\n=== COMPLETE: ${done} sector impact tables added ===`);
}

run();
