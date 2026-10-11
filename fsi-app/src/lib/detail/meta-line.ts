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
