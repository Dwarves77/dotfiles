# Font weight usage audit, 2026-05-11

## TL;DR

`src/app/layout.tsx` loads six font weight files via `next/font/google`: Plus_Jakarta_Sans at 300, 400, 500, 600, 700, and Anton at 400. Of those six, ONE Plus_Jakarta_Sans weight (300) appears entirely unused in `src/`, and the codebase ALSO uses two heavier Plus_Jakarta_Sans weights (800 and 900) that are NOT loaded, meaning the browser is currently faux-bolding them from the 700 file at runtime. Anton 400 is in use. Recommendations are per-weight in the cross-reference table below; the operator decides what to drop or what to add.

Headline numbers:

- Loaded weights: 6 (5x Plus_Jakarta_Sans, 1x Anton).
- LOADED-but-UNUSED weights: 1 (Plus_Jakarta_Sans 300).
- USED-but-NOT-LOADED weights: 2 (Plus_Jakarta_Sans 800 used 83 times across CSS and inline; 900 used 1 time in `.cl-stat-number`). These are silently faux-bolded today.
- Projected payload reduction if Plus_Jakarta_Sans 300 is dropped: roughly 1 of 5 latin subset WOFF2 files for Plus_Jakarta_Sans. Plus_Jakarta_Sans Google latin subsets are typically about 18 to 25 KB per weight after Brotli, so dropping one weight removes one preloaded WOFF2 file from the inlined `<link rel="preload">` tags Next emits and trims roughly 18 to 25 KB of preloaded font payload, plus the corresponding `@font-face` CSS line in the head.

## Loaded weights (per src/app/layout.tsx)

From `C:/Users/jason/dotfiles/fsi-app/src/app/layout.tsx`:

```
const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});
```

`next/font/google` is invoked exactly once in the codebase (this file). No `next/font/local`. CSS variables exposed: `--font-anton`, `--font-jakarta`, both wrapped further in `theme.css` and `globals.css` as `--font-sans` (Plus_Jakarta_Sans) and `--font-display` (Anton).

There is NO `tailwind.config.*` file. The project uses Tailwind v4 via the `@tailwindcss/postcss` plugin (`postcss.config.mjs`), with theme tokens declared in a `@theme inline` block at the top of `src/app/globals.css`. That block does NOT redefine any of Tailwind's font-weight scale, so the default mapping holds: `font-light`=300, `font-normal`=400, `font-medium`=500, `font-semibold`=600, `font-bold`=700, `font-extrabold`=800, `font-black`=900.

## Used weights breakdown

Counts below are restricted to `C:/Users/jason/dotfiles/fsi-app/src/`. Counts marked "(export HTML)" are weights baked into HTML strings emitted by `lib/export/htmlReport.ts` and `lib/export/shareBuilder.ts` for downloadable reports; those bytes ship to the recipient's email/browser inside the export payload, NOT applied to the FSI app fonts, so they are NOT a reason to keep an in-app font weight. They are listed for completeness.

### Weight 100, 200

Zero references anywhere. (Not loaded.)

### Weight 300 (font-light)

- Tailwind class `font-light`: 0 occurrences.
- Inline `fontWeight: 300`: 0 occurrences.
- CSS `font-weight: 300`: 0 occurrences.
- Tailwind bracket form `font-[300]`: 0 occurrences.
- Total in-app references: 0.

### Weight 400 (font-normal)

- Tailwind class `font-normal`: 172 occurrences across 55 files. Sample: `src/components/ui/Button.tsx:1`, `src/components/Sidebar.tsx:2`, `src/components/resource/ResourceDetail.tsx:10`.
- Inline `fontWeight: 400`: 29 occurrences across 22 files. Sample: `src/app/community/page.tsx:324`, `src/components/community/CommunityShell.tsx:206`, `src/components/community/CouncilMembersRail.tsx:197`.
- CSS `font-weight: 400`: 7 occurrences in `src/app/globals.css` (e.g. `.cl-card-body`, `.cl-typeset-h`).
- Total in-app references: ~208. Heavy use.
- Note: 400 is also the implicit fallback when `font-family` is set without a weight (e.g. body text via `body { font-family: var(--font-jakarta) ... }` in `globals.css:133`). Even with zero explicit references, 400 would still be required.

### Weight 500 (font-medium)

- Tailwind class `font-medium`: 143 occurrences across 56 files. Sample: `src/components/admin/AdminDashboard.tsx:4`, `src/components/community/CommunityHub.tsx:6`, `src/components/sources/CanonicalSourceReview.tsx:11`.
- Inline `fontWeight: 500`: 2 occurrences (`src/components/community/NotificationsList.tsx:405`, `src/lib/export/htmlReport.ts` (export HTML)).
- CSS `font-weight: 500`: 1 occurrence (`src/app/globals.css:89` `.cl-card-meta`).
- Total in-app references: ~146. Heavy use.

### Weight 600 (font-semibold)

