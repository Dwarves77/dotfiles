# Caro's Ledge Intelligence Assistant Behavior Audit, 2026-05-18

- Date: 2026-05-18
- Branch: `feat/sprint-1-phase-5-implementation` at `49628a0` (caros-ledge-platform-intent rewrite commit)
- Method: Read-only code-level inspection. No browser automation. No live queries against carosledge.com or dev server.
- Skills loaded: `caros-ledge-platform-intent` (rewrite, 49628a0), `environmental-policy-and-innovation`, `sprint-followups-discipline`
- Status: DRIFT (the Assistant code path does not load platform skills, and the prompt drifts into decision-engine framing in violation of platform-intent Section 11)
- NOT VERIFIED scope: Live response quality (citation accuracy in output, cross-page synthesis in output, research-helper compliance in observed user-facing answers). Tool constraint: no browser automation. Operator may run a follow-up live verification.

## Audit summary

Assistant state: **DRIFT**. The Assistant's `/api/ask` route is a single-shot LLM proxy with a thin Supabase context injection (top 30 unfiltered intelligence_items plus top 20 sources). It loads zero platform skills at query time, ignores workspace_id, ignores per-page context (every per-page AiPromptBar fires the same payload as the global button), passes the LLM no source URLs or item IDs (citation is structurally impossible), and its system prompt explicitly instructs decision-engine behavior ("WHAT TO DO about it", "Always end with a clear 'What to do' recommendation"). The implementation is functional plumbing; it is not the research-helper grounded in `environmental-policy-and-innovation` that the rewritten platform-intent skill specifies in Section 4 and protects in Section 11.

## OBS coverage table

| OBS | State | Decision | Reasoning |
|---|---|---|---|
| OBS-1 | Cleared | NO ACTION | Phase 5 sequencing; no Assistant surface. |
| OBS-2, 3, 5, 21, 22 | Open | NO ACTION | Ingest pipeline scope; not Assistant. |
| OBS-4, 6, 11, 12 | Implemented | NO ACTION | Ingest/backfill/schema scope; not Assistant. |
| OBS-7 | Open | NO ACTION | Counsel-pending row; not Assistant. |
| OBS-8 | Deferred | NO ACTION | OBS-2 follow-up; ingest scope. |
| OBS-9 | Deferred | NO ACTION | Classifier feedback loop; Sprint 2 scope. |
| OBS-10 | Open | NO ACTION | Drift event monitoring; admin scope. |
| OBS-13, 14 | Open | NO ACTION | Phase 7 triage UI scope; not Assistant. |
| OBS-15 | Open | RELEVANT | Briefs cite journal homepages without article-level source context. The Assistant SELECTs `title, summary, why_matters, key_data, category, jurisdictions, transport_modes, priority, status` from intelligence_items: no source_url, no source_id, no DOI. The Assistant inherits the OBS-15 article-level opacity. Defer remediation to Phase 6 ingest owner per OBS-15 routing; Assistant SELECT must be updated when upstream fields land. |
| OBS-16 | Open | NO ACTION | Carryforward placeholder. |
| OBS-17, 23 | Open | NO ACTION | /admin scope; not Assistant. |
| OBS-18, 19, 20 | Open | NO ACTION | Per-page market/operations surfaces; not the Assistant wire. |

## Section A: Skill loading verification

**Finding: ABSENT.** No platform skill is loaded into the `/api/ask` system prompt at query time.

Evidence (`fsi-app/src/app/api/ask/route.ts`):
- Imports: `NextRequest`, `NextResponse`, supabase `createClient`, `requireAuth`, `checkRateLimit`. No filesystem reader, no skill loader, no reference to `environmental-policy-and-innovation` or `SKILL.md`.
- System prompt is a hardcoded string template (lines 75-104). It includes sector, modes, jurisdictions, and a `contextDoc` built from two Supabase queries. It does NOT include `environmental-policy-and-innovation` content (canonical taxonomy, integrity rule, severity vocabulary, format-mapping rules, intersection-detection contract, or source-type hierarchy).
- Grep across `fsi-app/src` for `SKILL.md` / `environmental-policy-and-innovation`: 9 matching files, NONE in `/api/ask`. Matches live in `lib/agent/system-prompt.ts`, `lib/agent/parse-output.ts`, `lib/llm/haiku-classify.ts` (regeneration and classifier paths, NOT the user-facing Assistant).

Implication: per platform-intent Section 4 the Assistant is required to be grounded in skill content. The current implementation is grounded only in Claude's training data plus 30 row summaries.

## Section B: Content access verification

**Finding: PARTIAL.** The route reads two Supabase tables, but with no workspace scoping, no category routing, and a column set that omits source attribution fields.

