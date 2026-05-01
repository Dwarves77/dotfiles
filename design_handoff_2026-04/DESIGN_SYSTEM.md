# Caro's Ledge — Design System

Freight sustainability intelligence for international freight forwarders handling high-value cargo across air, road, and ocean transport.

The product monitors ESG regulations, carbon pricing, fuel mandates, and environmental policy across jurisdictions (EU, IMO, ICAO, EPA, CBAM, FuelEU, CORSIA, EUDR, PPWR), translates each signal into cause-and-effect operational impact, and surfaces urgency-scored intelligence briefs.

**Users:** freight operators, sustainability leads, logistics strategists working live events, fine art, luxury goods, film & TV production, high-value automotive, humanitarian cargo.

**Product surface covered:** `fsi-app/` — the Next.js web app at carosledge.com. Marketing site and app share the same shell.

---

## Aesthetic posture

Editorial. Considered. Typographic. Structurally honest.

The product is named after the sculptor **Anthony Caro**, whose work insisted on visible construction — beams as beams, welds as welds, materials doing their actual job. The UI inherits that posture: type does the heavy lifting, structure is exposed, nothing is decorated to hide what it is.

Reference points: *Financial Times*, *Bloomberg* (the terminal, not the consumer app), *The Economist*, Aeon, trade-press intelligence bulletins. **Not** a SaaS dashboard. No bright accent tiles, no gradient headers, no rounded shadowed CTAs, no emoji-forward empty states.

This is intelligence work. The reader is a professional. They want density, clarity, provenance, and a clear signal of urgency — not a product tour.

---

## Sources (for the reader with access)

- **Live site:** https://carosledge.com — treat as ground truth
- **Repo:** `Dwarves77/dotfiles`, subpath `fsi-app/` (Next.js + Tailwind + shadcn/ui, deployed on Vercel)
- **Original spec:** `fsi-app/CLAUDE.md` in that repo — **do not** follow it literally. The live product has intentionally drifted from the spec. The rendered site + current component code are the source of truth.
- **Typefaces (original spec):** Plus Jakarta Sans + Anton. Current site may differ; see `colors_and_type.css` for what this system documents.

> **Caveat.** This pass was built from the written brief without access to the live site or repo during the session. Where exact tokens couldn't be confirmed, I've proposed values consistent with the editorial posture described — flagged inline. The user should spot-check against the live site and correct.

---

## Index

| File | What it is |
|---|---|
| `README.md` | This file. Context, content fundamentals, visual foundations, iconography. |
| `colors_and_type.css` | CSS custom properties — base + semantic tokens. |
| `fonts/` | Web fonts (Google Fonts links; no TTFs bundled). |
| `assets/` | Logos, marks, any imagery. |
| `preview/` | Design-system preview cards (Type, Colors, Spacing, Components, Brand). |
| `ui_kits/fsi-app/` | Pixel-fidelity recreation of the app: feed, brief detail, jurisdiction filter. |
| `SKILL.md` | Agent-skill manifest for use in Claude Code. |

---

## CONTENT FUNDAMENTALS

Caro's Ledge reads like a **trade-press dispatch**, not a product. Copy is written to be scanned by a margin-protecting operator who has eight minutes between flights.

### Voice

- **Third person, institutional.** "The regulation takes effect 1 Jan 2027." Not "You'll need to comply by..."
- **Named sources matter.** Every signal cites its jurisdiction and instrument: "EU Commission — CBAM Article 30", "IMO MEPC.377(80)". The citation *is* part of the copy.
- **Cause-and-effect, not hype.** "FuelEU Maritime raises the GHG intensity penalty to €2,400/tCO₂e in 2026. On a Rotterdam–New York route at current bunker mix, this adds €84–110 per TEU."
- **Urgency is quantified, not adjectival.** Say "48 hours to public consultation close" — never "urgent" or "critical" as the lone signal. The urgency chip carries the flag; the prose carries the math.

### Casing

- **Sentence case for almost everything.** Headlines, section labels, buttons. Title Case reads marketing; sentence case reads journalism.
- **All-caps is a structural tool, not an emphasis tool.** Use it only for eyebrow kickers, jurisdiction tags ("EU · CBAM"), and the masthead. Tracked +80–120 when set caps.
- **Numerals:** oldstyle figures in running prose where the face supports them; lining figures in tables and data.

### Pronouns, tense, register

