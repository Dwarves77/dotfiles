// @ts-check

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
  /\bno human\b|\bretired\b|there is no|not a gate|visibility.?only|may-act/i,   // NEGATION / retirement — the gate is DENIED, not asserted
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