Evidence (`/api/ask/route.ts` lines 32-51):

```
.from("intelligence_items")
.select("title, summary, why_matters, key_data, category, jurisdictions, transport_modes, priority, status")
.eq("is_archived", false)
.order("priority")
.limit(30);

.from("sources")
.select("name, tier, status, update_frequency")
.eq("status", "active")
.order("tier")
.limit(20);
```

Findings:
- intelligence_items: 30-row LIMIT, priority-ordered, archive filter only. NO workspace_id filter, NO category filter, NO jurisdiction filter on the query. Jurisdictions reach the prompt header but not the query. Per platform-intent "Customer-Facing Value Gap" Item 1 (REC-OBS-G), category routing is unwired everywhere including here.
- Missing fields in the SELECT: `source_id`, `source_url`, `url`, `intersection_summary`, `related_items`, `full_brief`, `format_type`, `urgency_tier`, `topic_tags`. Per `environmental-policy-and-innovation` "Database Field Emission", these are the fields that ground a brief in a verifiable source and support intersection surfacing. None reach the Assistant.
- sources: 20-row LIMIT, status filter only. SELECT is `name, tier, status, update_frequency`: NO URLs, NO source_type, NO jurisdiction. The LLM cannot map an intelligence_item to its source because the source_id linkage never enters the prompt.
- Workspace context: `sectorProfile` and `jurisdictions` are read on the client (`AskAssistant.tsx` lines 19-20) and POSTed. The route uses them in the prompt header but does NOT filter the database queries by them. Art-logistics and humanitarian users get the same 30 rows; only the prompt header diverges.
- Per-page context: NONE. Per-page `AiPromptBar` instances do NOT pass `onSubmit`; they dispatch CustomEvent `open-ask-assistant` with only `{question}` in detail (`AiPromptBar.tsx` lines 42-53). Page, active filters, active tab, category: all dropped. The `AskAssistant` listener (`AskAssistant.tsx` lines 24-39) only reads `detail.question`.

Implication: per-page bars look scoped (placeholder copy says "Ask anything about market intel" or "Ask anything about your operations") but the wire is identical to the global bot. The product UX implies scoping the implementation does not provide.

## Section C: Citation accuracy

**Finding: code-level DOES NOT INSTRUCT structured citation; DOES NOT VALIDATE.**

Evidence:
- Prompt instructs "Ground every claim in the provided platform data. Cite specific regulations and data points." This is a string-level instruction; it does NOT require citing source URLs or item IDs that route back to platform records, and there is no instruction to refuse to answer when sourcing is thin.
- Prompt context lists items as `- {title} [{priority}], {summary} | Jurisdictions: ... | Modes: ...`. No URL, no item_id, no source link. Any cited URL would be a training-data hallucination, not a platform record.
- Post-processing: NONE. Route reads `data.content?.[0]?.text` and returns it verbatim. No validation that cited items exist; no URL resolution; no structured citation extraction.
- Response shape: `{answer, model}` free text. No `citations` field. Frontend renders `whitespace-pre-wrap`; no link rendering, no source-record routing.

Implication: every citation is either (a) a free-text title reference that may or may not match a row in the 30-row context, or (b) a training-data hallucination. Hallucinated citations are structurally possible.

## Section D: Cross-page synthesis behavior

**Finding: code-level PER-PAGE-ONLY in the route's framing, but the per-page bars do NOT scope queries.** Net behavior is single, undifferentiated context regardless of originating page.

Evidence:
- The route receives one request with `question`, `sectorProfile`, `transportModes`, `jurisdictions`. Nothing about page, tab, filters, or category.
- intelligence_items query is unfiltered by category; the prompt context is a single priority-ordered slice mixing regulations, market_signal, research_finding, regional_data, technology items.
- `intersection_summary` and `related_items` (the canonical cross-surfacing mechanism per `environmental-policy-and-innovation` "Intersection Detection") are NOT in the SELECT. The Assistant cannot surface known intersections; it can only re-derive associations from titles and summaries.

Implication: cross-page synthesis is neither prevented nor structurally enabled. Whatever cross-cutting answer emerges is LLM inference over a flat view, not platform-derived intersection signal.

## Section E: Page-level vs global Assistant behavior

**Finding: DIVERGENT presentation, UNIFIED wire behavior.** Per-page input does NOT carry per-page context downstream.

Evidence:
- `AiPromptBar` is mounted per-page in MarketPage, OperationsPage, ResearchView, RegulationsSurface, MapPageView, HomeSurface. Each instance passes only `placeholder` and `chips`, never `onSubmit`. Default fallback runs: `window.dispatchEvent(new CustomEvent("open-ask-assistant", { detail: { question } }))`.
- `AskAssistant` receives the event, reads `detail.question`, opens itself, and posts the same `{question, sectorProfile, jurisdictions}` payload as the global bot.
- Page identity, filters, active tab, originating-bar placeholder all drop at the CustomEvent boundary.