- Prefer **we don't exist** — the product is invisible, the intelligence is the thing. Avoid "we've added", "our platform".
- **You** appears only in direct operator instructions inside the app ("Mark as reviewed"). Never in editorial copy.
- **Present tense** for active regulations; **future perfect** for scheduled instruments ("will have phased in by Q3 2027"). Past tense is reserved for closed consultations and finalized rulings.

### No-go list

- No emoji. Not in empty states, not in toasts, not in celebration moments. There are no celebration moments.
- No exclamation points.
- No em-dash overuse. One per paragraph, maximum, and only where a semicolon wouldn't carry it.
- No "seamlessly", "leverage", "unlock", "power", "supercharge", "revolutionize", "journey".
- No "Oops!" — error states read "Request failed. The server returned 502. Retry."
- No rhetorical questions as headers.

### Examples (in-house style)

**Good headline:**
> CBAM default values expire 31 Dec. Importers without verified embedded-emissions data face the 20% penalty rate from 1 Jan.

**Bad headline:**
> ⚡ Big CBAM update — here's what you need to know!

**Good empty state:**
> No briefs match this filter. Clear jurisdiction or widen the date range.

**Bad empty state:**
> Nothing here yet! 🌱 Start by subscribing to a jurisdiction.

**Good brief excerpt:**
> The Commission's 14 Oct delegated act narrows the scope of Article 7(1) exemptions to cargo under 2,500 kg gross. Art handlers moving works above this threshold via charter will now file quarterly returns. First return window: 1 Apr–30 Apr 2027.

---

## VISUAL FOUNDATIONS

### Palette

Near-monochrome. Paper and ink. One restrained accent for urgency, one for jurisdiction tags.

- **Paper** `#F6F3EC` — warm off-white, the base surface. Warmer than Bloomberg-white, cooler than newsprint. Slight cream.
- **Ink** `#1A1A1A` — primary text. Not pure black; sits closer to printed ink on uncoated stock.
- **Oxblood** `#6E1F1A` — the single urgent accent. Used for the urgency chip at levels 4–5, and the masthead rule. Earned, never decorative.
- **Brass** `#8A6A2A` — secondary tag color, used for jurisdiction chips and the editorial eyebrow. Muted, old-press.
- **Slate** `#2E3A3E` — reserved for data-ink: chart strokes, table rules, structural dividers.
- **Paper-2** `#EFEBE0` — one step darker than paper; the "striped row" in tables, the aside block.
- **Ash** `#8A857B` — secondary text, meta, timestamps, byline.

No bright blues. No green "success". A completed state is just ink on paper with a rule through it.

### Type

Two families, working their actual job.

- **Serif display / editorial** — used for headlines, brief titles, pull quotes. A transitional serif with strong verticals. Spec proposed *Plus Jakarta Sans + Anton*; this system uses **GT Sectra / Source Serif 4** as the serif (substitution flagged — see Type cards). Anton is retained for masthead and section plates only.
- **Sans / UI** — used for chrome, data, forms, dense secondary text. Neutral grotesque. **Inter Tight** is proposed here; swap for the live site's chosen face when confirmed.
- **Mono** — for citation strings, identifiers (CBAM-2025-14), and code-adjacent data. **JetBrains Mono** at small sizes only.

**Scale** (display-first, not modular/scale-generator):

| Role | Face | Size | Line | Tracking |
|---|---|---|---|---|
| Masthead | Anton | 56 | 1.0 | +20 |
| Headline | Serif | 40 / 32 | 1.15 | -5 |
| Deck / dek | Serif italic | 22 | 1.35 | 0 |
| Body | Serif | 17 | 1.55 | 0 |
| UI text | Sans | 14 | 1.4 | 0 |
| Meta / byline | Sans | 12 | 1.3 | +40 |
| Eyebrow | Sans caps | 11 | 1.2 | +120 |

### Spacing & rhythm

8-point base, but the editorial layout leans on a **12-column print grid** with generous outer margins. Vertical rhythm follows a 24-px baseline for body copy.

- Tight: 4, 8
- Default: 12, 16, 24
- Air: 40, 64, 96 — used between sections of a brief

Density is higher than a SaaS app and lower than a trading terminal. Roughly FT-article density.

### Backgrounds, texture, imagery

