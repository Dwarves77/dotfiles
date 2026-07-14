// @ts-check
// ADMIN HUMAN-GATE PHRASE SCAN — pure core (Unit 0c Part 4, operator ruling 2026-07-13). A SOFT review signal:
// the intake path has NO human-approval gate (RD-20 — the machine gates ARE the approval), so admin UI copy must
// state what the MACHINE did and what's VISIBLE ("staged / minted / rejected + why"), never what a human must
// DECIDE. This scan flags human-gate framing in admin JSX string literals. It is SOFT (a review signal, never a
// hard build gate) because a phrase is a heuristic, not a correctness invariant — the census enforcement
// assessment ruled it advisory.
//
// RULED ALLOWLIST (legitimate human controls — these are NOT intake human-gates):
//   - emergency-stop / pause release (the operator's stop-flag control is a genuine human lever)
//   - SC-3 tier override (the operator's per-source tier_override is a genuine human judgment)
//   - Community controls (community-is-human-space — moderation / promote-to-public are legitimately human)
// A line carrying an allowlist marker is exempt even if it matches a forbidden phrase.

/** Human-gate framing forbidden in admin intake copy (the machine gates, no human approves/rejects/reviews). */
export const FORBIDDEN = [
  /needs? a human (decision|pass|review)/i,
  /awaiting (approval|review|promot\w*|publish)/i,
  /\bdraft.?staging\b/i,
  /\bpublish-decision\b/i,
  /(approve|promote)\s*(or|\/)\s*reject/i,
  /requires?\s+(your\s+)?approval/i,
  /pending\s+your\s+(approval|review)/i,
  /awaiting\s+your\b/i,
];

/** Allowlist markers — a line with any of these is a legitimate human control, not an intake human-gate. */
export const ALLOWLIST = [
  /emergency.?stop|global_processing_paused|scrape.?hold|\bpause\b|\bresume\b/i, // emergency-stop release
  /tier.?override|\bSC-3\b|override_reason/i,                                    // SC-3 tier override
  /\bcommunity\b|promote.?to.?public|moderat/i,                                  // community-is-human-space
];

/** Is a line exempt (carries an allowlist marker)? Pure. @param {string} line */
export function isAllowlisted(line) {
  return ALLOWLIST.some((re) => re.test(line));
}

/**
 * Scan file contents for forbidden human-gate phrases outside the allowlist. Pure — no I/O.
 * @param {Array<{ path: string, text: string }>} files
 * @returns {Array<{ path: string, line: number, phrase: string, text: string }>}
 */
export function scanAdminPhrases(files) {
  const hits = [];
  for (const f of files || []) {
    const lines = String(f?.text ?? "").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isAllowlisted(line)) continue; // ruled human control — exempt
      for (const re of FORBIDDEN) {
        const m = re.exec(line);
        if (m) { hits.push({ path: f.path, line: i + 1, phrase: m[0], text: line.trim().slice(0, 120) }); break; }
      }
    }
  }
  return hits;
}