Implication: chips on `/market` ("What's the cost outlook for SAF fuel?") and `/operations` ("What are warehouse costs in Dubai?") suggest scoped Assistant behavior. The wire cannot deliver it.

## Section F: Decision-engine vs research-helper boundary

**Finding: PROMPT-DRIFT.** The system prompt explicitly instructs decision-engine behavior, not research-helper framing.

Evidence (`/api/ask/route.ts` lines 75-104, verbatim from the prompt):

```
Your job is to translate regulatory and market intelligence into SECTOR-SPECIFIC operational impact for this user...

Every answer must tell the user:
1. WHAT this means for THEIR specific operations
2. HOW MUCH it will cost them
3. WHEN they need to act
4. WHAT TO DO about it
5. WHO should own the action internally (Legal, Sustainability, Ocean Product, Air Product, Customs, Sales)
...
- Always end with a clear "What to do" recommendation tailored to their sectors.
```

Cross-reference against `caros-ledge-platform-intent` SKILL.md Section 4 ("Intelligence Assistant"):

> "Function. Research helper... The customer reads the structured content on the surface they are on, asks the Assistant for help with cross-cutting questions, applies their own judgment, and decides."

And Section 11 anti-pattern:

> "Treating Intelligence Assistant as a synthesis layer, decision engine, or Operations build deliverable. It is a research helper grounded in platform skills and content."

The prompt's "WHAT TO DO" / "Always end with a clear 'What to do' recommendation" language is the synthesis-and-recommendation framing the rewritten skill forbids. The prompt asks the LLM to recommend actions, assign internal ownership, translate (not surface) intelligence into operational impact, and end every answer with a recommendation. That is decision-engine framing.

A research-helper prompt would instead instruct: "Surface relevant platform content with citations. Present tradeoffs. Identify what records say and where they are silent. Let the customer decide."

Implication: the prompt predates the rewritten skill. Remediation requires a prompt rewrite bounding the LLM to research-helper scope.

## Section G: Source attribution behavior

**Finding: NO ATTRIBUTION (no structured), with SOURCE-PENDING bleed possible.**

Evidence:
- `intelligence_items` SELECT does not include `source_id`, `source_url`, or any source-linking field. The LLM has no source attribution to embed; cited sources come from training data, not platform records.
- `sources` SELECT does not include URL, jurisdiction, or source_type. The Assistant cannot map "binding law vs guidance vs analysis vs opinion" (env-policy Source Type Hierarchy) even though the prompt asks for the distinction. No source-type metadata is provided.
- SOURCE PENDING bleed: when `intelligence_items` rows have NULL source linkage, the Assistant's prompt context inherits the NULL state silently. The route does not detect, warn, skip, or label ungrounded items.

Implication: the Assistant either invents source attribution from training data or omits attribution. Either is wrong relative to the platform's integrity rule. Free-text titles are not routable back to the sources record.

## Consolidated findings

| ID | Severity | Finding | Code location |
|---|---|---|---|
| F-1 | CRITICAL | No platform-skill loading at query time; the `environmental-policy-and-innovation` skill content is absent from the system prompt. Violates platform-intent Section 4 grounding requirement. | `/api/ask/route.ts` lines 75-104 |
| F-2 | CRITICAL | System prompt instructs decision-engine behavior ("WHAT TO DO", "Always end with a clear 'What to do' recommendation"). Violates platform-intent Section 11 anti-pattern. | `/api/ask/route.ts` lines 83-100 |
| F-3 | CRITICAL | intelligence_items SELECT omits source_id, source_url, intersection_summary, related_items, full_brief. Structured citation and intersection surfacing are mechanically impossible. | `/api/ask/route.ts` line 40 |
| F-4 | HIGH | Per-page AiPromptBar does not carry page, tab, category, or filter context downstream. CustomEvent payload is `{question}` only. The chip-suggestion UI implies page-scoped Assistant; the wire does not support it. | `AiPromptBar.tsx` lines 42-53; `AskAssistant.tsx` lines 24-39 |
| F-5 | HIGH | intelligence_items query is unfiltered by workspace, category, jurisdiction. 30-row priority-ordered slice is the same for every user on every page. | `/api/ask/route.ts` lines 38-43 |
| F-6 | HIGH | No citation post-processing; no validation that cited item titles or URLs exist in platform records. Hallucinated citations are possible by construction. | `/api/ask/route.ts` lines 119-125 |
| F-7 | MEDIUM | Source-type hierarchy not surfaced into the prompt; LLM is asked to distinguish binding law from guidance from opinion with no source-type metadata. | `/api/ask/route.ts` lines 46-51 |
| F-8 | MEDIUM | Response shape is free text only; no structured `citations: [...]` field; frontend has no source-record routing. | `/api/ask/route.ts` line 122; `AskAssistant.tsx` line 185 |
| F-9 | MEDIUM | SOURCE PENDING / NULL source_id rows flow into prompt context with no detection or warning; integrity-rule violation. | `/api/ask/route.ts` lines 38-43 |
| F-10 | LOW | Hardcoded "claude-sonnet-4-6" model string in route; no model-selection or fallback. | `/api/ask/route.ts` line 73 |

