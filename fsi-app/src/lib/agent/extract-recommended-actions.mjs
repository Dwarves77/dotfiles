import { extractSectionByHeading } from "./extract-sections.ts";

/** The seven concrete imperative verbs system-prompt.ts's labeling discipline names (line 182/490).
 * Ordered longest-first is unnecessary (word-boundary match), kept in the prompt's own order. */
export const CONCRETE_ACTION_VERBS = Object.freeze([
  "Assess",
  "Map",
  "Verify",
  "Commission",
  "Engage",
  "Negotiate",
  "Reconcile",
]);

/** Per-format "do now" section headings, cited above. Keyed by item_type (the live column), not by the
 * format name, since that is what a caller has on hand (an intelligence_items row). Format mapping
 * source: fsi-app/.claude/CLAUDE.md "AGENT ARCHITECTURE" table. */
export const DO_NOW_SECTIONS_BY_ITEM_TYPE = Object.freeze({
  regulation: ["Issues Requiring Immediate Action", "Operational System Requirements"],
  directive: ["Issues Requiring Immediate Action", "Operational System Requirements"],
  standard: ["Issues Requiring Immediate Action", "Operational System Requirements"],
  guidance: ["Issues Requiring Immediate Action", "Operational System Requirements"],
  framework: ["Issues Requiring Immediate Action", "Operational System Requirements"],
  technology: ["Time-to-Market, Procurement Window, and Action"],
  innovation: ["Time-to-Market, Procurement Window, and Action"],
  tool: ["Time-to-Market, Procurement Window, and Action"],
  market_signal: ["What the Workspace Should Do Now"],
  initiative: ["What the Workspace Should Do Now"],
  // No dedicated "do now" section named in system-prompt.ts for these two formats, see header.
  regional_data: [],
  research_finding: [],
});

// A legislative-act name immediately following "Commission" ("Commission Implementing Regulation
// (EU) 2016/480...", "Commission Delegated Regulation...", "Commission Decision..."). Verified live
// against item a0baaa13-4171-40e6-a1d9-efee06e9905c (2026-09-28). Case-sensitive on "Commission" itself
// (the verb form is always capitalised, sentence-initial) but tolerant of the act-name casing.
const LEGISLATIVE_CITATION_RE = /^Commission\s+(Implementing\s+|Delegated\s+)?(Regulation|Directive|Decision)\b/;

// "Commission" used as the INSTITUTION (the European Commission) acting as a sentence subject, not as
// the imperative verb ("Commission a review..."). Found live in this lane's own dry run (item
// 8c186db2-ca7c-4b92-8960-3337a4d01b09, 2026-09-28): "Commission is scheduled to submit a review..."
// was extracted as a false-positive action before this guard existed. Every genuine imperative use
// observed live ("Commission a review...", "Commission an internal review...") is immediately followed
// by an indefinite article; the institution-as-subject use is followed by a finite verb/auxiliary
// instead. Excluding on the auxiliary/finite-verb set (rather than requiring "a|an|the", which could
// wrongly reject an imperative object with no article, e.g. "Commission counsel review...") is the more
// conservative guard, it only removes a confirmed false-positive shape, never a hypothetical true one.
const COMMISSION_AS_INSTITUTION_RE =
  /^Commission\s+(is|was|are|were|will|shall|has|have|had|must|should|would|may|might|can|could|plans?|scheduled|submits?|adopts?|publishes?|proposes?|issued?|announced?)\b/i;

// The label markers system-prompt.ts's labeling discipline defines (line 30-31, 471-491): an action
// paragraph's OWN sentence ends where one of these begins. Matched case-sensitively on the asterisk
// form the contract specifies ("*Operational implication:*" etc.) since that is the only form observed
// live; a bare unlabelled continuation is left inside action_text (nothing in the contract marks that
// boundary any other way).
const LABEL_MARKER_RE = /\s*\*(Operational implication|Analytical inference|Industry interpretation|Legal Confirmation Required):\*/;

// Optional trailing "(N days)" / "(N day)" scope, e.g. "...ISO 14083:2023's common methodology (30 days)."
const TIMEFRAME_RE = /\((\d+)\s*days?\)\s*\.?\s*$/i;

