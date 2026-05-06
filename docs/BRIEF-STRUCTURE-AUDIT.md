# Brief Structure Audit

Generated: 2026-05-05 (read-only investigation)

Sources audited:
- Agent prompt: `fsi-app/src/lib/agent/system-prompt.ts`
- Parser: `fsi-app/src/lib/agent/parse-output.ts`
- Skill spec: `fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md`
- Live database: 7 production briefs (4 California regulations, 3 EU regulations) read via Supabase REST with the service-role key from `.env.local`

---

## 1. Agent Prompt Section Spec (verbatim)

The agent prompt opens with a header note tying it to SKILL.md:

> "Operative contract for /api/agent/run. Synced to fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md (canonical, 2026-04-28). The skill is reference + contract; this file is what the agent actually receives at runtime."

The contract version emitted in YAML (per the body of the prompt) is `"2026-04-29"` — see `regeneration_skill_version` example at line ~353.

Format selection (line ~130):

> regulation, directive, standard, guidance, framework → Regulatory Fact Document (14 sections, 8 conditional)
> technology, innovation, tool → Technology Profile (8 sections)
> regional_data → Operations Profile (8 sections)
> market_signal, initiative → Market Signal Brief (8 sections)
> research_finding → Research Summary (6 sections)

Note the prompt header says "14 sections, 8 conditional" but the actual list below contains 15 numbered items (1–15), with 6 conditional. The numbering survives intact in SKILL.md too — both sources call it 14 and number through 15 because Sources is treated as a closer rather than a section in some count totals. The conditional total in the body of the prompt is "Conditional (omit if no grounded content): 5, 6, 7, 9, 12, 13" — six conditionals, not eight.

### regulatory_fact_document format

Verbatim from `system-prompt.ts` lines 140–159:

> Always present: 1, 2, 3, 4, 8, 10, 11, 14, 15.
> Conditional (omit if no grounded content): 5, 6, 7, 9, 12, 13.

1. **Purpose and Scope of This Document** — what the document covers, convention notes, dates.
2. **What This Regulation Is and Why It Applies to the Workspace** — plain-language regulation summary, why it applies via workspace profile.
3. **Issues Requiring Immediate Action** — 30-day actions, each with severity label, action verb first.
4. **How the Workspace Sits in the Compliance Chain** — supply-chain roles, role placement requiring legal confirmation.
5. *(conditional)* **Authoritative Guidance Document Analysis** — when guidance exists, synthesize section by section, each provision interpreted against the workspace.
6. *(conditional)* **Anticipated Authoritative Guidance and Pending Regulatory Events** — sourced upcoming events that will change the analysis.
7. *(conditional)* **Threshold Questions** — definitional questions that determine whether/how the regulation applies. Decided vs Legal Confirmation Required.
8. **Substantive Requirements** — the regulation's specific obligations applied to workspace operations. Subsections vary by regulation.
9. *(conditional)* **Product-Specific Compliance Status** — when the workspace sells products in scope.
10. **Registration and Reporting Obligations** — EPR/producer/jurisdictional registration. Note gaps.
11. **Operational System Requirements** — what the workspace must build or modify.
12. *(conditional)* **Exemptions and Edge Cases** — when applicable to workspace operations.
13. *(conditional)* **Adjacent Industry Research and Alternatives** — public research and alternative approaches.
14. **Confirmed Regulatory Timeline** — dated milestones with what the workspace must have done by each date.
15. **Sources** — full source list with type labels.

### technology_profile format

Verbatim from `system-prompt.ts` lines 161–172:

1. **What's Being Tested or Deployed and By Whom** — named operators, deployment scope, results, sourced.
2. **What This Tells Us About Industry Trajectory** — pattern, drivers, conversion threshold.
3. **Supplier Access and Procurement Reality** — who can buy this, exclusivity, lead times, financing, pilot programs.
4. **Operational Fit by Transport Mode and Cargo Vertical** — air, road, ocean in workspace priority order, with vertical-specific notes.
5. **Competitive Positioning Implications for the Workspace** — contracts at risk, contracts winnable, named competitors.
6. **Conversational and Strategic Talking Points** — what the workspace can credibly say to clients.
7. **Time-to-Market, Procurement Window, and Action** — when commercially available at scale, when to commit, specific actions.
8. **Sources** — with type labels.

