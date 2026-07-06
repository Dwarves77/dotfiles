# Caro's Ledge UI Redesign — Design Source of Truth

This folder holds the approved UI package for the Caro's Ledge redesign. The files are committed **verbatim** as the design record. Do not edit them; they are the reference the redesign builds against.

## Contents

- `HANDOFF - Claude Code Prompt.md` — the build brief (tokens, patterns, per-page notes, fidelity rules).
- `Pages - 01 … 11 *.dc.html` — the 11 page mocks (visual spec).
- `Site Redesign Breakdown.dc.html` — cross-page IA / structure overview.
- `support.js` — the `.dc.html` mock rendering runtime.
- `DESIGN-DEVIATIONS.md` — running log where template agents record deviations as proposals for Jason.

## How to use these files

- **The mocks are the visual spec.** Lift exact inline `hex` / `px` / weights from the mock markup rather than approximating (HANDOFF §8.1). Layout, hierarchy, spacing, color, and interaction patterns: the mock wins.
- **`support.js` and the `.dc.html` runtime are MOCK RENDERING PLUMBING ONLY.** They exist to render the static mocks for review. Never import them, never execute them, never copy them into production code. Production is the real Next.js app; these files never ship.
- **The Map mock's schematic SVG is a placeholder.** Keep the existing production map component (real basemap, zoom, fly-to). Do not copy the mock's schematic SVG. Adopt only the surrounding UI (filter bar, marker encoding, focus behavior, rail, jurisdiction register band) per HANDOFF §Map.
- **No invented data.** Where a field has no sourced value, render the honest-pending pattern — never a placeholder number or inherited average (HANDOFF §4).
- **Log deviations, don't bury them.** Any departure from the mock goes in `DESIGN-DEVIATIONS.md` as a proposal for Jason, never a unilateral decision.
