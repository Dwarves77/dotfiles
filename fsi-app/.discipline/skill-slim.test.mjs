// SKILL-SLIM-1 (2026-10-08): a gate-demanded skill load costs its core, not its whole reference.
//
// WHY. The PreToolUse skill gate (governance/pretooluse-skill-gate.mjs, governance/skill-map.mjs) demands a
// `Skill` invocation of the governing skill before a governed edit, and that invocation loads the skill's whole
// SKILL.md into the agent's context, where it is re-billed on every later turn (CLAUDE.md rule 11). Measured
// 2026-10-09: six gate-demanded skills weighed 32,948 to 166,101 bytes each. Each SKILL.md is now a CORE of at
// most 16,000 bytes (raised from 12,000 by ENGINE-FIX-1, 2026-10-09: the cores sat 47 to 82 bytes under the old cap, so the next binding line would have forced a reference move; frontmatter unchanged, the binding rules, and an index naming each reference file with one
// line on when to read it); every other section moved VERBATIM to references/<slug>.md beside it. The gate is
// exactly as strict as before: only what the load costs changed.
//
// WHAT THIS FILE PROVES (each by an ATTACK that must go red, per CLAUDE.md rule 15, not by presence alone):
//   1. SIZE GUARD: no gate-demanded SKILL.md exceeds CORE_MAX_BYTES. Attack: append a section, the guard goes red.
//   2. CONSERVATION: every non-blank line of the pre-split SKILL.md (read from git at PRE_SPLIT_BASE) is still
//      present, with its multiplicity, in the core plus the references. Attack: drop a line, red.
//   3. INDEX: the core's "Reference index" names every file under references/ and no file that is absent.
//      Attack: an unlisted reference and a phantom entry, both red.
//   4. GOVERNING: a references/*.md file is a governing docs file (never docs-only), and the doctrine-
//      contradiction sweep reads every reference file. Attack: a skill reference path classed docs-only, red.
//   5. BINDING INDEX LINES: every section that moved out of a core and that the pre-split file marked binding,
//      mandatory or ruled has a core index line "BINDING: references/<file>.md, read before <trigger> (section:
//      <key>)" naming the file that holds it. Attack: remove one line, red; name the wrong file, red.
//   6. META-GATE READS THE AGGREGATE: an invariant anchor that lives only in a reference file is found when the
//      skill's text is the core plus its references (aggregateSkillText) and is ANCHOR DRIFT when it is the
//      core alone, which is what the meta-gate read before this lane.
//
// RETIRING A PRE-SPLIT LINE. PRE_SPLIT_BASE is a fixed commit; conservation is "nothing the skill said before
// this lane is lost". A later lane that deliberately rewords or deletes a pre-split line records the OLD line
// verbatim in ACKNOWLEDGED_LINE_CHANGES below with its reason (a visible, reviewed edit), never silently.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GOVERNED } from "./governance/skill-map.mjs";
import { isDocsOnlyPath, isGoverningDocPath } from "./governance/docs-only-range.mjs";
import { DOCTRINE_FILES } from "./governance/doctrine-contradiction.mjs";
import { auditInvariants, aggregateSkillText, skillReferencesDir } from "./governance/invariant-coverage.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const SKILLS = "fsi-app/.claude/skills";

/** The largest a gate-demanded SKILL.md may be, in bytes. */
export const CORE_MAX_BYTES = 16000;
/** origin/master when SKILL-SLIM-1 was cut: the last commit at which every SKILL.md still held its whole text. */
const PRE_SPLIT_BASE = "023d47588";
/** { skill: [exact pre-split line, ...] } lines a later lane deliberately changed or removed, each with a reason. */
const ACKNOWLEDGED_LINE_CHANGES = {};

/** Every skill the gate or the skill map can demand (derived from the map, never a hand list). */
export const GATE_DEMANDED = [...new Set(GOVERNED.map((g) => g.skill))].sort();

