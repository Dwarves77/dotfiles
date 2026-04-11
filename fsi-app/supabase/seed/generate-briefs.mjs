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

const SYSTEM_PROMPT = `You are a regulatory intelligence analyst for Caro's Ledge, a global freight sustainability intelligence platform. Your job is to produce full intelligence briefs for regulations and policy instruments that affect international freight forwarding.

Every brief must follow this exact structure in markdown:

# [Full Official Name of Regulation/Instrument]

**Regulatory Fact Document** | [Current month and year]
**Primary source:** [Clickable markdown link to the primary legal text or source document]

---

## What This Regulation Is and Why It Applies

[2-3 paragraphs explaining what this regulation/instrument IS in plain English. Include the legal instrument reference (e.g. "Regulation (EU) 2023/1805"), when it was adopted, who it applies to, and its geographic scope. Explain WHY it matters specifically to freight forwarders — not generic sustainability language, but operational impact on shipping, costs, compliance, and client relationships.]

**Source:** [Article references from the primary legal text]

---

## Issues Requiring Immediate Action

[List 3-6 specific items that require decisions or action NOW. Each should be a ### subsection with a clear heading. Include specific deadlines, cost mechanisms, and who needs to act. Where interpretation is needed, add:]

**Action Required — Confirm for Your Business:** [What the operator's team needs to confirm about how this applies to their specific operations]

---

## Operational Impact by Transport Mode

[Structured analysis of how this regulation affects each relevant transport mode and business function. Use ### subsections for each mode (Ocean, Air, Road, Customs/Reporting). Include specific cost pass-through mechanisms, surcharge calculations, and contract implications.]

---

## Key Data and Figures

[Tables with specific numbers, dates, thresholds, penalties. Use markdown tables with clear column headers. Include:]

| Parameter | Value | Source |
|---|---|---|
| [Specific data point] | [Value with units] | [Article/regulation reference] |

---

## Compliance Risk Register

| Risk | Severity | Likelihood | Deadline |
|---|---|---|---|
| [Specific risk] | High/Medium/Low | High/Medium/Low | [Date or description] |

---

## Recommended Actions

| Priority | Action | Owner | Timeframe |
|---|---|---|---|
| 1 | [Specific action] | [Team: Legal, Ocean Product, Air Product, Sustainability, Operations, Customs, Finance, Sales, Procurement, IT] | [Specific timeframe] |

---

## Implementation Timeline

| Date | Milestone | Status |
|---|---|---|
| [Date] | [What happens] | [In force / Upcoming / Pending] |

---

## Open Questions

[Bullet list of unresolved questions — things that cannot be answered yet because implementing acts haven't been published, legal interpretation is pending, or political decisions haven't been made. Each should reference what it depends on.]

---

## Sources

| Source | URL | Authority |
|---|---|---|
| [Name] | [Clickable URL] | [Tier 1-5 description] |

CRITICAL RULES:
- Every claim must cite a specific article, regulation number, or source
- Use **Action Required — Confirm for Your Business:** for items needing team confirmation
- All regulation references must be clickable markdown links where possible
- Include specific numbers: penalty amounts, surcharge calculations, percentage thresholds, dates
- Tables must use proper markdown table syntax with | separators
- Do NOT use generic sustainability language. Be specific to freight operations.
- Include cost mechanisms: how does this cost flow through to the freight forwarder's invoice?
- Write 2000-4000 words per brief. This is a full intelligence document, not a summary.
- Use web_search to find current data, dates, penalty amounts, and implementation status where the provided context is insufficient.`;

async function generateBrief(item) {
  const context = `
RESOURCE ID: ${item.legacy_id || item.id}
TITLE: ${item.title}
TYPE: ${item.item_type || "regulation"}
PRIORITY: ${item.priority}
CATEGORY: ${item.category || ""}
JURISDICTIONS: ${(item.jurisdictions || []).join(", ")}
TRANSPORT MODES: ${(item.transport_modes || []).join(", ")}
SOURCE URL: ${item.source_url || ""}
TAGS: ${(item.tags || []).join(", ")}

EXISTING SUMMARY (use as starting context, but expand dramatically):
What it is: ${item.what_is_it || ""}
Why it matters: ${item.why_matters || ""}
Key data: ${(item.key_data || []).join(" | ")}
Note: ${item.summary || ""}
`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Generate a full intelligence brief for this regulation/instrument. Use web search to verify current implementation status, dates, and penalty amounts. The brief must follow the exact structure specified in your instructions.\n\n${context}`,
        },
      ],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 3,
        },
      ],
    });

    // Extract text from response
    const textBlocks = response.content.filter((b) => b.type === "text");
    return textBlocks.map((b) => b.text).join("\n\n");
  } catch (err) {
    console.error(`  ERROR generating brief for ${item.legacy_id}: ${err.message}`);
    return null;
  }
}

async function run() {
  // Get all items that don't have a full_brief yet
  const { data: items, error } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, title, summary, what_is_it, why_matters, key_data, item_type, priority, category, jurisdictions, transport_modes, source_url, tags, full_brief")
    .eq("is_archived", false)
    .order("priority");

  if (error) {
    console.error("Failed to fetch items:", error.message);
    return;
  }

  // Filter to items without briefs, prioritize by CRITICAL > HIGH > MODERATE > LOW
  const priorityOrder = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };
  const needsBrief = items
    .filter((i) => !i.full_brief)
    .sort((a, b) => (priorityOrder[a.priority] || 4) - (priorityOrder[b.priority] || 4));

  console.log(`\n=== INTELLIGENCE BRIEF GENERATOR ===`);
  console.log(`Total items: ${items.length}`);
  console.log(`Already have briefs: ${items.length - needsBrief.length}`);
  console.log(`Need briefs: ${needsBrief.length}`);
  console.log(`  CRITICAL: ${needsBrief.filter((i) => i.priority === "CRITICAL").length}`);
  console.log(`  HIGH: ${needsBrief.filter((i) => i.priority === "HIGH").length}`);
  console.log(`  MODERATE: ${needsBrief.filter((i) => i.priority === "MODERATE").length}`);
  console.log(`  LOW: ${needsBrief.filter((i) => i.priority === "LOW").length}`);
  console.log(`\nStarting generation...\n`);

  let generated = 0;
  let failed = 0;

  for (const item of needsBrief) {
    const label = `[${item.priority}] ${item.legacy_id || item.id} — ${item.title}`;
    process.stdout.write(`Generating: ${label}...`);

    const brief = await generateBrief(item);

    if (brief && brief.length > 500) {
      // Save to both tables
      const { error: iiErr } = await supabase
        .from("intelligence_items")
        .update({ full_brief: brief })
        .eq("id", item.id);

      if (item.legacy_id) {
        await supabase
          .from("resources")
          .update({ full_brief: brief })
          .eq("id", item.legacy_id);
      }

      if (iiErr) {
        console.log(` SAVE ERROR: ${iiErr.message}`);
        failed++;
      } else {
        console.log(` OK (${brief.length} chars)`);
        generated++;
      }
    } else {
      console.log(` FAILED (brief too short or null)`);
      failed++;
    }

    // Rate limit: wait 2 seconds between calls
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\n=== COMPLETE ===`);
  console.log(`Generated: ${generated}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total with briefs: ${items.length - needsBrief.length + generated}`);
}

run();
