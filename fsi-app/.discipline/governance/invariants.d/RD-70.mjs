// RD-70: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-70',
    skill: 'remediation-discipline',
    section: 'Section 4 - category 45: one home per concept, and the count of copied code can only fall',
    text: 'An external host that code builds URLs for has exactly one home module. A host in HOST_HOMES may appear only in its home (a second file fails regardless of any count); the number of other hosts with more than one home equals the committed ceiling in F46-external-host-home.mjs, above it a host gained a home, below it the ceiling is re-seeded down in the commit that consolidates the host.',
    anchor: 'An external host that code builds URLs for MUST name exactly one home module',
    enforcedBy: [
      'fitness:F46',
      'selftest:fsi-app/.discipline/fitness/functions/F46-external-host-home.test.mjs',
    ],
    residual: 'F46 attributes URL LITERALS to hosts. A URL assembled from a host held in a variable or an env value, or a host reached through a client library with no literal in scope, is not attributed; the ratchet is seeded at 7 multi-home hosts (eur-lex, federalregister, ecfr, anthropic, ec.europa.eu, legislation.gov.uk, linkedin) and green means none gained a home, not that those seven are consolidated. Reference files are a named list; adding a file to it is a review decision, not a wildcard.',
  };