const INDEX_HEADING = "## Reference index";
const INDEX_ENTRY_RE = /^- `references\/([^`/]+\.md)`: \S/;

// ---------------------------------------------------------------------------------------------------------
// PURE CORE (injectable, so each guard is attacked below with in-memory fixtures)
// ---------------------------------------------------------------------------------------------------------

/** Skills whose core is over the limit. `bytesOf(skill)` returns the SKILL.md byte length or null when absent. */
export function sizeProblems(skills, bytesOf, max = CORE_MAX_BYTES) {
  const out = [];
  for (const s of skills) {
    const b = bytesOf(s);
    if (b === null) out.push(`${s}: SKILL.md missing`);
    else if (b > max) out.push(`${s}: SKILL.md is ${b} bytes, over the ${max}-byte core limit (move the section to references/ verbatim)`);
  }
  return out;
}

const nonBlank = (text) => String(text).split(/\r?\n/).filter((l) => l.trim() !== "");
function multiset(lines) {
  const m = new Map();
  for (const l of lines) m.set(l, (m.get(l) ?? 0) + 1);
  return m;
}

/** Old non-blank lines that the core plus the references no longer carry (with multiplicity). */
export function lostLines(oldText, coreText, refTexts, acknowledged = []) {
  const have = multiset(nonBlank([coreText, ...refTexts].join("\n")));
  const lost = [];
  for (const [line, count] of multiset(nonBlank(oldText))) {
    if (acknowledged.includes(line)) continue;
    if ((have.get(line) ?? 0) < count) lost.push(line);
  }
  return lost;
}

/** Reference files named by the core's "Reference index" block ([] when the block is absent). */
export function indexedReferences(coreText) {
  const lines = String(coreText).split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === INDEX_HEADING);
  if (start < 0) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,6} /.test(lines[i])) break;
    const m = INDEX_ENTRY_RE.exec(lines[i]);
    if (m) out.push(m[1]);
  }
  return out;
}

/** Index/disk disagreements for one skill. `onDisk` is the sorted list of references/*.md basenames. */
export function indexProblems(skill, coreText, onDisk) {
  const indexed = indexedReferences(coreText);
  if (indexed === null) return onDisk.length ? [`${skill}: references/ exists but the core has no "${INDEX_HEADING}" block`] : [];
  const out = [];
  for (const f of onDisk) if (!indexed.includes(f)) out.push(`${skill}: references/${f} is not named in the core's index`);
  for (const f of indexed) if (!onDisk.includes(f)) out.push(`${skill}: the index names references/${f}, which does not exist`);
  return out;
}

const BINDING_MARK_RE = /\b(binding|mandatory|ruled)\b|never violated|non-negotiable/i;
const EM_DASH = String.fromCharCode(0x2014);
const FENCE = String.fromCharCode(96).repeat(3);

