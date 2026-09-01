// SKILL/PROMPT PARITY GATE (lane DOC, governing-skill parity, 2026-09-01).
//
// WHY THIS EXISTS. system-prompt.ts's header claims it is "Synced to ...SKILL.md (canonical)" — but
// nothing mechanically checked that claim. contract-version.test.mjs only binds the single
// `regeneration_skill_version` literal; it says nothing about the RULE TEXT or the FIELD CONTRACT
// enumeration. The two drifted: the skill's "Rules for All Output" sat at 14 rules while the prompt had
// advanced to 16 (claim-level provenance labeling + corpus-flywheel participation), and the skill's field
// enumeration still listed the original 13 fields under a stale "19-field contract" label while the
// prompt actually documents 20. This test closes that gap for the two specific contract surfaces that
// matter operationally: the numbered rules, and the field-name set.
//
// EXTRACTION ANCHORS (read these before touching either file's Rules or Fields sections — a rename here
// breaks extraction silently unless this test's own assertions catch it, which they do: a missing anchor
// throws before any rule/field comparison runs).
//
//   RULES BLOCK:
//     - Located by a markdown heading matching /^#{1,6}[ \t]*(?:The\s+\d+\s+)?Rules for All Output[ \t]*$/m
//       — matches both "## Rules for All Output" and "## The 16 Rules for All Output" so a rule-count
//       bump that also renames the heading (as this lane's own edit did) does not break extraction.
//     - From the end of that heading line, everything up to and including the FIRST line matching
//       /^1\.\s+/ is treated as preamble and skipped — this tolerates blank lines and any intro prose
//       (SKILL.md carries a one-line parity-enforcement note directly under the heading; system-prompt.ts
//       does not) without needing to special-case it. From "1." onward, consecutive lines matching
//       /^(\d+)\.\s+(.*)$/ are collected as rules until the first non-matching line (system-prompt.ts:
//       through rule 16, the last line of the exported template literal; SKILL.md: through rule 16,
//       followed by a blank line and "## Storage Format").
//
//   FIELDS BLOCK:
//     - Located between a line matching /^Fields:[ \t]*$/m and the next line matching
//       /^Severity to priority mapping/m — both strings are already present, verbatim, in both files
//       (system-prompt.ts's "## Database field emission" section and SKILL.md's "## Database Field
//       Emission (YAML frontmatter contract)" section) as the header of the field enumeration and the
//       header of the section that immediately follows it.
//     - Within that block, every line starting with a markdown bullet is matched against
//       /^-\s+`?([A-Za-z_][A-Za-z0-9_]*)`?\s*(?:—|-)/ to pull the field name — the backtick is OPTIONAL
//       so this is robust to SKILL.md's `` `field_name` `` markdown-code-span convention versus
//       system-prompt.ts's bare `field_name` prose convention (the "markdown vs template-literal
//       quoting" difference named in the task). The em dash "—" that both files use to separate the
//       field name from its description is preferred; a plain hyphen is accepted as a fallback.
//
//   NORMALIZATION (rule text only): collapse all whitespace runs to a single space and trim, THEN strip
//   a trailing JS template-literal terminator (a lone backtick optionally followed by a semicolon, e.g.
//   "...never a silent skip.`;") if present at the very end. That terminator exists ONLY in
//   system-prompt.ts, where rule 16 is also the last line of the exported template literal
//   (`export const SYSTEM_PROMPT = \`...16. ...skip.\`;`) — SKILL.md's rule 16 ends with plain prose and
//   is unaffected by the strip (the regex only matches when a trailing backtick[;] is actually present).
//   This is the one quoting-format accommodation this test needs; everything else about the two files'
//   rule/field text is expected to be byte-for-byte identical after whitespace normalization.
//
// PROVEN TO CATCH DRIFT: this file was exercised against a temporary one-word edit to a rule in each
// file (and a temporarily-added/removed field bullet) during authoring, confirmed RED, then reverted —
// see the lane report. Not re-run automatically here; the mechanism is the anchors + assert calls below.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = resolve(HERE, "system-prompt.ts");
const SKILL_PATH = resolve(HERE, "..", "..", "..", ".claude", "skills", "environmental-policy-and-innovation", "SKILL.md");

const RULES_HEADING_RE = /^#{1,6}[ \t]*(?:The\s+\d+\s+)?Rules for All Output[ \t]*$/m;
const RULE_ITEM_RE = /^(\d+)\.\s+(.*)$/;
const FIELDS_START_RE = /^Fields:[ \t]*$/m;
const FIELDS_END_RE = /^Severity to priority mapping/m;
const FIELD_BULLET_RE = /^-\s+`?([A-Za-z_][A-Za-z0-9_]*)`?\s*(?:—|-)/;