// An explicit absolute due date stated inline ("by 30 June 2026", "before 1 January 2027", "no later
// than 15 March 2026"). Conservative on purpose: this is the ONLY case due_date is ever non-null,
// per CLAUDE.md rule 2, never derive a due_date by adding a timeframe to an assumed reference date.
const EXPLICIT_DUE_DATE_RE =
  /\b(?:by|before|no later than)\s+(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/i;

// An explicitly named owner, if a future contract revision ever adds one inline ("(Owner: Legal)").
// Not observed live as of 2026-09-28, kept so a future prompt change is picked up for free rather than
// requiring a second extractor revision.
const EXPLICIT_OWNER_RE = /\(Owner:\s*([^)]+)\)/i;

function toIsoDateOrNull(text) {
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Split a section's contentMarkdown into paragraphs the same way extract-sections.ts's own
 * splitFirstParagraphs does conceptually (blank-line separated), but over the FULL section body, not
 * just the first few, this module needs every action-shaped paragraph, not a preview. */
function splitParagraphs(contentMarkdown) {
  return contentMarkdown
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Strip a leading markdown bullet/number marker ("- ", "* ", "1. ", "12) ") so the verb-first check
 * looks at the actual first word, not the list syntax. */
function stripLeadingMarker(paragraph) {
  return paragraph.replace(/^(?:[-*]\s+|\d+[.)]\s+)/, "");
}

/**
 * Extract one structured action from a single paragraph, or null if the paragraph is not a "do now"
 * action (does not start with a concrete verb, or is the "Commission Implementing Regulation..."
 * legislative-citation false positive).
 * @param {string} paragraph
 * @param {string} sourceSection the heading this paragraph was found under
 * @returns {{action_text:string, verb:string, timeframe_days:number|null, owner:string|null, due_date:string|null, source_section:string}|null}
 */
export function extractActionFromParagraph(paragraph, sourceSection) {
  const stripped = stripLeadingMarker(paragraph);
  const verbMatch = new RegExp(`^(${CONCRETE_ACTION_VERBS.join("|")})\\b`).exec(stripped);
  if (!verbMatch) return null;
  if (LEGISLATIVE_CITATION_RE.test(stripped)) return null;
  if (COMMISSION_AS_INSTITUTION_RE.test(stripped)) return null;

  const labelSplit = LABEL_MARKER_RE.exec(stripped);
  const actionText = (labelSplit ? stripped.slice(0, labelSplit.index) : stripped).trim();
  if (actionText.length < 10) return null; // guards against a bare verb with nothing else (malformed prose)

  const timeframeMatch = TIMEFRAME_RE.exec(actionText);
  const dueDateMatch = EXPLICIT_DUE_DATE_RE.exec(actionText);
  const ownerMatch = EXPLICIT_OWNER_RE.exec(actionText);

  return {
    action_text: actionText,
    verb: verbMatch[1],
    timeframe_days: timeframeMatch ? Number.parseInt(timeframeMatch[1], 10) : null,
    owner: ownerMatch ? ownerMatch[1].trim() : null,
    due_date: dueDateMatch ? toIsoDateOrNull(dueDateMatch[1]) : null,
    source_section: sourceSection,
  };
}

/**
 * Extract every structured action from one item's full_brief, scoped to the "do now" sections its
 * item_type's format defines (see DO_NOW_SECTIONS_BY_ITEM_TYPE and this module's header for citations).
 * Pure, no I/O, no DB, no LLM.
 * @param {string|null|undefined} fullBrief
 * @param {string} itemType the intelligence_items.item_type value
 * @returns {Array<{action_text:string, verb:string, timeframe_days:number|null, owner:string|null, due_date:string|null, source_section:string}>}
 */
export function extractRecommendedActions(fullBrief, itemType) {
  if (!fullBrief) return [];
  const sections = DO_NOW_SECTIONS_BY_ITEM_TYPE[itemType] ?? [];
  const actions = [];
  for (const heading of sections) {
    const section = extractSectionByHeading(fullBrief, heading);
    if (!section || !section.contentMarkdown) continue;
    for (const paragraph of splitParagraphs(section.contentMarkdown)) {
      const action = extractActionFromParagraph(paragraph, section.heading);
      if (action) actions.push(action);
    }
  }
  return actions;
}