### operations_profile format

Verbatim from `system-prompt.ts` lines 174–185:

1. **Operational Cost Baseline for the Region** — sourced industrial electricity rates, diesel/SAF prices, labor rates, port handling, drayage. Each line item dated and sourced.
2. **Feasibility of Specific Operational Choices** — on-site solar, BESS, specific equipment, in-region material sourcing.
3. **Cost Comparison Against Alternatives** — manual vs automated, on-grid vs on-site solar, etc. Sourced numbers only.
4. **Cross-Regional Strategic Implications** — how this region's costs/feasibilities change strategic decisions across the workspace's footprint.
5. **Competitive Positioning in the Region** — what competitors are doing operationally. Named competitors, sourced.
6. **Client Conversation Talking Points** — how to discuss regional capability with clients.
7. **Pending Changes That Shift the Calculus** — regulations under consultation, infrastructure under construction, energy market shifts.
8. **Sources** — with type labels.

### market_signal_brief format

Verbatim from `system-prompt.ts` lines 187–198:

1. **What's Moving and What Triggered It** — sourced.
2. **Who's Driving It and What They Want** — named parties, stated interests, leverage, likely strategy.
3. **Expected Trajectory and Conversion Triggers** — what would convert this from signal to active rule or active commercial pressure.
4. **Operational and Cost Implications If It Materializes** — concrete consequences for the workspace.
5. **Competitive Implications** — who benefits, who is hurt, where the workspace sits.
6. **Client Conversation Talking Points** — public posture while it is still a signal, claims to avoid.
7. **What the Workspace Should Do Now** — positioning actions, not compliance actions.
8. **Sources** — with type labels.

### research_summary format

Verbatim from `system-prompt.ts` lines 200–209:

1. **What the Research Found** — headline finding, methodology in brief, scope and limitations.
2. **Why This Finding Matters Operationally and Commercially** — the mechanism, filtered by cargo vertical and transport mode.
3. **What the Finding Changes for Strategy, Claims, or Decisions** — specific decisions impacted.
4. **Client Conversation Talking Points and Public Position** — what the workspace can credibly claim.
5. **What the Finding Does Not Resolve** — limits, open questions.
6. **Sources** — with type labels.

### Markdown storage convention (from prompt lines 223–230)

> - Each section is a top-level heading (`# Section Name`) — section names match the format's section list exactly.
> - Sections with no grounded content are omitted entirely OR carry a single-line note: `*No content for this section as of [date]: [reason].*`
> - Inline citations use: `*Source: [Title], [Issuing Body], [Date]. [URL if applicable].*`
> - Severity labels in space-separated form (ACTION REQUIRED, COST ALERT, WINDOW CLOSING, COMPETITIVE EDGE, MONITORING).

After the brief body, the prompt requires (lines 358–368):
- A `New Sources Identified` markdown section (header text exact) when external sources beyond the input were cited
- A YAML frontmatter block fenced by `---` at the very end with 12 metadata fields

### Parser hooks (from `parse-output.ts`)

The parser does NOT extract any per-section content — it only:

1. Locates the trailing YAML frontmatter (with three fallback strategies for malformed/code-fenced output)
2. Strips the YAML from the body
3. Validates 12 required YAML fields with closed-vocabulary enums for severity, priority, urgency_tier, format_type, topic_tags, compliance_object_tags
4. Returns `{ body, metadata }` where `body` is the markdown with the YAML stripped (the `New Sources Identified` table is preserved in the body)

The parser is structurally agnostic to which sections appear in the markdown body. Section headings are not validated, not enforced, not extracted by name. Drift in section names or order will not fail a regeneration. Only the YAML frontmatter contract is enforced at parse time.

The `regeneration_skill_version` value the parser tolerates is whatever the agent emits — the parser does not pin to "2026-04-29".