- Tailwind class `font-semibold`: 107 occurrences across 45 files. Sample: `src/components/map/MapView.tsx:11`, `src/components/resource/IntelligenceBrief.tsx:8`, `src/components/resource/SectorSynopsis.tsx:12`.
- Inline `fontWeight: 600`: 47 occurrences across 27 files. Sample: `src/components/admin/IssuesQueue.tsx`, `src/components/community/ModerationActions.tsx`, `src/components/community/NotificationsList.tsx`.
- CSS `font-weight: 600`: 0 occurrences in `src/app/`.
- Total in-app references: ~154. Heavy use.

### Weight 700 (font-bold)

- Tailwind class `font-bold`: 1 occurrence (`src/components/community/PromotePostDialog.tsx:1`).
- Inline `fontWeight: 700`: 147 occurrences across 51 files. Heaviest single weight by inline count. Sample: `src/components/community/CommunitySidebar.tsx`, `src/components/regulations/RegulationsSurface.tsx`, `src/components/community/NotificationsList.tsx`.
- CSS `font-weight: 700`: 11 occurrences in `src/app/globals.css` (e.g. `.cl-section-label`, `.cl-card-title`, `.cl-badge`, `.cl-typeset-h .count`, `.cl-typetag`, `.cl-wl-item .t`, `.cov-item .t`, `.cl-rev-item .t`).
- Inline `style="...font-weight:700..."` strings inside `MapView.tsx` map markers: 2.
- Total in-app references: ~161 (excluding exports). Heavy use.

### Weight 800 (font-extrabold)  NOT LOADED

- Tailwind class `font-extrabold`: 0 occurrences.
- Inline `fontWeight: 800`: 76 occurrences across 30 files. Sample: `src/components/community/CommunitySidebar.tsx:370`, `src/components/community/GroupCard.tsx:352`, `src/components/community/GroupHeader.tsx:249,271,292`, `src/components/market/PolicySignals.tsx:69,140,244`, `src/components/research/ResearchView.tsx` (16 occurrences), `src/components/regulations/RegulationDetailSurface.tsx` (9 occurrences), `src/components/pages/MarketPage.tsx` (6 occurrences), `src/components/pages/OperationsPage.tsx` (5 occurrences).
- CSS `font-weight: 800`: 7 occurrences in `src/app/globals.css` (`.cl-page-title`, `.cl-typeset-eyebrow`, `.cl-typeset-foot a`, `.cl-wl-item .src`, `.cov-item .sev`, `.cl-rev-chip`, `.cl-stale-pill`).
- Total in-app references: 83. Substantial use.
- Browser behaviour today: because 800 is NOT in the loaded weight array, the browser falls back to the nearest available weight (700) and applies a synthesized faux-bold transform. Visual result is close to but not identical to true Plus_Jakarta_Sans 800.

### Weight 900 (font-black)  NOT LOADED

- Tailwind class `font-black`: 0 occurrences.
- Inline `fontWeight: 900`: 0 occurrences.
- CSS `font-weight: 900`: 1 occurrence (`src/app/globals.css:90` `.cl-stat-number` for dashboard hero numbers).
- Total in-app references: 1. Faux-bolded today (same caveat as 800).

### String-form weights

`fontWeight: 'bold' | 'normal' | 'light' | 'medium' | 'semibold' | 'bolder' | 'lighter'`: 0 occurrences in any TS/TSX/CSS file in `src/`. The codebase uses numeric weights consistently.

### Anton

- Anton is referenced exclusively via `var(--font-display)` inline style or inside the `.cl-typeset-h` CSS class. The Tailwind class `font-display` is NEVER used (0 occurrences).
- Approximately 45 inline `fontFamily: "var(--font-display)"` references across 25 files (mastheads, page titles, hero numbers, big numerics, section headers, modal titles).
- Anton ships as a single weight (400). All references render at that weight.
- USED. No action.

## Cross-reference table

| Weight | Loaded | In-app refs | Sample reference | Recommendation |
|---|---|---:|---|---|
| Plus_Jakarta_Sans 100 | No | 0 | n/a | Skip. Not needed. |
| Plus_Jakarta_Sans 200 | No | 0 | n/a | Skip. Not needed. |
| Plus_Jakarta_Sans 300 | YES | 0 | n/a | DROP candidate. Zero references in `src/`. Safe to remove from the `weight` array in `layout.tsx`. |
| Plus_Jakarta_Sans 400 | YES | ~208 | `globals.css:88 .cl-card-body` | KEEP. Heavy use, also implicit body default. |
| Plus_Jakarta_Sans 500 | YES | ~146 | `globals.css:89 .cl-card-meta` | KEEP. Heavy use. |
| Plus_Jakarta_Sans 600 | YES | ~154 | `IssuesQueue.tsx:260` | KEEP. Heavy use. |
| Plus_Jakarta_Sans 700 | YES | ~161 | `globals.css:87 .cl-card-title` | KEEP. Heavy use, also synthesizes 800/900 today. |
| Plus_Jakarta_Sans 800 | NO | 83 | `globals.css:85 .cl-page-title`, `CommunitySidebar.tsx:370` | OPERATOR DECISION: either ADD 800 to the weight array (true editorial weight, slight payload increase, roughly +18 to 25 KB Brotli for one WOFF2 file) OR accept faux-bold rendering and migrate the 83 references down to 700 to make rendering match the loaded font. Doing nothing leaves the codebase requesting a weight that does not exist. |
| Plus_Jakarta_Sans 900 | NO | 1 | `globals.css:90 .cl-stat-number` | OPERATOR DECISION: same as 800. Single-use case (.cl-stat-number, the dashboard hero numbers). Lowest-cost path is to change `.cl-stat-number` to `font-weight: 800` (and load 800) or to `font-weight: 700` (no font-add). Adding 900 just for one selector is hard to justify. |
| Anton 400 | YES | ~45 inline + 1 CSS | `globals.css:207 .cl-typeset-h` | KEEP. The only available Anton weight, used for editorial display headers. |

