
# Claude Code Prompt — Freight Sustainability Intelligence App

## Files Provided

Read all files before writing any code:

1. **`FSI_HANDOFF.md`** — Complete build specification: architecture, database schema, API routes, Claude API prompts, automated worker, deployment guide
2. **`freight_sustainability_dashboard.jsx`** — **THE SOURCE OF TRUTH.** Working React component (1697 lines) with all 119 seed resources, full interactivity, scoring logic, export system, navigation stack, and every UI behavior. Every feature in this file must exist in the production app.
3. **`CURRENT_SKILL.md`** — Claude skill file with 80+ regulatory source URLs
4. **`FSI_DESIGN_SYSTEM_SKILL.md`** — Visual design direction (dark luxury editorial). Use as aesthetic guidance, NOT as a functional spec. The functional spec is the .jsx file.

---

## CRITICAL: Interactivity Is Non-Negotiable

The existing `.jsx` artifact has full interactivity that MUST be preserved in the production app. Do not simplify, stub out, or skip any of the following. Every single one of these works today and must work in production:

### Navigation
- **Tab bar** with 3 tabs: Home, Explore, Settings
- **Navigation stack** — clicking cross-references, focus view links, or briefing resource links pushes current view onto a stack. Back button pops the stack. Tab clicks clear the stack entirely.
- **Focus views** — filtered resource lists opened by clicking section headers (e.g., "Top Urgency →" opens a focus view with those resources). Focus views have their own title, back button, and full resource interaction.
- **Scroll-to-resource** — clicking a resource reference anywhere (briefing, cross-ref, dispute) scrolls to and highlights that resource in the main list.

### Resource Cards
- **Expand/collapse** — click card header to expand. Full detail view inside with all content blocks.
- **All content blocks must render:** What This Is, Why It Matters (highlighted), Key Data (all bullets), Impact Scores (4 dimensions, 0-3 each with visual bars), Timeline (horizontal milestones with past/future states and countdown to next milestone), Cross-references (links to related resources), Disputes (full note + source attribution badges), Verification status (verified/partial/unverified/disputed based on cross-reference count)
- **Priority override** — buttons to change resource priority (CRITICAL/HIGH/MODERATE/LOW) that update state immediately
- **Archive flow** — archive button with reason selector (Superseded/Expired/Repealed/Consolidated/Manual) and note field. Archived resources move to archive list in Settings.
- **Share menu** — per-resource share with 3 detail levels (Summary/Standard/Full) and 2 formats (HTML Report download, Slack text download). All downloads use Blob approach.
- **Auto-scroll** to expanded card top after opening (80ms delay)
- **Collapse bar** — full-width bar at bottom of expanded card with "Collapse" action

### Home Tab
- **Weekly Briefing** section — expandable, contains: executive summary, client talking points (with publication dates, priority badges, source links, "View in dashboard" navigation links), disputed items (with source attribution badges that are clickable), download buttons (Report HTML + Slack text)
- **What Changed** section — shows NEW resources and UPDATED resources with specific field-level diffs (PREV strikethrough → NOW bold for each changed field, with impact rating)
- **Top Urgency** section — resources sorted by urgency score, clickable to expand
- **Due This Quarter** section — resources with timeline milestones in the next 90 days, showing countdown
- **Supersessions** section — regulations that replaced older ones, with full timeline and severity
- Each section header is clickable to open a Focus View with the full filtered set

### Explore Tab
- **Filter bar** — filter by mode (Air/Road/Ocean), topic (7 categories), jurisdiction (8 regions), priority (4 levels)
- **Search** — text search across title, note, tags, whatIsIt, whyMatters
- **Sort** — by urgency score (default), priority, alphabetical, recently added, recently modified
- **Full resource list** with all card interactions working

### Settings Tab
- **Home section visibility toggles** — show/hide: briefing, what changed, urgency, due soon, supersessions
- **Default sort preference**
- **Export format preference** (Report/Slack)
- **Archive viewer** — search archived resources, filter by archive reason, restore from archive
- **Export Builder** — multi-select resources, drag-and-drop reorder, choose format, execute batch export

### Export System
- **All exports use Blob download** — `URL.createObjectURL()` → auto-trigger download → cleanup. No clipboard API (blocked in sandboxed environments). No `window.open()` (blocked). No `iframe.print()` (blocked).
- **Weekly Briefing export** — full HTML report with all talking points, diffs, disputed items, formatted with inline CSS and live hyperlinks. Also Slack text version.
- **Individual resource export** — 3 detail levels × 2 formats
- **Batch export** — Export Builder output with all selected resources
- **Toast notification** — "✓ File downloaded" after successful download
- **Event bubbling** — all share/download buttons use `e.stopPropagation()` to prevent toggling parent expand/collapse