---

## 2. Real Brief Section Headings

All seven briefs were readable. Sizes range from 22,372 to 36,030 characters. All seven have a closing YAML frontmatter block and a `# New Sources Identified` section (parser-friendly).

### SB 253 (`w4_ca_sb253`, `regulation`, 26,795 chars)
Title: California SB 253 — Climate Corporate Data Accountability Act

- H1: California SB 253 — Climate Corporate Data Accountability Act
- H2: Regulatory Fact Document
- H1: Purpose and Scope of This Document
- H1: What This Regulation Is and Why It Applies to the Workspace
  - H2: Plain-Language Summary
  - H2: Why It Applies to the Workspace
- H1: Issues Requiring Immediate Action
- H1: How the Workspace Sits in the Compliance Chain
  - H2: If the Workspace Meets the $1 Billion Revenue Threshold
  - H2: If the Workspace Does Not Meet the Threshold
- H1: Anticipated Authoritative Guidance and Pending Regulatory Events
- H1: Threshold Questions
  - H2: Decided by the Statute
  - H2: Requiring Further Determination
- H1: Substantive Requirements (with 5 H2 subsections)
- H1: Registration and Reporting Obligations (2 H2 subsections)
- H1: Operational System Requirements (2 H2 subsections)
- H1: Exemptions and Edge Cases (4 H2 subsections)
- H1: Confirmed Regulatory Timeline
- H1: Sources
- H1: New Sources Identified

Tables: 9. Blockquotes: 0.

### SB 261 (`w4_ca_sb261`, `regulation`, 30,146 chars)
Title: California SB 261 — Climate-Related Financial Risk Act

- H1: California SB 261 — Climate-Related Financial Risk Act
- H2: Regulatory Fact Document
- H1: Purpose and Scope of This Document
- H1: What This Regulation Is and Why It Applies to the Workspace (2 H2 subs)
- H1: Issues Requiring Immediate Action
- H1: How the Workspace Sits in the Compliance Chain
- H1: Threshold Questions (5 H2 subs: Question 1–5)
- H1: Substantive Requirements (4 H2 subs)
- H1: Anticipated Authoritative Guidance and Pending Regulatory Events
- H1: Registration and Reporting Obligations (4 H2 subs)
- H1: Operational System Requirements (5 H2 subs)
- H1: Exemptions and Edge Cases (4 H2 subs)
- H1: Confirmed Regulatory Timeline
- H1: Sources
- H1: New Sources Identified

Tables: 3. Blockquotes: 0.

Note: Substantive Requirements appears BEFORE Anticipated Guidance here, which inverts the prompt's specified 6-then-8 order.

### AB 1305 (`w4_ca_ab1305`, `regulation`, 27,628 chars)
Title: California AB 1305 — Voluntary Carbon Market Disclosures Act

- H1: California AB 1305 — Voluntary Carbon Market Disclosures Act
- H2: Regulatory Fact Document
- H1: Purpose and Scope of This Document
- H1: What This Regulation Is and Why It Applies to the Workspace
- H1: Issues Requiring Immediate Action
- H1: How the Workspace Sits in the Compliance Chain
- H1: Threshold Questions
- H1: Substantive Requirements (3 H2 subs by Section number)
- H1: Registration and Reporting Obligations
- H1: Operational System Requirements (5 H2 subs)
- H1: Exemptions and Edge Cases
- H1: Anticipated Authoritative Guidance and Pending Regulatory Events
- H1: Confirmed Regulatory Timeline
- H1: Sources
- H1: New Sources Identified

Tables: 3. Blockquotes: 0.

Note: Anticipated Guidance appears AFTER Exemptions here — out of prompt order again, inverted from SB 261's order.

### ACF (`w4_ca_acf`, `regulation`, 22,372 chars)
Title: California Advanced Clean Fleets Rule (CARB)

