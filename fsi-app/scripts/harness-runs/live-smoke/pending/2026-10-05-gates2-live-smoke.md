## Change

Lane gates2-live-smoke (2026-10-05) registered this family: the workflow `.github/workflows/live-smoke.yml`, its
artifact emitter `scripts/turns/emit-live-smoke-artifact.mjs`, and the assertion library and runner under
`.discipline/rendering/live/`, proven on fixtures only (a loopback fixture site in the rendering guard, no real
site signed in to).

## Planned run

The coordinator's first dispatch of `live-smoke.yml` once `LIVE_SMOKE_EMAIL` and `LIVE_SMOKE_PASSWORD` exist, which
lands `live-smoke-run-001`. Delete this file in the change that lands that run.