## Recommended new OBS entries

(Do NOT add to followups.md; flag for operator triage.)

- **REC-OBS-24**: Intelligence Assistant `/api/ask` route does not load `environmental-policy-and-innovation` SKILL.md content into the system prompt. Violation of platform-intent Section 4 grounding requirement. Owner: Sprint 2+ Intelligence Assistant quality work per platform-intent Section "Customer-Facing Value Gap" Item 6. Cross-references: REC-OBS-25, REC-OBS-26, OBS-15.
- **REC-OBS-25**: Intelligence Assistant system prompt instructs decision-engine behavior (steps 1-5 culminating in "WHAT TO DO" recommendation; mandatory closing "What to do" line). Violation of platform-intent Section 11 anti-pattern. Owner: Sprint 2+ Intelligence Assistant quality work. Cross-references: REC-OBS-24.
- **REC-OBS-26**: Intelligence Assistant prompt context omits source_id, source_url, intersection_summary, related_items from intelligence_items SELECT. Structured citation and intersection-surfacing are impossible. Owner: Sprint 2+ Intelligence Assistant quality work; coupling to OBS-15 article-level source context (Phase 6 ingest owner). Cross-references: OBS-15, REC-OBS-24.
- **REC-OBS-27**: Per-page AiPromptBar drops page, tab, filter, category context at CustomEvent boundary. Per-page chip suggestions promise scoped Assistant behavior the wire does not deliver. Owner: Sprint 2+ Intelligence Assistant quality work. Cross-references: REC-OBS-26.
- **REC-OBS-28**: Assistant intelligence_items query is unfiltered by category; same unfiltered 30-row slice for every page. Coupled to REC-OBS-G (category routing wiring) since the category-aware RPCs that the four pages need are also what the Assistant query should join. Cross-references: alignment-audit-2026-05-18.md Section B; REC-OBS-G.

## Methodology and limits

- Method: read-only static inspection of `/api/ask/route.ts`, `AskAssistant.tsx`, `AiPromptBar.tsx`, `AppShell.tsx`, plus Grep across `fsi-app/src` for skill-loading references, source attribution fields, and citation handling. Cross-referenced findings against the rewritten `caros-ledge-platform-intent` SKILL.md (49628a0) and `environmental-policy-and-innovation` SKILL.md.
- Tool constraint: no browser automation, no live request to carosledge.com or a local dev server. Live response quality (Sections C, D, F observed in actual answers) is NOT VERIFIED. A follow-up dispatch with browser automation, or a manual operator check, would confirm: do hallucinated citations actually appear in responses; does the LLM actually obey the "What to do" recommendation prompt instruction; does cross-page synthesis actually surface intersections.
- Code-level findings are firm: the prompt instructions, the SELECT columns, the CustomEvent payload shape, and the absence of skill loading are deterministic facts about the implementation.
- Limit on hallucinated-citation reasoning: Section C concludes hallucinated citations are STRUCTURALLY POSSIBLE, not that they always occur. A well-behaved LLM might decline to cite when context lacks URLs; a poorly-behaved one might invent. Code does not enforce either path.

=== Value Delivery Check ===

This dispatch's work does NOT directly advance customer-facing value delivery on any of the five surfaces (Regulations, Market Intel, Research, Operations, Community) or cross-cutting capabilities (Map, Intelligence Assistant, Onboarding).

This is an Intelligence Assistant behavior audit; it produces findings for Sprint 2+ Assistant quality work per platform-intent SKILL.md Section "Customer-Facing Value Gap" Item 6. Live response quality is marked NOT VERIFIED per agent tool constraints; operator may dispatch a follow-up with browser automation OR perform live checks manually.

Dual-posture: audit applies equally to current operational scope (art logistics, live events, luxury goods, automotive, humanitarian) and expansion-time users (broader freight forwarding). The findings are about route-level wiring, prompt framing, and SELECT-column gaps; none of these vary by cohort. Remediation will serve both halves equally.