- **No gradients.** Ever. The background is flat paper color.
- **No hero photography.** Intelligence briefs do not need stock imagery. If a brief has supporting imagery (a port diagram, a regulatory flowchart), it's hand-drawn or schematic — line art on paper, not photography.
- **Optional grain.** A very faint noise overlay (1–2% opacity) on the paper surface of masthead / brief-detail pages. Subtle; off by default on data views.
- **Full-bleed is rare.** Reserved for a single "cover" brief on the home masthead.
- **Rules do the work that shadows do elsewhere.** A 1px ink hairline separates sections. A 3px navy → red gradient anchors the masthead (shell chrome — fixed, not part of the urgency budget).

### Animation

- **No bounces, no springs.** Nothing oversells.
- **Fades and opacity only.** 120–180 ms, `cubic-bezier(0.2, 0, 0.2, 1)`.
- **Scroll:** native. No scroll-jacking, no parallax.
- **Hover:** text underlines appear (opacity 0 → 1 on a 1px underline rule); icons shift opacity 70→100.
- **Press:** opacity 60 on mousedown, no scale transform.

### Hover / press / focus

- **Hover on links:** 1px underline becomes visible; color unchanged.
- **Hover on cards / list rows:** background steps to `paper-2`; no shadow, no lift.
- **Focus ring:** 2px ink outline, 2px offset. High contrast, honest.
- **Press:** opacity 0.6, no scale.

### Borders, rules, shadows

- **Hairline rule:** 1px `ink @ 12%` — the default divider.
- **Structural rule:** 1px `ink @ 100%` — section dividers, table header.
- **Masthead rule:** 3px `linear-gradient(90deg, var(--accent), var(--critical))` — navy to red, shell chrome on every page. Fixed; never spent against the urgency budget.
- **Editorial rule:** 2px `oxblood` — reserved for editorial moments only (a section divider on a brief, a callout edge on a high-severity dispatch). **Budget: one oxblood rule per screen, max.** Stat tiles and priority list rails use the standard priority palette, not oxblood.
- **Shadows:** *none*. There is no elevation system. If something needs to feel lifted, it is typographically heavier or it sits on paper-2. The one named exception is `--shadow-popover`, used on the user-menu popover only.
- **Corner radii:** **0 everywhere**, with one exception — chips and the search pill use a 2px radius. Buttons are square.

### Transparency & blur

- **Transparency:** used on rules (`ink @ 12%`), never on surfaces.
- **No backdrop-blur.** No frosted glass. Sticky headers are opaque paper with a hairline under them.

### Cards

"Cards" is the wrong word — these are **article blocks** on a page.

- No border box by default. Cards are separated by a hairline below and generous whitespace.
- A "featured" block may sit on `paper-2` with no border.
- An "urgent" block carries a 2px oxblood rule on its top edge, flush-left aligned. (Counts against the one-oxblood-per-screen budget.)
- No drop shadow. No rounded corners on the block itself.

### Stat tiles / status strips

Stat tiles are the 4-up summary strips that sit beneath a masthead on screens like Dashboard, Regulations, Operations, Market intel, Research, and Regulation detail. The pattern below applies wherever a tile carries a priority or lifecycle semantic.

**Rule (Option 2 — priority-coloured, not muted-by-default):**

- **Eyebrow + numeral both take the priority/lifecycle colour.** Not just the numeral, not just the eyebrow. The whole top half of the tile reads as one chord.
- **The leftmost "primary state" tile gets a left rail and tinted background.** 4px `border-left` in the priority colour, `*-bg` fill, matching `*-bd` border. Only one tile per strip earns the rail.
- All other tiles in the strip stay flat — bordered, no rail, no tint.
- Caption (`.m`) and helper text remain `text-2`. The colour stays in the data, not the prose.

**Lifecycle mapping reference:**

| Strip | Tile order | Coloured + railed | Coloured, no rail | Muted (text-2) |
|---|---|---|---|---|
| Dashboard / Regulations / Operations | Critical → High → Moderate → Low | Critical | High, Moderate, Low | — |
| Market intel | Watch → Elevated → Stable → Info | Watch | Elevated, Stable, Info | — |
| Research | Draft → Active → Published → Archived | Active | Published | Draft, Archived |
| Regulation detail | Effective · Penalty rate · Exposure · Lanes | Penalty rate | (numeral only on the alert tile) | the rest |

The rail is reserved for the tile that is in-flight — the one demanding attention this week. Published states get colour without the rail because they are confirmed, not active. Draft and archived states stay muted because there is nothing to read into the colour.

