## 1. `community-topics-seed` - RETIRED (Lane REVIEW-WIRE, 2026-09-04)

**This step no longer exists.** `fsi-app/scripts/maintenance/community-topics-seed.mjs`,
`fsi-app/scripts/seed/community-topics-seed.mjs`, and both files' tests were deleted, and the step was
removed from `.github/workflows/maintenance.yml`'s `step` choice list and step block, on the operator's
explicit ruling (2026-09-04, verbatim): *"community should not be populated with rooms for every topic;
people start rooms, rooms don't already exist; regions exist."*

**Why this was the right call, not just an instruction followed**:
`docs/audits/wiring-audit-2026-09-04/A2-surfaces.md`'s "Community - what actually seeds today" section
[CONFIRMED, live SQL, 2026-09-04] found this mechanism doubly wrong, independent of the ruling: (1) the
7-topic taxonomy it would have created is EXACTLY the pre-seeded "rooms for every topic" pattern the
ruling forbids, and (2) it was structurally incapable of being a shared room even if dispatched -
`community_topics` (migration 031) is per-user/private by RLS (`owner_user_id = auth.uid()` on every
policy), so the seeder's own single-owner write would have been invisible to every user but the resolved
owner. The 7 REGIONAL rooms (`community_groups`, seeded 2026-07-07 by a different script,
`scripts/seed-community-regional-rooms.mjs` - DELETED lane W71-C, 2026-09-05, F25 module-liveness: the
seeding already ran, the rows exist, and the script had zero non-test importers and no dispatch; the
record of the run lives in git history, pre-dating this audit window) are unaffected and match the
ruling's own "regions exist" half - nothing about that seeding is retired here.

**If a future session is tempted to re-add a topic-taxonomy seeder**: read
`docs/audits/wiring-audit-2026-09-04/A2-surfaces.md` first - it documents both the ruling and the
structural RLS defect this same idea would repeat.

---

