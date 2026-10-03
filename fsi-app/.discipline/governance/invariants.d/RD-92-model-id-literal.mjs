// RD-92-model-id-literal: new invariant, lane MODEL-IDS (2026-10-02). Id picked as the next free RD
// number (RD-91 was the highest at this lane's push time); no coordinator-assigned id was named in the
// dispatch for this fitness function, since F69 was added as a same-session class fix after the
// conversion work, the same "pick the next free number, rename on request if it collides" posture
// RD-91's own header already used. Rename on request if it collides.

export const invariant = {
  id: 'RD-92-model-id-literal',
  skill: 'remediation-discipline',
  section: 'Section 4 - category 45: one home per concept, and the count of copied code can only fall (a gate measures the class, a reminder does not)',
  text:
    'EXTENDS category 45\'s one-home rule from duplicated CODE to a duplicated STRING CONSTANT: an '
    + 'Anthropic model-id literal is not duplicated logic, so F45 (duplicate-code) and F46 (external-'
    + 'host-home) never caught it, but it is the same drift class a repo-wide grep found fourteen times '
    + 'over. [CONFIRMED, lane MODEL-IDS, 2026-10-02, by git grep]: following lane L8\'s extraction of '
    + 'HAIKU_MODEL into src/lib/llm/model-ids.mjs (which named the remaining drift in its own header '
    + 'comment), a repo-wide grep for the Haiku and Sonnet literals found fourteen independent '
    + 'hand-typed copies across haiku-classify.ts, first-fetch-classify.ts, verification.ts, '
    + 'recommend-source-tier.ts, canonical-pipeline.ts, spend-client.ts (x3), two-pass-generate.mjs, '
    + 'generation-config.ts, three admin classification routes, spot-check/recurring/route.ts, '
    + 'ask/route.ts (x2), and two review-card display fallbacks, for two string constants.',
  anchor: 'Section 4 - category 45: one home per concept, and the count of copied code can only fall (a gate measures the class, a reminder does not)',
  enforcedBy: [
    'fitness:F69',
    'selftest:fsi-app/.discipline/fitness/functions/F69-model-id-literal.test.mjs',
    'selftest:fsi-app/src/lib/llm/metered-gate.test.mjs',
  ],
  residual:
    'F69 is a lexical scanner (a quoted-literal regex over file content), the same posture F15/F45/F46 '
    + 'already use; it catches a NEW hardcoded copy of the literal string, it does not catch a caller '
    + 'that derives an equivalent model id by some other construction (string concatenation, a base64 '
    + 'or rot13 obfuscation, a value read from an unrelated config file that happens to carry the same '
    + 'string). metered-gate.mjs\'s own security allowlist is a DELIBERATE, named exception (it must '
    + 'never import the shared constants, so a widening there cannot silently follow a change to '
    + 'model-ids.mjs); metered-gate.test.mjs\'s two agreement tests are the mechanical check that the '
    + 'allowlist and the shared constants have not drifted apart, not a replacement for F69 itself.',
};
