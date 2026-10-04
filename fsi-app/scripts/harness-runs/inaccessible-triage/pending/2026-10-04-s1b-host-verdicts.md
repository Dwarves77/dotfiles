## Change

Lane S1-B (s1b-host-verdicts), 2026-10-04: `src/lib/sources/host-authority.ts` (a governing file of this
family) gained an additive block: the `HOST_CLASS_TIER` class table export, `isKnownHostClass`,
`verdictPlacementForHost` and `classTierForHostWithVerdicts`, so a committed host-verdict batch can place a
host the built-in rules leave unplaced. No existing function, regex, allowlist or tier in the file changed;
`classTierForHost`, `classTierForHostAcrossNames` and `decidePoolHostRegistration` behave exactly as before.

## Planned run

No run is owed. The edit only adds exports no code path of this family calls, so there is nothing a
run artifact would capture beyond what the existing test suite already proves. Delete this file whenever the
next real run of this family lands.