### Scoring System
- **Impact scoring** — 4 dimensions (cost, compliance, client, operational), 0-3 each, computed from resource attributes and tags
- **Urgency scoring** — composite of impact score × priority weight × time weight (proximity to next milestone) × jurisdiction weight
- **Jurisdiction detection** — regex-based from resource text content
- **Cross-reference pairs** — bidirectional links between resources, used for verification status
- **Verification status** — verified (3+ links), partial (1-2 links), unverified (0 links), disputed (has active dispute)

---

## Visual Design Direction

The production app should use a **dark luxury editorial** aesthetic. This is GUIDANCE for Claude Code's design implementation — not a rigid pixel spec. Claude Code should adapt these principles to work with all the interactivity above.

### Color Palette
| Token | Hex | Role |
|-------|-----|------|
| Navy | `#171e19` | Primary background |
| Sage | `#b7c6c2` | Secondary text, labels, accents |
| White | `#ffffff` | Primary text, headings |
| Taupe | `#9f8d8b` | Metadata, tertiary text |
| Beige | `#d7c5b2` | Warm accents, dispute indicators |
| Cyan | `#d5f4f9` | Active states, highlights, key data, links |
| Soft Blue | `#bbe2f5` | Decorative, ambient elements |
| Charcoal | `#302b2f` | Alternate dark surface, card backgrounds |

### Typography
- **Anton** — all major headings, section titles, page title. Always uppercase, tight tracking.
- **Plus Jakarta Sans** (weights 300-700) — body text, labels, buttons, metadata, UI elements.
- Text-outline variant available: `-webkit-text-stroke: 1px var(--sage); color: transparent` for secondary display text.
- Minimum font size: 12px.

### Visual Elements
- **Ambient floating orbs** — large blurred circles (sage, soft-blue) behind content, 120px blur, 15% opacity, slow float animation. Decorative only, never block interaction.
- **Transitions** — all use `cubic-bezier(0.16, 1, 0.3, 1)` (fast entry, smooth settle). Card expansions ~600ms. Button hovers ~400ms. Content stagger at ~80ms intervals.
- **Borders** — primarily `1px solid rgba(255,255,255,0.06-0.15)`. Topic-colored left borders (3px) on resource cards.
- **Priority badges** — semi-transparent borders and backgrounds, not solid colored pills.
- **Buttons** — sharp corners (0-2px radius max), 1px border, color inversion on hover (white border → white fill + navy text).
- **No emojis for transport modes** — replace with clean text labels, icons from lucide-react, or minimal indicators. The emoji approach looks cheap against this aesthetic. Use something like small uppercase text badges ("AIR", "OCEAN", "ROAD") or subtle icon treatment.

### What NOT to Do
- Don't use soft shadows or blur effects on interactive elements
- Don't use rounded pill badges
- Don't use bright/saturated background colors
- Don't sacrifice any interactivity for visual design
- Don't use emojis where proper iconography or typography would be more appropriate

---

## Build Order

### Phase 1 — Database (Supabase)
Set up the schema from FSI_HANDOFF.md Section 4. All 9 tables with indexes and RLS. Write a seed script extracting all data structures from the .jsx file (SEED array, REMAP, CHANGE_LOG, SEED_DISPUTES, XREF_PAIRS, SUPERSESSIONS, SEED_ARC) and inserting them.

### Phase 2 — Backend API (Railway)
Node.js backend with all routes from Section 5. Port scoreResource and urgencyScore functions server-side. Include staged_updates approval/rejection flow.

### Phase 3 — Automated Worker
Weekly cron from Section 6. Calls Claude API with web_search tool using prompts from Section 7. Diffs against database, writes to staged_updates. Slack webhook notification.

### Phase 4 — Frontend (Vercel + React)
**This is where the .jsx file and design direction merge.** Migrate the working component into a proper Vite + React app. Connect to Supabase for live data. Apply the dark luxury editorial design system. **Every interactive feature listed above must work.** Use GSAP for card expansion animations. Use lucide-react for icons.

### Phase 5 — Skill File Generator
`/api/skill/generate` endpoint that queries active resources + source registry, calls Claude API with the skill generation prompt, returns downloadable SKILL.md.

---

## Key Constraints
- All exports use Blob download (no clipboard API, no window.open)
- Transport mode priority in default sort: air → road → ocean
- Cargo verticals: live events, artwork, luxury goods, film/TV, high-value automotive, humanitarian
- Staged updates require human approval — worker never writes directly to production
- Worker discovers and proposes new sources found during searches
- All interactive features from the original .jsx must be preserved — design is additive, not reductive
