// DOCTRINE-CONTRADICTION CHECK (meta-gate extension, 2026-07-12). Kills the human-gate-contradiction class:
// a doctrine clause that asserts a HUMAN GATE (a human must approve/review/confirm before the machine
// proceeds) in intake/triage/promotion/demotion/disposition contradicts no-human-finish-of-intake (RD-20) and
// must NOT sit uncited. Any GATE-verb hit across the committed doctrine surface that carries neither a
// register/ADR citation (retained-with-reason) nor a rewrite-to-visibility FAILS the meta-gate.
//
// LOW-FALSE-POSITIVE BY CONSTRUCTION (operator sharpening 2026-07-12, the RLS-parity discipline): the patterns
// distinguish GATE VERBS (approve / requires review / pending human / awaits operator) from VISIBILITY VERBS
// (surfaces to / visible in / shown on the trail / single-pane operator review). Visibility is PRESERVED by
// no-human-finish ("admin gets visibility"), so a DP-1 single-pane-review line or a "surface to the … queue"
// line is NOT a gate and is never flagged. The check catches the gate class and ignores the visibility class.
//
// SELF-INFLICTED GATE (operator ruling 2026-07-12): a clause whose closer is "operator re-confirms a ruling
// already given" is a self-inflicted gate — a ruled decision does not return to the board as blocked. Caught
// by SELF_GATE_RE so it can never be codified into doctrine.

import { readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// SKILL-SLIM-1 (2026-10-08): a governing skill's SKILL.md is a short core; the sections moved out of it live
// verbatim in references/*.md beside it. Those files are doctrine exactly as the sections were before the move,
// so they are swept with the core. Derived from the tree (never a hand list), so a new reference file joins by
// construction.
const SKILLS_DIR = "fsi-app/.claude/skills";
function skillReferenceFiles() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", SKILLS_DIR);
  const out = [];
  let skills = [];
  try { skills = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort(); } catch { return out; }
  for (const s of skills) {
    let names = [];
    try { names = readdirSync(resolve(root, s, "references")).filter((n) => n.endsWith(".md")).sort(); } catch { continue; }
    for (const n of names) out.push(SKILLS_DIR + "/" + s + "/references/" + n);
  }
  return out;
}

// The COMMITTED doctrine surface (binding doctrine only; transient docs/ops session logs are swept by hand, not
// mechanically, to stay low-FP). Repo-relative.
export const DOCTRINE_FILES = [
  "CLAUDE.md",
  "fsi-app/.claude/CLAUDE.md",
  "fsi-app/.claude/skills/analysis-construction-spec/SKILL.md",
  "fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md",
  "fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md",
  "fsi-app/.claude/skills/remediation-discipline/SKILL.md",
  "fsi-app/.claude/skills/source-credibility-model/SKILL.md",
  "fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md",
  "fsi-app/.discipline/governance/doctrine-register.mjs",
  ...skillReferenceFiles(),
];

// GATE VERBS — a human must ACT before the machine proceeds. Requirement/blocking forms only.
export const GATE_RE = /\b(requires?\s+(a\s+)?human[-\s](review|approval|sign-?off|confirmation)|human[-\s](review|approval|sign-?off|tick)\b(?![-\s]*(queue|surface))|pending\s+human|awaits?\s+(the\s+)?operator\b|awaiting\s+(operator\s+)?(review|approval|sign-?off)|operator\s+(approval|sign-?off|must\s+approve)|human-in-the-loop|manual\s+approval|human\s+must\s+(approve|review|confirm)|human\s+finish\b|operator-as-finish|requires?\s+operator\s+(review|approval)|\+\s*human\s+(review|approval))\b/i;

// SELF-INFLICTED GATE — a closer of "operator re-confirms a ruling already given".
const SELF_GATE_RE = /(operator|human|jason)\s+re-?confirm|re-?confirm(s|ation|ed)?\s+(of\s+)?(a\s+)?(prior\s+|already[-\s]given\s+)?(ruling|decision)|operator\s+re-?approv|re-?park(ed|s)?\s+(on|to)\s+(the\s+)?(operator|jason|desk)/i;

// EXEMPTIONS. A gate-shaped line is NOT a violation when it is:
//  - NEGATED (the anti-pattern statement: "no human-approval gate", "not parked for human review"),
const NEGATION_RE = /\b(no|not|never|without|nor|no longer)\b[^.]{0,60}?\b(human|operator|manual|review|approval|gate|finish)\b|\b(human|operator|manual)\b[^.]{0,25}?\b(no longer|is not|are not|never)\b/i;
//  - VISIBILITY (surface/visible/shown/single-pane — preserved by no-human-finish),
export const VISIBILITY_RE = /single-pane\s+operator\s+review|operator\s+visibility|admin\s+gets?\s+visibility|surfaces?\s+to|visible\s+in\b|shown\s+on\s+the\s+trail|operator\s+sees|visibility\s+queue|operator\s+gets?\s+visibility|for\s+visibility|via\s+the\s+trail/i;
//  - CITED (carries a register/ADR entry that classifies it — retained-with-reason or superseded-rewritten).
const CITATION_RE = /\b(RD-\d+|SF-\d+|SC-\d+|EP-\d+|PI-\d+|ADR-\d+|no-human-finish-of-intake|RETAINED:|SUPERSEDED:|register:)/i;

const isComment = (line) => { const t = line.trimStart(); return t.startsWith("//") || t.startsWith("*"); };

/**
 * Scan the doctrine surface for uncited human-gate clauses.
 * @param {string[]} files repo-relative doctrine files
 * @param {(f:string)=>(string|null)} readFile returns file content or null
 * @returns {{file:string,line:number,text:string,kind:string}[]}
 */
export function scanDoctrineContradictions(files, readFile) {
  const violations = [];
  for (const f of files) {
    const content = readFile(f);
    if (content == null) continue; // a missing doctrine file is a separate integrity concern, not this check's
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // doctrine-register.mjs is CODE with doctrine STRINGS; only scan its string content, skip code comments.
      if (f.endsWith(".mjs") && isComment(line)) continue;
      const gate = GATE_RE.test(line);
      const self = SELF_GATE_RE.test(line);
      if (!gate && !self) continue;
      if (NEGATION_RE.test(line) || VISIBILITY_RE.test(line) || CITATION_RE.test(line)) continue;
      violations.push({ file: f, line: i + 1, text: line.trim().slice(0, 160), kind: self ? "self-inflicted-gate" : "human-gate" });
    }
  }
  return violations;
}
