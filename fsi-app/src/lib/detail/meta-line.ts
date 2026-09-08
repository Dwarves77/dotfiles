/**
 * joinMetaSegments — THE one way a detail page's sub-line is assembled.
 *
 * COUNTS-61 (production defect, click-through audit 2026-09-08, /market/[id]): the sub-line printed
 * the source name twice —
 *   "Sustainable Packaging Coalition (a project of GreenBlue) ·
 *    Sustainable Packaging Coalition (a project of GreenBlue) · published Sep 2 2026"
 *
 * ROOT CAUSE [CONFIRMED by reading src/app/market/[slug]/page.tsx]: `publisher` was used TWICE for
 * the same line — once inside `groupLabel` ("Market / <publisher>") and once as the first element of
 * `deck` — and `MarketSignalDetailSurface` joins `[crumbGroup, deck, ...]` with " · ". One value,
 * two slots, neither producer aware of the other.
 *
 * All four detail surfaces compose this line the same way, from segments computed by different code
 * in different files, so patching the market page's own `deck` would leave the class alive on the
 * other three. This function is the class fix: it drops any segment already present in the line,
 * compared case- and whitespace-insensitively, and drops empties. It cannot invent, reorder or
 * reword a segment — the first occurrence is what survives, so the line reads exactly as its author
 * intended minus the repetition.
 */

/** Normalised form used only for the duplicate comparison; never printed. */
function key(segment: string): string {
  return segment.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The parts a segment is already made of. A breadcrumb segment is itself a composite
 * ("Market / Sustainable Packaging Coalition"), and the live defect was a LATER segment repeating
 * one of an earlier segment's parts rather than the whole of it. Splitting on the two separators
 * these lines are built from (" / " and " · ") makes that repetition visible.
 *
 * WHOLE parts only, never substrings: "Market" must not suppress a later "Market signals", and a
 * publisher whose name merely contains an earlier word is left alone.
 */
function atomsOf(segment: string): string[] {
  return [key(segment), ...segment.split(/\s+[/·]\s+/).map(key)].filter(Boolean);
}

/**
 * Join a detail sub-line's segments with " · ", dropping empty segments and any segment that
 * repeats something already in the line — either a whole earlier segment or one of its parts.
 * First occurrence wins, so the line keeps its author's order and wording minus the repetition.
 */
export function joinMetaSegments(segments: Array<string | null | undefined | false>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of segments) {
    if (!raw) continue;
    const segment = String(raw).trim();
    if (!segment) continue;
    if (seen.has(key(segment))) continue;
    out.push(segment);
    for (const atom of atomsOf(segment)) seen.add(atom);
  }
  return out.join(" · ");
}

/**
 * Split a pre-joined sub-line back into its segments. The pages compute a `deck` string by joining
 * its parts with " · " and hand the surface one string, so the surface has to split it again to
 * compare part against part. Lossless: " · " is the separator both sides already use.
 */
export function splitMetaSegments(line: string | null | undefined): string[] {
  if (!line) return [];
  return line
    .split(" · ")
    .map((s) => s.trim())
    .filter(Boolean);
}