function normalizeRuleText(raw) {
  // Collapse whitespace first, then strip a trailing template-literal terminator if the collapse left one
  // at the very end (only ever true for system-prompt.ts's final rule).
  const collapsed = raw.replace(/\s+/g, " ").trim();
  return collapsed.replace(/`;?$/, "").trim();
}

/** Extract [{num, text}] from the numbered "Rules for All Output" block in `source`. */
function extractRules(source, label) {
  const headingMatch = RULES_HEADING_RE.exec(source);
  assert.ok(headingMatch, `${label}: "Rules for All Output" heading not found — extraction anchor missing`);
  const rest = source.slice(headingMatch.index + headingMatch[0].length);
  const lines = rest.split(/\r?\n/);
  let i = 0;
  // Skip any preamble between the heading and the list itself (blank lines, and — in SKILL.md — the
  // one-line parity-enforcement note this lane added under the heading). The list always starts at "1.",
  // so scanning forward to that exact line is robust to whatever preamble either file carries.
  while (i < lines.length && !/^1\.\s+/.test(lines[i])) i++;
  const rules = [];
  while (i < lines.length) {
    const m = RULE_ITEM_RE.exec(lines[i]);
    if (!m) break;
    rules.push({ num: Number(m[1]), text: normalizeRuleText(m[2]) });
    i++;
  }
  assert.ok(rules.length > 0, `${label}: no numbered rules captured after the heading`);
  return rules;
}

/** Extract the Set of field names from the "Fields:" ... "Severity to priority mapping" block. */
function extractFieldNames(source, label) {
  const startMatch = FIELDS_START_RE.exec(source);
  assert.ok(startMatch, `${label}: "Fields:" header not found — extraction anchor missing`);
  const afterFields = source.slice(startMatch.index + startMatch[0].length);
  const endMatch = FIELDS_END_RE.exec(afterFields);
  assert.ok(endMatch, `${label}: "Severity to priority mapping" boundary not found — extraction anchor missing`);
  const block = afterFields.slice(0, endMatch.index);
  const names = new Set();
  for (const line of block.split(/\r?\n/)) {
    const m = FIELD_BULLET_RE.exec(line);
    if (m) names.add(m[1]);
  }
  assert.ok(names.size > 0, `${label}: no field-name bullets captured in the Fields: block`);
  return names;
}

const promptText = readFileSync(PROMPT_PATH, "utf8");
const skillText = readFileSync(SKILL_PATH, "utf8");

test("skill-prompt-parity: rule count matches between system-prompt.ts and SKILL.md", () => {
  const promptRules = extractRules(promptText, "system-prompt.ts");
  const skillRules = extractRules(skillText, "SKILL.md");
  assert.equal(
    skillRules.length,
    promptRules.length,
    `SKILL.md has ${skillRules.length} numbered rules but system-prompt.ts has ${promptRules.length} — ` +
      `bring SKILL.md's "Rules for All Output" section to the same count as the operative prompt.`,
  );
});

test("skill-prompt-parity: every rule's number and text matches between the two files", () => {
  const promptRules = extractRules(promptText, "system-prompt.ts");
  const skillRules = extractRules(skillText, "SKILL.md");
  const n = Math.min(promptRules.length, skillRules.length);
  for (let idx = 0; idx < n; idx++) {
    const p = promptRules[idx];
    const s = skillRules[idx];
    assert.equal(
      s.num,
      p.num,
      `rule at position ${idx + 1}: SKILL.md numbers it ${s.num} but system-prompt.ts numbers it ${p.num}`,
    );
    assert.equal(
      s.text,
      p.text,
      `rule ${p.num} text differs between SKILL.md and system-prompt.ts (system-prompt.ts is the ` +
        `operative contract — reconcile SKILL.md's wording to match it):\n` +
        `  system-prompt.ts: ${JSON.stringify(p.text)}\n` +
        `  SKILL.md:         ${JSON.stringify(s.text)}`,
    );
  }
});

test("skill-prompt-parity: the field-name set matches between system-prompt.ts and SKILL.md", () => {
  const promptFields = extractFieldNames(promptText, "system-prompt.ts");
  const skillFields = extractFieldNames(skillText, "SKILL.md");

  const missingFromSkill = [...promptFields].filter((f) => !skillFields.has(f)).sort();
  const extraInSkill = [...skillFields].filter((f) => !promptFields.has(f)).sort();

  assert.deepEqual(
    missingFromSkill,
    [],
    `SKILL.md's Fields: enumeration is missing field(s) that system-prompt.ts documents: ${missingFromSkill.join(", ")}`,
  );
  assert.deepEqual(
    extraInSkill,
    [],
    `SKILL.md's Fields: enumeration lists field(s) that system-prompt.ts does not document: ${extraInSkill.join(", ")}`,
  );
});

test("skill-prompt-parity: sanity — both files currently document exactly 16 rules and 20 fields", () => {
  // Guards the guard: if a future edit collapsed both files' counts in lockstep (e.g. both regressed to
  // 14 rules), the set/text-equality tests above would still pass while the underlying contract shrank
  // silently. Pin the known-correct absolute counts as of this lane's fix.
  const promptRules = extractRules(promptText, "system-prompt.ts");
  const promptFields = extractFieldNames(promptText, "system-prompt.ts");
  assert.equal(promptRules.length, 16, `expected system-prompt.ts to document 16 rules, got ${promptRules.length}`);
  assert.equal(promptFields.size, 20, `expected system-prompt.ts to document 20 fields, got ${promptFields.size}`);
});
