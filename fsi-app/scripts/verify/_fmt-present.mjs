// Section-presence primitive: a required section is PRESENT if a heading line carries its NUMBER
// (tolerant of "## N.", "## Section N:", leading zeros) OR (for un-numbered briefs) its heading text
// matches spelling-tolerantly. Robust to the corpus's heterogeneous heading formats + type-word variance.
export const norm = (s) => (s || "").toLowerCase().replace(/iz/g, "is").replace(/[^a-z0-9]+/g, "");
export function sectionPresent(key, heading, headingAlts, fullBrief, normBrief) {
  const N = String(key);
  for (const ln of (fullBrief || "").split(/\r?\n/)) {
    if (!/^#{1,4}\s/.test(ln)) continue;                          // heading lines only
    const m = ln.replace(/^#{1,4}\s*/, "").replace(/^section\s+/i, "");
    const num = m.match(/^0*(\d+)\s*[:.)\-]/);                    // "2. ", "2: ", "2) ", "2 - "
    if (num && num[1] === N) return true;
  }
  const heads = [heading, ...(headingAlts || [])].map(norm).filter(Boolean);
  return heads.some((h) => normBrief.includes(h) || normBrief.includes(h.slice(0, 22)));
}
