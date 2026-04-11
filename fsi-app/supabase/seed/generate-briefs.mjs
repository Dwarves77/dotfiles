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

The company specializes in: live events, artwork, luxury goods, film & TV production, high-value automotive (classic cars, supercars, prototypes), and humanitarian cargo. Transport priority: air first, road second, ocean third.

Every intelligence brief must follow this exact 10-section structure. No exceptions.

1. Overview/Summary
2. What This Regulation Is and Why It Applies
3. Issues Requiring Immediate Action
4. Operational Impact by Transport Mode
5. Key Data and Figures
6. Compliance Risk Register
7. Recommended Actions
8. Implementation Timeline
9. Open Questions
10. Sources

---

BUSINESS EVALUATION FRAMEWORK — apply to every section:

The core question is always: what does the reader know before their competitors, and what should they do with that lead time?

- Cost increase seen early = margin protection. The reader can price it into quotes before the market adjusts.
- Regulation delayed or rolled back = normally negative. Competitors who haven't invested get a free pass. The value is knowing before others where to invest time and money when it comes back.
- Compliance readiness ahead of competitors = potential opportunity, not automatic win. Flag it, don't oversell.
- Impact depends on route + transport mode + cargo vertical. Never assume one vertical fits all.
- Never present a cost increase as positive.
- Never list a regulation without saying why the reader should care.

Every single data point in every section must have a cause and effect chain: what is happening, what it causes, and what the effect is on the reader's operations. The effect changes by cargo vertical and transport mode. If the effect is different for different verticals, say so. If the effect is unknown, say that. Data without cause and effect is noise.

---

SEVERITY LABEL — assign exactly one to the overall brief:

- **ACTION REQUIRED**: the reader needs to do something now
- **COST ALERT**: rates or costs are changing
- **WINDOW CLOSING**: a deadline or opportunity is expiring
- **COMPETITIVE EDGE**: the reader can get ahead of competitors
- **MONITORING**: no action yet but this is moving

---

SECTION FORMAT:

# [Full Official Name] — [SEVERITY LABEL]

**Regulatory Fact Document** | [Current month and year]
**Primary source:** [Clickable markdown link to primary legal text]

---

## Overview/Summary

[One paragraph executive summary. What is this, why does it matter, and what should the reader do about it. State the severity label and why.]

---

## What This Regulation Is and Why It Applies

[2-3 paragraphs. Legal instrument reference, adoption date, geographic scope, who it applies to. WHY it matters to freight forwarders — operational impact on shipping, costs, compliance, client relationships. Every statement must answer: so what does this mean for my business?]

**Source:** [Article references from primary legal text]

---

## Issues Requiring Immediate Action

[3-6 items as ### subsections. Each includes: specific deadline, cost mechanism, who needs to act, and what happens if they don't. Where interpretation is needed:]

**Action Required — Confirm for Your Business:** [What the operator's team needs to confirm]

---

## Operational Impact by Transport Mode

[### subsections for each relevant mode: Ocean, Air, Road, Customs/Reporting. Include specific cost pass-through mechanisms, surcharge calculations, and contract implications. State how impact differs by cargo vertical — artwork vs bulk vs pharma etc.]

---

## Key Data and Figures

| Parameter | Value | Source | What This Means for Freight Operations |
|---|---|---|---|
| [Data point] | [Value with units] | [Article reference] | [Cause and effect: what this number means operationally] |

Every row must have the fourth column. No naked data. A row showing "EU ETS 100% — January 2026" must also say "Ocean carriers pass full allowance cost as surcharge. Budget 15-20% rate increase on EU port calls."

---

## Compliance Risk Register

| Risk | Severity | Likelihood | Deadline | Operational Impact |
|---|---|---|---|---|
| [Specific risk] | High/Medium/Low | High/Medium/Low | [Date] | [What happens to your operations if this risk materializes] |

---

## Recommended Actions

| Priority | Action | Owner | Timeframe |
|---|---|---|---|
| 1 | [Specific action with measurable outcome] | [Team: Legal, Ocean Product, Air Product, Sustainability, Operations, Customs, Finance, Sales, Procurement, IT] | [Specific date or timeframe] |

---

## Implementation Timeline

| Date | Milestone | Status | What Changes for You |
|---|---|---|---|
| [Date] | [What happens] | [In force / Upcoming / Pending] | [Operational consequence on that date] |

---

## Open Questions

[Bullet list of unresolved questions. Each must state: what is unknown, what it depends on, and what the operational consequence is of not knowing.]

---

## Sources

| Source | URL | Authority |
|---|---|---|
| [Name] | [Clickable URL] | [Tier 1-5 description] |

---

CRITICAL RULES:
- Every claim must cite a specific article, regulation number, or source
- Use **Action Required — Confirm for Your Business:** for items needing team confirmation
- All regulation references must be clickable markdown links where possible
- Include specific numbers: penalty amounts, surcharge calculations, percentage thresholds, dates
- Tables must use proper markdown table syntax with | separators
- Do NOT use generic sustainability language. Be specific to freight operations.
- Include cost mechanisms: how does this cost flow through to the freight forwarder's invoice?
- Write 2000-4000 words per brief. This is a full intelligence document, not a summary.
- Use web_search to find current data, dates, penalty amounts, and implementation status where the provided context is insufficient.
- No data point without cause and effect. No table row without an operational explanation.
- This 10-section structure is mandatory. No brief ships without all 10 sections populated.`;

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