Stat-tile colour is not part of the oxblood budget. It uses the standard priority palette (`--critical`, `--high`, `--moderate`, `--low`) and lifecycle equivalents.

### Layout rules

- **Max measure:** 68ch for body editorial; 85ch for meta-heavy briefs.
- **Outer margin:** 64px desktop / 24px mobile, but respect the 12-col grid.
- **Masthead:** fixed, 72px tall, hairline below. Never translucent.
- **Sidebar filter (feed):** 280px, hairline right, flush-top.
- **No centered hero copy.** Text is left-aligned like a newspaper column.

### Iconography vibe

Line icons, 1.25px stroke, 20px box, no fill. See `ICONOGRAPHY` below. No icon should ever need a tooltip to be understood in context; if it does, it's the wrong icon and we use the word instead.

### Imagery (when it appears)

Mostly schematic: port / route / regulator flow diagrams in 1-color line art on paper. If a photo is unavoidable (e.g. a news byline image), it is duotone paper/ink at 80% opacity with grain.

---

## ICONOGRAPHY

Caro's Ledge uses **line icons, not filled icons**. Stroke is the structural honesty principle applied to glyphs: you can see how the icon is drawn.

### System

- **Set:** **Lucide** (CDN). Chosen because it's a Feather-derived set with consistent 1.5px stroke, open terminals, no fills, matches the editorial register. Linked from CDN in the UI kit — no icon font bundled.
- **Stroke:** 1.25–1.5px. Never 2px — too heavy for the paper aesthetic.
- **Size:** 16 / 20 / 24 px. Default UI icon is 20px.
- **Color:** inherits text color (`currentColor`). Icons are never tinted except in one case — the urgency flag uses `oxblood` explicitly.
- **No filled variants.** If you need emphasis, make the text heavier; don't solid-fill the icon.
- **No emoji.** Not anywhere in the product.
- **No unicode-as-icons** (no ★, no ►). Use Lucide or a word.

### When to use a word instead of an icon

Prefer text for:
- Jurisdiction tags (write "EU · CBAM", don't flag-icon)
- Urgency level (write "L4 · 48h", the word does more than the icon)
- Any primary navigation item — use the word, maybe with a small icon to its left

### Placeholder assets shipped here

- `assets/wordmark.svg` — text-only wordmark set in the serif
- `assets/mark.svg` — a single-glyph ledger rule mark

> **Caveat.** The real live-site logo wasn't accessible during this pass. The shipped wordmark follows the typographic posture of the brief but should be replaced with the production lockup. Flagged for the user to supply.

---

## Critique — current direction, on its own terms

Because the live site wasn't accessible during this session, the critique below is directional — it responds to the *posture* the brief describes, not to a pixel audit. Treat it as a prompt, not a verdict.

**Working:**
- The editorial register is genuinely differentiated. Trade-press intelligence sold as software is a rare posture; it earns trust from operators who distrust dashboards.
- Naming the product after Caro is load-bearing — it gives the team a north star (visible structure) that resists dashboard-drift every time a PM asks for a KPI tile.
- Near-monochrome + one oxblood accent is the right call. It lets urgency *mean* something; in a rainbow palette it would not.

**Weak, likely:**
- The risk is **drift toward pastiche** — serif headlines + cream background can read *more* like a blog theme than a tool if the data rendering isn't as editorial as the prose. The tables need to be as considered as the hed.
- **Urgency inflation.** If more than ~15% of briefs wear the oxblood rule, the rule stops working. A strict budget is needed — only L4/L5 out of a 5-level scale earn it.
- **Density dishonesty.** Editorial typography wants air; operators want density. The feed view is where these fight. Resist the temptation to cram; do the opposite — make the feed an actual index page with generous leading, and let the brief detail be where dense data lives.

**Concrete refinements that don't pull toward the old spec:**
1. **Kill any remaining rounded corners on chrome.** Chips at 2px radius, everything else square.
2. **Stop shadows.** If anything in production still has `box-shadow`, replace with a hairline or a paper-2 background step.
3. **Promote the citation.** The "EU Commission — CBAM Art 30" string should be the second-most-prominent thing on every brief after the headline, not buried in meta.
4. **One oxblood rule per screen, max.** Treat it like a print masthead rule — scarcity is the whole point.
5. **Oldstyle figures in prose, lining in tables.** Small, but it's the single thing that tips "serious publication" over "serif website".
6. **Kill the hover-lift.** If any card still rises on hover, it reads SaaS. Replace with the paper-2 background step.
