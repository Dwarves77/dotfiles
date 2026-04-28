// Validates a regenerated brief's top-level sections against the SKILL.md
// format spec for the chosen format_type.
//
// Replaces the naïve `match(/^#{1,3}\s/gm).length` count used during the
// pilot, which over-counted by including h2/h3 sub-headings (a regulatory
// fact document with 14 main sections and 13 sub-clauses scored 27).
//
// The validator extracts h1-level headings, normalises them, and bucketed
// them against the format's expected section names from the SKILL.md spec:
//
//   present       — heading matches an expected spec section name (substring
//                   match against the canonical names below)
//   missing       — expected spec section has no matching heading. For
//                   conditional sections this is honest omission (per the
//                   integrity rule). For required sections it's a contract gap.
//   over          — heading is present but doesn't match any spec name
//                   (sub-clauses promoted to h1 by mistake, or extra
//                   sections the agent added)

const SPECS: Record<string, { sections: { name: string; required: boolean }[] }> = {
  regulatory_fact_document: {
    sections: [
      { name: "Purpose and Scope of This Document",                                    required: true },
      { name: "What This Regulation Is and Why It Applies",                            required: true },
      { name: "Issues Requiring Immediate Action",                                     required: true },
      { name: "How the Workspace Sits in the Compliance Chain",                        required: true },
      { name: "Authoritative Guidance Document Analysis",                              required: false },
      { name: "Anticipated Authoritative Guidance and Pending Regulatory Events",      required: false },
      { name: "Threshold Questions",                                                   required: false },
      { name: "Substantive Requirements",                                              required: true },
      { name: "Product-Specific Compliance Status",                                    required: false },
      { name: "Registration and Reporting Obligations",                                required: true },
      { name: "Operational System Requirements",                                       required: true },
      { name: "Exemptions and Edge Cases",                                             required: false },
      { name: "Adjacent Industry Research and Alternatives",                           required: false },
      { name: "Confirmed Regulatory Timeline",                                         required: true },
      { name: "Sources",                                                               required: true },
    ],
  },
  technology_profile: {
    sections: [
      { name: "What's Being Tested or Deployed and By Whom",     required: true },
      { name: "What This Tells Us About Industry Trajectory",    required: true },
      { name: "Supplier Access and Procurement Reality",         required: true },
      { name: "Operational Fit by Transport Mode and Cargo Vertical", required: true },
      { name: "Competitive Positioning Implications",             required: true },
      { name: "Conversational and Strategic Talking Points",     required: true },
      { name: "Time-to-Market, Procurement Window, and Action",  required: true },
      { name: "Sources",                                          required: true },
    ],
  },
  operations_profile: {
    sections: [
      { name: "Operational Cost Baseline for the Region",   required: true },
      { name: "Feasibility of Specific Operational Choices", required: true },
      { name: "Cost Comparison Against Alternatives",       required: true },
      { name: "Cross-Regional Strategic Implications",      required: true },
      { name: "Competitive Positioning in the Region",      required: true },
      { name: "Client Conversation Talking Points",         required: true },
      { name: "Pending Changes That Shift the Calculus",    required: true },
      { name: "Sources",                                     required: true },
    ],
  },
  market_signal_brief: {
    sections: [
      { name: "What's Moving and What Triggered It",                       required: true },
      { name: "Who's Driving It and What They Want",                       required: true },
      { name: "Expected Trajectory and Conversion Triggers",               required: true },
      { name: "Operational and Cost Implications If It Materializes",     required: true },
      { name: "Competitive Implications",                                  required: true },
      { name: "Client Conversation Talking Points",                        required: true },
      { name: "What the Workspace Should Do Now",                          required: true },
      { name: "Sources",                                                    required: true },
    ],
  },
  research_summary: {
    sections: [
      { name: "What the Research Found",                                                required: true },
      { name: "Why This Finding Matters Operationally and Commercially",                required: true },
      { name: "What the Finding Changes for Strategy, Claims, or Decisions",            required: true },
      { name: "Client Conversation Talking Points and Public Position",                 required: true },
      { name: "What the Finding Does Not Resolve",                                      required: true },
      { name: "Sources",                                                                 required: true },
    ],
  },
};