## Notes

### Tailwind config

There is NO `tailwind.config.*` file. Tailwind v4 is configured via `postcss.config.mjs` (which loads `@tailwindcss/postcss`) and a `@theme inline` block at the top of `src/app/globals.css`. The `@theme` block defines color tokens and font-family aliases (`--font-sans`, `--font-display`) but does NOT redefine font weight scale, font sizes, or any other typography token. So Tailwind's default font-weight class to numeric mapping is in effect:

- `font-thin` 100, `font-extralight` 200, `font-light` 300, `font-normal` 400, `font-medium` 500, `font-semibold` 600, `font-bold` 700, `font-extrabold` 800, `font-black` 900.

The bracket arbitrary-value form `font-[NNN]` is also supported by Tailwind v4 but is NOT used anywhere in `src/`.

### Implicit body default

`globals.css:133` sets `body { font-family: var(--font-jakarta), system-ui, sans-serif }` without a `font-weight`, so body text inherits the default of `400`. This means weight 400 cannot be dropped even if you can find no explicit `font-normal` or `font-weight: 400` references; the browser would pick it up via the body default. (As shown above, 400 has plenty of explicit references too.)

### Export builders

`src/lib/export/shareBuilder.ts` and `src/lib/export/htmlReport.ts` build standalone HTML reports as strings with inline `style="font-weight:NNN"` attributes (variants of 500, 600, 700 mostly). These styles affect the EXPORTED HTML when a user emails/downloads a report; they do NOT trigger any additional weight load in the FSI app itself. They are unrelated to the `next/font/google` weight array.

### Tailwind class for Anton

The Tailwind class `font-display` is never written. Every Anton render goes through `style={{ fontFamily: "var(--font-display)" }}` or the `.cl-typeset-h` CSS rule. If the team wants to consolidate, switching to `className="font-display"` would work because the `@theme` block declares `--font-display`, which Tailwind v4 should expose as a `font-*` utility (though the existing inline-style pattern is fine; no action required for this audit).

### Faux-bold gap (most actionable finding)

The most actionable finding from this audit is NOT the 300 weight (which is a clean drop). It is the 800 / 900 gap. The codebase asks the browser for `font-weight: 800` in 83 places (notably `.cl-page-title`, every editorial eyebrow, every `.cl-typeset-foot` link, every Tailwind community sidebar masthead, the GroupHeader/GroupCard masthead numerics, PolicySignals headers, ResearchView headers, MarketPage/OperationsPage section headers) and `font-weight: 900` in 1 place (`.cl-stat-number`). None of those weights are loaded. Browsers will faux-bold from 700, which produces visibly heavier-but-blurrier glyphs and slightly different metrics versus a true 800/900 Plus_Jakarta_Sans cut. If the editorial brand depends on those weights, ADD them to the weight array; if it does not, normalize the references down to 700.

## Recommendation summary

- DROP Plus_Jakarta_Sans 300 (operator decision, but no `src/` reference exists, so the bytes are pure waste).
- KEEP Plus_Jakarta_Sans 400, 500, 600, 700.
- KEEP Anton 400.
- DECIDE on 800 (83 references, none loaded, currently faux-bolded).
- DECIDE on 900 (1 reference, faux-bolded; cheapest fix is to change `.cl-stat-number` to `font-weight: 800` if 800 is added, or `700` if it is not).

If the operator drops 300 and does nothing else: net change is one fewer Plus_Jakarta_Sans WOFF2 file in the preload (~18 to 25 KB Brotli) and one fewer `@font-face` declaration in head. If the operator drops 300 AND adds 800: net change is roughly zero payload (one out, one in) but visual fidelity improves for 83 call sites. If the operator drops 300 AND migrates 800/900 references down to 700: net change is one WOFF2 removed plus one round of code edits across ~30 files, no font additions.

## Related

- [dashboard-payload-audit-2026-05-11](./dashboard-payload-audit-2026-05-11.md) — This audit's secondary observation questions the five Plus Jakarta Sans weights and a possible Roboto Mono misread; the font audit is the resolving…
- [cleanup-audit-2026-05-11](./cleanup-audit-2026-05-11.md) — Cleanup rules this doc ACTIVE and cited by layout.tsx as the source-of-truth for which font weights are bundled into the build
