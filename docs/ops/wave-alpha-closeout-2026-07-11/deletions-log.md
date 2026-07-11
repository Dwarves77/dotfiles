# Wave-α Track E — Dead-Weight Erase: Deletions Log (2026-07-11)

Agent A5. Branch `wave-alpha/track-e-dead-weight`, base master `71bcbd4`.
Rule enforced per dispatch: every deletion carries (1) a FRESH zero-importer proof (repo-wide grep
for module name/basename incl. dynamic-import string paths, run in THIS session against THIS tree),
(2) the register row it discharges. Anything with a live importer or ambiguity is HELD, not deleted.
Migrations here are AUTHORED, NOT APPLIED (numbers 180+ per dispatch; 164–179 reserved for Track B).

Proof-method note: "grep 0" below means a repo-wide grep over `fsi-app/` (src, scripts, .discipline,
supabase, configs) for the basename and its import-path forms returned zero hits outside the deleted
file(s) themselves. Docs-only mentions are noted where present (docs do not import code).

## e1 — domains/* trio (fabrication risk) — DELETED

| Path | Lines | Proof | Register row |
|---|---|---|---|
| fsi-app/src/components/domains/RegionalIntelligence.tsx | 831 | grep `RegionalIntelligence\|components/domains` → 0 outside trio | CODE-4a F-03/F-05; master P3 |
| fsi-app/src/components/domains/TechnologyTracker.tsx | 430 | same sweep → 0 | CODE-4a F-03/F-05 |
| fsi-app/src/components/domains/FacilityOptimization.tsx | 253 | same sweep → 0 | CODE-4a F-03/F-05 |

Subtotal: 3 files / 1,514 lines.

<!-- Sections below appended per wave -->