/** The short, unique-per-skill name of a section heading: no hashes, the dash glyph as a hyphen, cut at the first colon or paren. */
export function sectionKey(heading) {
  return heading.replace(/^#+\s*/, "").split(EM_DASH).join("-").split(/[:(]/)[0].trim();
}

/** Sections (## and ###) of the pre-split file that are no longer headings of the core and that the old text marks
 *  binding, mandatory or ruled in the heading or its first five non-blank lines. */
export function movedBindingSections(oldText, coreText) {
  const coreLines = new Set(String(coreText).split(/\r?\n/));
  const secs = [];
  let fence = false;
  let cur = null;
  for (const l of String(oldText).split(/\r?\n/)) {
    if (l.startsWith(FENCE)) fence = !fence;
    const m = !fence && /^(#{2,3}) /.exec(l);
    if (m) { cur = { heading: l, body: [] }; secs.push(cur); } else if (cur) cur.body.push(l);
  }
  return secs
    .filter((s) => !coreLines.has(s.heading))
    .filter((s) => BINDING_MARK_RE.test(s.heading) || BINDING_MARK_RE.test(s.body.filter((l) => l.trim()).slice(0, 5).join(" ")))
    .map((s) => ({ heading: s.heading, key: sectionKey(s.heading) }));
}

/** Marked sections lacking a BINDING core index line that names a reference file holding the section heading. */
export function bindingProblems(skill, marked, coreText, refTextByName) {
  const out = [];
  const lines = String(coreText).split(/\r?\n/);
  for (const s of marked) {
    const tail = " (section: " + s.key + ")";
    const line = lines.find((l) => /^BINDING: references\/[^,/]+\.md, read before \S/.test(l) && l.endsWith(tail));
    if (!line) { out.push(skill + ": no BINDING index line for section " + JSON.stringify(s.key)); continue; }
    const file = /^BINDING: references\/([^,]+\.md),/.exec(line)[1];
    const text = refTextByName[file];
    if (text === undefined || !text.split(/\r?\n/).includes(s.heading)) {
      out.push(skill + ": the BINDING line for " + JSON.stringify(s.key) + " names references/" + file + ", which does not hold that section");
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// the real tree
// ---------------------------------------------------------------------------------------------------------

const skillDir = (s) => `${SKILLS}/${s}`;
const readRepo = (rel) => { try { return readFileSync(resolve(REPO, rel), "utf8"); } catch { return null; } };
const refNames = (s) => {
  try { return readdirSync(resolve(REPO, skillDir(s), "references")).filter((n) => !n.startsWith(".")).sort(); } catch { return []; }
};
function oldSkillText(skill) {
  try {
    return execFileSync("git", ["show", `${PRE_SPLIT_BASE}:${skillDir(skill)}/SKILL.md`], { cwd: REPO, encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    assert.fail(`cannot read ${skill}/SKILL.md at ${PRE_SPLIT_BASE} (the conservation proof needs full git history, fetch-depth 0): ${String(e.message).slice(0, 160)}`);
  }
}

test("gate-demanded skills are exactly the six governed skills", () => {
  assert.deepEqual(GATE_DEMANDED, [
    "analysis-construction-spec", "caros-ledge-platform-intent", "environmental-policy-and-innovation",
    "remediation-discipline", "source-credibility-model", "sprint-followups-discipline",
  ]);
});

test("SIZE GUARD: every gate-demanded SKILL.md is at most CORE_MAX_BYTES", () => {
  const problems = sizeProblems(GATE_DEMANDED, (s) => {
    const t = readRepo(`${skillDir(s)}/SKILL.md`);
    return t === null ? null : Buffer.byteLength(t);
  });
  assert.deepEqual(problems, []);
});

test("SIZE GUARD attack: appending a section to a core that fits turns the guard red", () => {
  const fits = "x".repeat(CORE_MAX_BYTES - 200);
  assert.deepEqual(sizeProblems(["s"], () => Buffer.byteLength(fits)), []);
  const grown = fits + "\n## A new section\n" + "y".repeat(400);
  const red = sizeProblems(["s"], () => Buffer.byteLength(grown));
  assert.equal(red.length, 1);
  assert.match(red[0], /over the 16000-byte core limit/);
  assert.equal(sizeProblems(["s"], () => null).length, 1, "a missing SKILL.md is a problem, not a pass");
});

test("SIZE GUARD ENGINE-FIX-1: the cap is exactly 16000 bytes, 16000 fits and 16001 fails", () => {
  assert.equal(CORE_MAX_BYTES, 16000);
  assert.deepEqual(sizeProblems(["s"], () => 16000), []);
  const red = sizeProblems(["s"], () => 16001);
  assert.equal(red.length, 1);
  assert.match(red[0], /16001 bytes, over the 16000-byte core limit/);
});

test("INDEX: every core names exactly the files under its references/", () => {
  for (const s of GATE_DEMANDED) {
    const core = readRepo(`${skillDir(s)}/SKILL.md`);
    assert.ok(core, `${s}: SKILL.md missing`);
    const onDisk = refNames(s);
    assert.ok(onDisk.length > 0, `${s}: over-limit skills must have references/`);
    assert.ok(onDisk.every((n) => n.endsWith(".md")), `${s}: references/ holds only .md files`);
    assert.deepEqual(indexProblems(s, core, onDisk), []);
  }
});

test("INDEX attack: an unlisted reference and a phantom entry both turn it red", () => {
  const core = ["# T", "", INDEX_HEADING, "", "Lead-in line.", "- `references/a.md`: when a", "- `references/ghost.md`: when ghost", "", "## Next", ""].join("\n");
  const p = indexProblems("s", core, ["a.md", "b.md"]);
  assert.equal(p.length, 2);
  assert.ok(p.some((x) => /references\/b\.md is not named/.test(x)));
  assert.ok(p.some((x) => /names references\/ghost\.md, which does not exist/.test(x)));
  assert.equal(indexProblems("s", "# T\n\nno index here\n", ["a.md"]).length, 1);
  assert.deepEqual(indexProblems("s", "# T\n", []), []);
});

test("CONSERVATION: every pre-split line of each gate-demanded SKILL.md is still in the core or a reference", () => {
  for (const s of GATE_DEMANDED) {
    const core = readRepo(`${skillDir(s)}/SKILL.md`);
    const refs = refNames(s).map((n) => readRepo(`${skillDir(s)}/references/${n}`));
    const lost = lostLines(oldSkillText(s), core, refs, ACKNOWLEDGED_LINE_CHANGES[s] ?? []);
    assert.deepEqual(lost.slice(0, 3), [], `${s}: ${lost.length} pre-split line(s) are gone from the core and every reference`);
  }
});

test("CONSERVATION attack: a dropped line, a reworded line and a lost duplicate each turn it red", () => {
  const old = "# T\nrule one\nrule two\nrule two\n\nrule three\n";
  assert.deepEqual(lostLines(old, "# T\nrule one\n", ["rule two\nrule two\n\nrule three\n"]), []);
  assert.deepEqual(lostLines(old, "# T\nrule one\n", ["rule two\nrule two\n"]), ["rule three"]);
  assert.deepEqual(lostLines(old, "# T\nrule one\n", ["rule two\nrule 2\nrule three\n"]), ["rule two"]);
  assert.deepEqual(lostLines(old, "# T\nrule one\n", ["rule two\nrule three\n"]), ["rule two"], "multiplicity is part of the proof");
  assert.deepEqual(lostLines(old, "# T\nrule one\n", ["rule two\nrule three\n"], ["rule two"]), [], "an acknowledged change is recorded, not silent");
});

test("BINDING INDEX: every moved section the pre-split file marked binding, mandatory or ruled has a BINDING core line", () => {
  let total = 0;
  for (const s of GATE_DEMANDED) {
    const core = readRepo(`${skillDir(s)}/SKILL.md`);
    const refs = Object.fromEntries(refNames(s).map((n) => [n, readRepo(`${skillDir(s)}/references/${n}`)]));
    const marked = movedBindingSections(oldSkillText(s), core);
    total += marked.length;
    assert.deepEqual(bindingProblems(s, marked, core, refs), []);
  }
  assert.ok(total >= 20, "the marker found the known binding sections (" + total + ")");
});

test("BINDING INDEX attack: removing one BINDING line, or naming the wrong file, turns it red", () => {
  const old = ["# T", "## Kept", "text", "## Rule X (mandatory)", "body", "### Sub: sub", "Binding statement here", "## Plain", "plain"].join("\n");
  const core = "# T\n## Kept\ntext\n\n";
  const marked = movedBindingSections(old, core);
  assert.deepEqual(marked.map((m) => m.key), ["Rule X", "Sub"]);
  const lines = [
    "BINDING: references/a.md, read before editing X (section: Rule X)",
    "BINDING: references/a.md, read before editing Y (section: Sub)",
  ];
  const refs = { "a.md": "## Rule X (mandatory)\nbody\n### Sub: sub\nBinding statement here\n" };
  assert.deepEqual(bindingProblems("s", marked, core + lines.join("\n"), refs), []);
  const missing = bindingProblems("s", marked, core + lines[0], refs);
  assert.equal(missing.length, 1);
  assert.match(missing[0], /no BINDING index line for section "Sub"/);
  const wrong = bindingProblems("s", marked, core + lines.join("\n"), { "a.md": "## Rule X (mandatory)\n", "b.md": "x" });
  assert.equal(wrong.length, 1);
  assert.match(wrong[0], /does not hold that section/);
  assert.equal(sectionKey("### Section 4 " + EM_DASH + " category 24: Generic (x)"), "Section 4 - category 24");
});

test("GOVERNING: a references/*.md file is a governing docs file, never docs-only", () => {
  for (const s of GATE_DEMANDED) {
    for (const n of refNames(s)) {
      const p = `${skillDir(s)}/references/${n}`;
      assert.equal(isGoverningDocPath(p), true, `${p} must be governing`);
      assert.equal(isDocsOnlyPath(p), false, `${p} must not be docs-only`);
    }
  }
});

test("GOVERNING attack: a reference path for a skill that does not exist yet is still not docs-only", () => {
  assert.equal(isDocsOnlyPath("fsi-app/.claude/skills/some-new-skill/references/part.md"), false);
  assert.equal(isDocsOnlyPath(".claude/skills/ledger/references/part.md"), false);
  assert.equal(isDocsOnlyPath("docs/skills/references/part.md"), true, "an ordinary docs file is still docs-only");
});

test("DOCTRINE SWEEP: the doctrine-contradiction surface reads every reference file", () => {
  for (const s of GATE_DEMANDED) {
    for (const n of refNames(s)) assert.ok(DOCTRINE_FILES.includes(`${skillDir(s)}/references/${n}`), `${s}/references/${n} is not swept`);
  }
});

test("META-GATE: an anchor that lives only in a reference is found in the aggregate, DRIFT in the core alone", () => {
  const inv = [{
    id: "SLIM-FIXTURE", skill: "demo", section: "x", text: "t",
    anchor: "the anchor sentence that moved to a reference", enforcedBy: ["rule:001"],
  }];
  const core = "# Demo\n\n## Reference index\n- `references/r.md`: where it went\n";
  const ref = "## Moved\n\nthe anchor sentence that moved to a reference, verbatim.\n";
  const env = (content) => ({ resolveToken: () => ({ ok: true, detail: "" }), getSkillContent: () => content });
  const red = auditInvariants(inv, env(aggregateSkillText(core, []))).problems;
  assert.equal(red.length, 1);
  assert.match(red[0], /ANCHOR DRIFT/);
  assert.deepEqual(auditInvariants(inv, env(aggregateSkillText(core, [ref]))).problems, []);
  assert.equal(aggregateSkillText(null, [ref]), null, "an absent SKILL.md stays absent (SKILL FILE MISSING)");
  assert.equal(skillReferencesDir("fsi-app/.claude/skills/demo/SKILL.md"), "fsi-app/.claude/skills/demo/references/");
});

test("the meta-gate and the parity test read the files that now hold the text", () => {
  assert.ok(existsSync(resolve(REPO, SKILLS, "environmental-policy-and-innovation", "references", "storage-and-field-emission.md")));
  assert.match(readRepo(`${SKILLS}/environmental-policy-and-innovation/SKILL.md`), /^## The 16 Rules for All Output$/m);
});
