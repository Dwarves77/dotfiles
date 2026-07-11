// brief-section-strip — remove the Sources section AND all trailing pipeline-artifact
// sections from customer brief markdown, FAIL-CLOSED.
//
// Context. The regulatory_fact_document spec (src/lib/agent/formats/regulation.ts) places
// "Sources" as §15 — the LAST customer section. Everything a customer should read lives at
// or before §14 "Confirmed Regulatory Timeline". After §15 the pipeline appends artifact
// tables that are NOT customer content:
//   - "## Sources"                — rendered STRUCTURALLY on the Sources tab, not as raw body
//   - "## New Sources Identified" — corroborator / registry-growth leads (header
//     "Source Name | URL | Tier estimate"), present in ~97/103 reg-family briefs
//   - and any future sibling ("Corroborating Sources", "Source Notes", …)
//
// F-1 escape (2026-07-11). The raw-markdown "Full regulatory analysis" accordion renders the
// brief body via <IntelligenceBrief stripSources />. The prior strip matched only /^sources\b/,
// so "## New Sources Identified" rendered VERBATIM — a fabricated-placeholder escape #267 never
// closed (that gate covered the PARSED structured entries + the primary Sources section, not
// this UNPARSED render path).
//
// Design: FAIL-CLOSED by structure, not by pattern. A broadened strip-regex fails OPEN on the
// next unanticipated header ("Corroborating Sources", "Source Notes"). Instead, once the first
// sources-lead heading (H1/H2) is reached, we drop it AND everything after it to EOF. Because
// §15 Sources is guaranteed present (conditional:false) and terminal in the reg spec, this
// removes every trailing artifact REGARDLESS of its title — the artifact does not need to be
// recognized to be dropped. Content before Sources (incl. the dynamic per-reg doc-title H1) is
// never touched, so there is no silent loss of legitimate customer content.
//
// Scope note: stripSources is applied only on the regulation-detail accordion, whose briefs
// follow the regulatory_fact_document spec (Sources = terminal section). Named residual for the
// placeholder-literal backstop (separate GUARD dispatch): a sources-artifact emitted BEFORE §15
// Sources, or legitimate content emitted AFTER Sources, would be mis-handled by tail-drop; the
// placeholder-literal fixture is the backstop for that residual.

// Title-lead patterns of the sources-artifact class. Applied to the heading title AFTER
// numeric-prefix strip (`## 15. Sources` -> `sources`), bold strip (`**…**`), trim, lowercase.
// Anchored at start; `\b` keeps "sourcing"/"resourceful" from matching. This detects only WHERE
// the trailing artifact block begins — the fail-closed drop-to-EOF does the rest.
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
