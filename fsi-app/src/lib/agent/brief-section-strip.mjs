const SOURCES_LEAD_TITLE_RE =
  /^(?:sources\b|new sources\b|sources identified\b|additional sources\b|corroborating sources\b|source notes\b)/;

/** Normalize a raw heading title: strip a leading numeric prefix, bold markers, trim, lowercase. */
function normalizeTitle(raw) {
  return String(raw ?? "")
    .replace(/^\s*\d+[.)]\s*/, "")
    .replace(/\*\*/g, "")
    .trim()
    .toLowerCase();
}

/** True when a raw heading title is a sources-lead artifact (Sources / New Sources Identified /
 *  Sources Identified / Additional Sources / Corroborating Sources / Source Notes; numbered or
 *  bold variants included). */
export function isSourcesLeadTitle(rawTitle) {
  return SOURCES_LEAD_TITLE_RE.test(normalizeTitle(rawTitle));
}

/** Remove the Sources section and every trailing pipeline-artifact section from brief markdown.
 *  Keeps all lines up to (but not including) the first H1/H2 whose title is a sources-lead;
 *  drops that heading and everything after it to EOF (fail-closed tail-drop). If no sources-lead
 *  heading is present, the markdown is returned unchanged (minus trailing whitespace). */
export function stripSourcesSection(md) {
  const lines = String(md ?? "").split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const h = line.match(/^(#{1,2})\s+(.*)$/);
    if (h && SOURCES_LEAD_TITLE_RE.test(normalizeTitle(h[2]))) {
      break; // tail-drop: Sources + every trailing artifact, regardless of its header text
    }
    out.push(line);
  }
  return out.join("\n").trimEnd();
}