- H1: California Advanced Clean Fleets (ACF) Regulation — Regulatory Fact Document
- H2: 1. Purpose and Scope of This Document
- H2: 2. What This Regulation Is and Why It Applies to the Workspace
- H2: 3. Issues Requiring Immediate Action
- H2: 4. How the Workspace Sits in the Compliance Chain
- H2: 5. Authoritative Guidance Document Analysis
- H2: 6. Anticipated Authoritative Guidance and Pending Regulatory Events
- H2: 7. Threshold Questions
- H2: 8. Substantive Requirements
- H2: 9. Product-Specific Compliance Status
- H2: 10. Registration and Reporting Obligations
- H2: 11. Operational System Requirements
- H2: 12. Exemptions and Edge Cases
- H2: 13. Adjacent Industry Research and Alternatives
- H2: 14. Confirmed Regulatory Timeline
- H2: 15. Sources
- H1: New Sources Identified

Tables: 4. Blockquotes: 0.

Notes:
- ACF is the ONLY brief with all 15 sections including 5 (Authoritative Guidance), 9 (Product-Specific), and 13 (Adjacent Research).
- ACF uses `## n. Section Name` (numbered H2) for body sections, while every other brief uses `# Section Name` (unnumbered H1). This is a styling outlier that any heading-text matcher needs to handle.

### EU Battery (`eu-battery-regulation-2023-1542`, `regulation`, 36,030 chars)
Title: EU Battery Regulation (Regulation (EU) 2023/1542)

- H1: EU Battery Regulation (Regulation (EU) 2023/1542)
- H2: Regulatory Fact Document
- H1: Purpose and Scope of This Document
- H1: What This Regulation Is and Why It Applies to the Workspace (2 H2 subs)
- H1: Issues Requiring Immediate Action
- H1: How the Workspace Sits in the Compliance Chain (2 H2 subs)
- H1: Threshold Questions
- H1: Substantive Requirements (9 H2 subs)
- H1: Anticipated Authoritative Guidance and Pending Regulatory Events
- H1: Registration and Reporting Obligations (2 H2 subs)
- H1: Operational System Requirements (5 H2 subs)
- H1: Exemptions and Edge Cases (4 H2 subs)
- H1: Confirmed Regulatory Timeline
- H1: Sources
- H1: New Sources Identified

Tables: 5. Blockquotes: 0.

Note: Same out-of-order placement of Anticipated Guidance (after Substantive Requirements rather than before).

### EU HDV CO2 (`eu-hdv-co2-standards-2019-1242`, `regulation`, 24,526 chars)
Title: EU HDV CO2 Emission Standards (Regulation (EU) 2019/1242)

- H1: Purpose and Scope of This Document
- H1: What This Regulation Is and Why It Applies to the Workspace (2 H2 subs)
- H1: Issues Requiring Immediate Action
- H1: How the Workspace Sits in the Compliance Chain
- H1: Substantive Requirements (5 H2 subs by Article)
- H1: Anticipated Authoritative Guidance and Pending Regulatory Events
- H1: Threshold Questions
- H1: Registration and Reporting Obligations
- H1: Operational System Requirements (2 H2 subs)
- H1: Confirmed Regulatory Timeline
- H1: Sources
- H1: New Sources Identified

Tables: 5. Blockquotes: 0.

Notes:
- This is the only brief with NO title heading at all — the markdown opens directly with "# Purpose and Scope of This Document". The DB column `title` carries the title; the markdown does not.
- Threshold Questions appears AFTER Substantive Requirements and AFTER Anticipated Guidance — third out-of-order example.
- Operational System Requirements is present but has no actionable system requirements identified — the section instead summarises a "Road Carrier Data Capability Audit" subhead and one rate-monitoring sub.

### EU Net-Zero Industry Act (`eu-net-zero-industry-act-2024-1735`, `regulation`, 35,414 chars)
Title: EU Net-Zero Industry Act (Regulation (EU) 2024/1735)