// Extra accepted section names the agent commonly emits that aren't in the
// strict spec but are clearly aligned with it. These don't count as "over".
const ALIASES: Record<string, string[]> = {
  "Sources": ["Sources and Citations", "Source List", "References"],
  "Issues Requiring Immediate Action": ["Immediate Action Items"],
  "What's Being Tested or Deployed and By Whom": ["What is Being Tested or Deployed", "Operator-Level Activity"],
  "New Sources Identified": ["New Sources Identified"], // citation extraction tail; not in spec but accepted
};

// Always-accepted ad-hoc headings that the agent emits as boilerplate.
const ACCEPTED_EXTRA: string[] = [
  "New Sources Identified",
];

export interface SectionAuditResult {
  format_type: string;
  expected_count: number;
  expected_required_count: number;
  h1_emitted: string[];
  present: string[];
  missing_required: string[];
  missing_conditional: string[];
  over: string[];
  score: { present_required: number; total_required: number; pct: number };
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function sectionMatches(heading: string, specName: string): boolean {
  const h = normalise(heading);
  const n = normalise(specName);
  if (h === n) return true;
  // Substring either direction — allows the agent to add prefixes like
  // "Section 1: Purpose and Scope" while still matching "Purpose and Scope".
  if (h.includes(n) || n.includes(h)) return true;
  // Try aliases
  for (const [canonical, aliases] of Object.entries(ALIASES)) {
    if (normalise(canonical) === n) {
      for (const a of aliases) {
        const an = normalise(a);
        if (h === an || h.includes(an) || an.includes(h)) return true;
      }
    }
  }
  return false;
}

export function auditSections(body: string, formatType: string): SectionAuditResult {
  const spec = SPECS[formatType];
  if (!spec) {
    return {
      format_type: formatType,
      expected_count: 0,
      expected_required_count: 0,
      h1_emitted: [],
      present: [],
      missing_required: [],
      missing_conditional: [],
      over: [],
      score: { present_required: 0, total_required: 0, pct: 0 },
    };
  }

  // Extract h1 headings only. Strip any "Section N:" or "N." prefixes that
  // the agent commonly emits.
  const h1s: string[] = [];
  for (const m of body.matchAll(/^#\s+(.+?)\s*$/gm)) {
    let h = m[1].trim();
    h = h.replace(/^Section\s+\d+\s*[:\-—.]\s*/i, "");
    h = h.replace(/^\d+[\s.):]\s*/, "");
    h = h.replace(/\s*\([^)]*\)\s*$/, ""); // drop trailing parenthetical "(conditional)"
    h1s.push(h);
  }

  const present: string[] = [];
  const missingRequired: string[] = [];
  const missingConditional: string[] = [];

  for (const sec of spec.sections) {
    const hit = h1s.find((h) => sectionMatches(h, sec.name));
    if (hit) {
      present.push(sec.name);
    } else if (sec.required) {
      missingRequired.push(sec.name);
    } else {
      missingConditional.push(sec.name);
    }
  }

  // Anything in h1s that didn't match a spec section name (or accepted extra)
  const matchedHeadings = new Set<string>();
  for (const sec of spec.sections) {
    const hit = h1s.find((h) => sectionMatches(h, sec.name));
    if (hit) matchedHeadings.add(hit);
  }
  for (const extra of ACCEPTED_EXTRA) {
    const hit = h1s.find((h) => sectionMatches(h, extra));
    if (hit) matchedHeadings.add(hit);
  }
  const over = h1s.filter((h) => !matchedHeadings.has(h));

  const totalRequired = spec.sections.filter((s) => s.required).length;
  const presentRequired = spec.sections.filter((s) => s.required && present.includes(s.name)).length;

  return {
    format_type: formatType,
    expected_count: spec.sections.length,
    expected_required_count: totalRequired,
    h1_emitted: h1s,
    present,
    missing_required: missingRequired,
    missing_conditional: missingConditional,
    over,
    score: {
      present_required: presentRequired,
      total_required: totalRequired,
      pct: Math.round((presentRequired / totalRequired) * 100),
    },
  };
}
