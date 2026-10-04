## Change

Lane S1-D, 2026-10-04: `src/lib/sources/host-authority.ts` (a `state-cost` governing file) now reads every
built-in rule's tier from `HOST_CLASS_TIER` (values unchanged, pinned by host-authority-class-tier.test.mjs)
and adds DOI and handle resolvers (doi.org, dx.doi.org, hdl.handle.net) to the never-register class. No
state-cost logic, gate or behaviour for any host it previously rated changed.

## Planned run

No run is owed: the tier values and every previously classified host are unchanged, so a state-cost run would
capture nothing new. Delete this file whenever the next real state-cost run lands.