- H1: EU Net-Zero Industry Act (Regulation (EU) 2024/1735): Regulatory Fact Document
- H1: Purpose and Scope of This Document
- H1: What This Regulation Is and Why It Applies to the Workspace (2 H2 subs)
- H1: Issues Requiring Immediate Action
- H1: How the Workspace Sits in the Compliance Chain
- H1: Anticipated Authoritative Guidance and Pending Regulatory Events
- H1: Threshold Questions
- H1: Substantive Requirements (5 H2 subs)
- H1: Registration and Reporting Obligations
- H1: Operational System Requirements
- H1: Adjacent Industry Research and Alternatives
- H1: Confirmed Regulatory Timeline
- H1: Sources
- H1: New Sources Identified

Tables: 3. Blockquotes: 0.

Note: This brief most closely matches the prompt's specified order (Anticipated Guidance before Threshold Questions before Substantive Requirements). It includes Section 13 (Adjacent Research) — the only EU brief that does.

---

## 3. SKILL.md Section Spec (verbatim)

Path: `fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md`

The file is checked into the repo at the path documented in the project CLAUDE.md. There is no copy at `~/.claude/skills/...` (Glob over `**/SKILL.md` returned only the repo path).

YAML front-matter (lines 1–4):

```
name: environmental-policy-and-innovation
description: Freight sustainability intelligence system. ... Integrity-first: facts only, no invented content, gaps explicitly labeled.
```

Format mapping (lines 170–177):

> - regulation, directive, standard, guidance, framework: Regulatory Fact Document (14 sections, conditional)
> - technology, innovation, tool: Technology Profile (8 sections)
> - regional_data: Operations Profile (8 sections)
> - market_signal, initiative: Market Signal Brief (8 sections)
> - research_finding: Research Summary (6 sections)

### SKILL.md regulatory fact document — 15 numbered sections (lines 182–303)

1. **Purpose and Scope of This Document**
2. **What This Regulation Is and Why It Applies to the Workspace**
3. **Issues Requiring Immediate Action**
4. **How the Workspace Sits in the Compliance Chain**
5. **Authoritative Guidance Document Analysis** *(conditional)*
6. **Anticipated Authoritative Guidance and Pending Regulatory Events** *(conditional)*
7. **Threshold Questions** *(conditional)*
8. **Substantive Requirements**
9. **Product-Specific Compliance Status** *(conditional)*
10. **Registration and Reporting Obligations**
11. **Operational System Requirements**
12. **Exemptions and Edge Cases** *(conditional)*
13. **Adjacent Industry Research and Alternatives** *(conditional)*
14. **Confirmed Regulatory Timeline**
15. **Sources**

Conditional Section Application (line 299):

> Sections 5, 6, 7, 9, 12, 13 are conditional. They appear only when grounded content exists. Section 8 expands or contracts based on the regulation's substantive scope. Sections 1, 2, 3, 4, 10, 11, 14, 15 are always present.
>
> A new regulation with no authoritative guidance, no anticipated events, no threshold questions in dispute, no workspace-specific products, no exemptions, and no adjacent research, would publish with 8 of 14 sections (1, 2, 3, 4, 8, 10, 11, 14, 15).

(SKILL.md says "8 of 14" but lists 9 always-present numbers — same off-by-one numbering convention as the agent prompt where "14" is the conventional section-count name though "Sources" is the 15th list item.)

The other format specs in SKILL.md (Technology Profile, Operations Profile, Market Signal Brief, Research Summary) match the agent prompt's section names verbatim. Storage convention (lines 722–734) matches the prompt's storage convention nearly verbatim.

Changelog (lines 806–814) shows version 2026-04-29 (intersection-readiness contract) is the current version. The agent prompt's header note says "synced to SKILL.md (canonical, 2026-04-28)" — this is one revision behind. The YAML body of the prompt does emit `regeneration_skill_version: "2026-04-29"`, so the prompt is operationally synced; only the comment header is stale.

---

## 4. Drift Table

Scope: regulatory_fact_document only (the format covering all 7 audited briefs).

