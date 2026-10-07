## Change

Lane OPS-1 (2026-10-07) made `scripts/research/research-walker.mjs` announce its run kind. The dry fixture path now logs
"FIXTURE RUN: no live corpus; counts are fixture counts" and records `run_mode: fixture` (and the banner) in the run
artifact's config and metrics, so a green run cannot be read as a live walk. `config.mode` keeps its dry/apply meaning.
A run with `--live --holdings-needs` records `run_mode: live_search` instead.

## Planned run

The next dispatch of the research walker supersedes this file. Delete it in the same change that lands that run.