| Section name | SKILL.md | Agent prompt | All 4 CA briefs | All 3 EU briefs | Status |
|---|---|---|---|---|---|
| 1. Purpose and Scope of This Document | always | always | yes | yes | Aligned |
| 2. What This Regulation Is and Why It Applies to the Workspace | always | always | yes | yes | Aligned |
| 3. Issues Requiring Immediate Action | always | always | yes | yes | Aligned |
| 4. How the Workspace Sits in the Compliance Chain | always | always | yes | yes | Aligned |
| 5. Authoritative Guidance Document Analysis | conditional | conditional | only ACF | none | Aligned (omitted when ungrounded — integrity rule) |
| 6. Anticipated Authoritative Guidance and Pending Regulatory Events | conditional | conditional | yes (4/4) | yes (3/3) | Aligned. **Order drift**: prompt places this between 4 and 7, but SB 261, AB 1305, EU Battery, EU HDV all place it after Substantive Requirements / Exemptions instead. Only Net-Zero Industry Act and SB 253 / ACF preserve the spec order. |
| 7. Threshold Questions | conditional | conditional | yes (4/4) | yes (3/3) | Aligned in presence; **order drift in EU HDV** (placed after Anticipated Guidance and after Substantive Requirements). |
| 8. Substantive Requirements | always | always | yes | yes | Aligned |
| 9. Product-Specific Compliance Status | conditional | conditional | only ACF | none | Aligned |
| 10. Registration and Reporting Obligations | always | always | yes | yes | Aligned |
| 11. Operational System Requirements | always | always | yes | yes | Aligned |
| 12. Exemptions and Edge Cases | conditional | conditional | 3/4 (omitted in ACF — present as section 12 in numbered form) | 1/3 (only Battery) | Aligned (genuinely conditional content). |
| 13. Adjacent Industry Research and Alternatives | conditional | conditional | only ACF | only Net-Zero Industry Act | Aligned |
| 14. Confirmed Regulatory Timeline | always | always | yes | yes | Aligned |
| 15. Sources | always | always | yes | yes | Aligned |
| New Sources Identified (post-brief table) | not in section list — separate convention in storage section | yes (line 358) — required after brief body when external sources cited | yes (4/4) | yes (3/3) | Universally emitted as `# New Sources Identified` H1 even when arguably only the input source was cited. **Drift**: SKILL.md describes this only in the storage / changelog area, not as an enumerable section; the agent treats it as a heading. |
| YAML frontmatter (12 fields) | line 740 | lines 232–355 | yes (7/7) | yes (7/7) | Aligned. The parser extracts and validates this, not section names. |

### Section-name shape drift not captured in the table above

- **ACF** is the only brief that uses `## N. Section Name` (numbered H2). Every other brief uses `# Section Name` (unnumbered H1). The agent prompt and SKILL.md storage convention both say "Each section is a top-level heading (`# Section Name`) — section names match the format's section list exactly." ACF violates this — the headings are H2, not H1, and prefixed with the section number.
- **EU HDV CO2** has no document-title heading. Every other brief opens with `# <Regulation Title>` then either `## Regulatory Fact Document` (CA briefs and EU Battery) or jumps straight into `# Purpose and Scope ...`. EU HDV opens with `# Purpose and Scope of This Document` directly.
- The "Regulatory Fact Document" preamble heading (`## Regulatory Fact Document`) is not specified anywhere in either spec. It appears in 5/7 briefs (SB 253, SB 261, AB 1305, EU Battery, EU Net-Zero Industry Act partial-form). It's an undocumented convention.

### Section order drift summary

The prompt and SKILL.md both prescribe order 1→2→3→4→5→6→7→8→9→10→11→12→13→14→15. The actual emitted order varies:

- **SB 253**: 1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15, NS — spec order, conditionals-omitted
- **SB 261**: 1, 2, 3, 4, 7, 8, 6, 10, 11, 12, 14, 15, NS — **6 placed after 8 instead of before 7**
- **AB 1305**: 1, 2, 3, 4, 7, 8, 10, 11, 12, 6, 14, 15, NS — **6 placed after 12, not before 7**
- **ACF**: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, NS — full spec order with all sections
- **EU Battery**: 1, 2, 3, 4, 7, 8, 6, 10, 11, 12, 14, 15, NS — same drift as SB 261
- **EU HDV CO2**: 1, 2, 3, 4, 8, 6, 7, 10, 11, 14, 15, NS — **7 placed after 8 AND after 6**, double drift
- **EU Net-Zero Industry Act**: 1, 2, 3, 4, 6, 7, 8, 10, 11, 13, 14, 15, NS — spec order

3 of 7 briefs follow spec order. 4 of 7 drift, with the most common pattern being Anticipated Guidance (6) emitted late instead of before Threshold Questions (7).

### Sections that exist in agent prompt but not in SKILL.md (or vice versa)

None at the section-name level. The two specs name the same 15 sections in the same order with the same conditional flags. The only divergence is the comment header (`canonical, 2026-04-28`) which is a revision behind the body content (`regeneration_skill_version: "2026-04-29"`).

### Sections agent supposedly emits but never appear in real briefs

None observed in this 7-brief sample. Every documented section has at least one occurrence somewhere across the 7 briefs.

### Sections appearing in real briefs that aren't in either spec

- The undocumented `## Regulatory Fact Document` preamble heading (5/7 briefs)
- The undocumented document-title H1 heading (6/7 briefs — only EU HDV CO2 omits it)

---

## 5. Source-of-Truth Recommendation

**Agent prompt (`system-prompt.ts`) is the operative source of truth.** It is what the model receives at runtime. SKILL.md is reference + contract documentation. The prompt's own header acknowledges this: "The skill is reference + contract; this file is what the agent actually receives at runtime."

The two are content-aligned at the section-spec level (verbatim section names and order). The prompt is one comment-revision ahead of SKILL.md (prompt header still says `canonical, 2026-04-28`, both specs operationally implement `2026-04-29`). For the question "what does the agent emit?", read the prompt. For the question "what is the contract intended to be?", read SKILL.md.

Implicit conventions worth formalising (currently undocumented but consistently emitted):

- Document-title H1 (`# <Regulation Title>`) at the top of the brief, before the first numbered section. 6/7 briefs emit this. EU HDV is the outlier.
- `## Regulatory Fact Document` preamble after the title. 5/7 briefs emit this — it does not appear in any spec.
- `# New Sources Identified` H1 section appended after `# Sources` whenever external sources were cited. The prompt mentions this in the citation-extraction section but doesn't list it among the regulatory_fact_document's 15 sections. SKILL.md storage convention does not mention it at all. All 7 briefs emit it.
- ACF's `## N. Section Name` numbered-H2 convention is genuinely off-spec — the prompt and SKILL.md both prescribe unnumbered H1. ACF appears to be a one-off that escaped the storage convention.

Dead spec (specified but never emitted): none observed.

Order-drift in conditional sections 6 and 7 is the primary cleanup-opportunity if order matters for downstream rendering. If downstream rendering is heading-name based (it is, based on the parser), order drift is operationally harmless. If a future UI tier renders sections sequentially under prompted order assumptions, the 4 out-of-order briefs will surface as visual anomalies.

The parser does not enforce section names, order, or counts. Only the YAML frontmatter is enforced. This is by design — the integrity rule explicitly allows omitted sections — but it also means the agent can drift section names freely without any runtime check.

---

## 6. Implications for the Regulation Detail Summary Tab UI

Given the actual emitted structure (not the spec's aspirational structure), here is the realistic mapping for the upcoming intelligence-depth layering:

### Tier 1 — Quick-scan AI summary (~100 words, already generated separately)

This is generated outside the brief and stored separately. The brief's existing `# Issues Requiring Immediate Action` section is the closest in-brief equivalent — it's the one section that consistently leads with a severity label, action verb, and decision pressure across all 7 briefs. The 100-word summary should not be re-derived from the brief on every render; the existing separate field is correct.

### Tier 2 — Operational briefing (2–3 paragraph distillation)

Map to these emitted section names (use exact heading text, since the parser doesn't normalise):

1. **Issues Requiring Immediate Action** — 30-day actions with severity labels. Always present. This is the lead.
2. **What This Regulation Is and Why It Applies to the Workspace** — workspace-anchored "why this matters now". Always present, frequently has 2 H2 subs (Plain-Language Summary + Why It Applies).
3. **How the Workspace Sits in the Compliance Chain** — supply-chain role placement. Always present.

These three sections are the operationally distilled "what / why / where do I sit" that the operations lead needs in 30 seconds. They're guaranteed present in every regulatory_fact_document brief. They average ~3,000–6,000 chars combined per brief — too long to render verbatim; need to render as expandable cards or first-paragraph-only previews.

A 2–3 paragraph distillation should NOT try to summarise these on the fly with another LLM call — it should pre-extract the first paragraph of each, with section heading as a label.

### Tier 3 — Full regulatory analysis (full_brief deep dive)

Render the full_brief markdown with these section-aware behaviors:

- Always render the document title (H1, if present) and the `## Regulatory Fact Document` preamble (if present) as a quiet header — these are not content sections but they appear in 5–6/7 briefs.
- Render every `# H1` from the spec list as a top-level expandable section. Match by exact heading text — but ALSO match the ACF-style `## N. Section Name` (numbered H2) form, since that's an in-the-wild variant. Strip a leading `^\d+\.\s` from heading text when matching.
- The 6 conditional sections (5, 6, 7, 9, 12, 13) may or may not appear. Don't allocate UI slots for them; render them only if present.
- Honor whatever section ORDER the brief emits. Do not impose spec order on render — 4/7 briefs drift, and the agent's order may reflect content-flow judgments worth preserving. (If you want spec order, sort by a section-number lookup keyed on heading text; the parser doesn't do this today.)
- Render the `# New Sources Identified` table as a structured component (it's pipe-delimited per the prompt's specification at lines 360–362), not as raw markdown. This is parser territory but currently unparsed.
- Render YAML frontmatter as a sidecar metadata strip (severity badge, urgency tier, topic tags, compliance objects). The parser already returns this as `metadata`; the UI just needs to consume it.

### Section-to-tier matrix (concrete)

| UI tier | Section heading text (exact) | Always present? | Notes |
|---|---|---|---|
| Tier 1 | Quick-scan summary | (separate field, not from brief) | Pre-generated 100w |
| Tier 2 | Issues Requiring Immediate Action | yes | Leads with severity label |
| Tier 2 | What This Regulation Is and Why It Applies to the Workspace | yes | Often has 2 H2 subs |
| Tier 2 | How the Workspace Sits in the Compliance Chain | yes | Role placement |
| Tier 3 | Purpose and Scope of This Document | yes | Convention notes — useful as a tooltip / metadata strip rather than primary content |
| Tier 3 | Authoritative Guidance Document Analysis | conditional | Rare (1/7 in sample) |
| Tier 3 | Anticipated Authoritative Guidance and Pending Regulatory Events | conditional | 7/7 in sample — effectively always-present in mature briefs |
| Tier 3 | Threshold Questions | conditional | 7/7 in sample |
| Tier 3 | Substantive Requirements | yes | The dense core. H2 subsections vary by regulation. |
| Tier 3 | Product-Specific Compliance Status | conditional | 1/7 in sample (ACF) |
| Tier 3 | Registration and Reporting Obligations | yes | |
| Tier 3 | Operational System Requirements | yes | |
| Tier 3 | Exemptions and Edge Cases | conditional | 4/7 in sample |
| Tier 3 | Adjacent Industry Research and Alternatives | conditional | 2/7 in sample |
| Tier 3 | Confirmed Regulatory Timeline | yes | Dated milestones — high-value for ops |
| Tier 3 | Sources | yes | |
| Tier 3 | New Sources Identified | yes (when external sources cited) | 7/7 in sample. Pipe-delimited table — parse into structured component |

Operational note for the UI architecture decision: the **Confirmed Regulatory Timeline** section is structurally underused in the current UI and is the strongest candidate for promotion to Tier 2 alongside the three workspace-anchoring sections. It's always present, it carries dated milestones with workspace obligations attached, and it's the section operations leads will reference most for planning purposes.
