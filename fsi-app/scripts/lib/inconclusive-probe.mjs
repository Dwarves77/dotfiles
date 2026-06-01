// ── THE BUG-CLASS DETECTOR — "non-answer resolved to a definitive answer" ──
//
// ONE systemic defect, surfaced 5x: a non-answer (HTTP non-2xx / timeout / rate-limit /
// classifier-uncertainty / error-body / empty result) resolved to a DEFINITIVE answer
// (substantive positive OR negative) instead of held INCONCLUSIVE. The four faces:
//
//   FORM 1  fetch non-2xx/timeout -> a substantive NEGATIVE (unreachable/dead/fabricated/
//           reject), with no distinct inconclusive branch. (420 reachability; recovery
//           429/500; fabrication-by-timeout.)  [delegated to fetch-negative-probe.mjs]
//   FORM 2  classifier "uncertain / low-confidence / absent" -> a substantive DEFAULT value
//           instead of an explicit inconclusive verdict. (first-fetch line-191:
//           unsure -> item_type "regulation".)
//   FORM 3  an error / empty / bot-block BODY consumed as CONTENT, with no error-body guard.
//           (Entry-4: CloudFront-403 body minted as an item.)
//   FORM 4  ORCHESTRATION: a non-idempotent call is auto-retried, OR a rate-limit/transient
//           (429/5xx/cooldown) is treated as a HARD FAILURE rather than skip/backoff.
//           (CI: curl --retry on a POST; 429 -> failed run.) This is the CI-orchestration
//           layer the fetch probe never scanned — the coverage gap that hid instance #5.
//
// DISCRIMINATION (the standing discipline): the detector flags MISSING inconclusive-handling,
// NOT every fetch/classify/call. A site that already handles the inconclusive case explicitly
// passes clean (negative control). Proven by inconclusive-probe.selftest.mjs: it flags the 5
// known shapes AND passes the SSOTs that handle inconclusive correctly (reachability.mjs,
// entity-gate.mjs entityVerdict/isErrorBody, the fixed spot-check workflow).
//
// HONEST DEPTH: forms 2-4 match a token lexicon over a brace/step window. An instance that
// reaches its definitive answer through an UNNAMED indirection (a helper, a numeric sentinel,
// a downstream caller) is NOT caught here — stated, never papered over. Flags are CANDIDATES
// for semantic review, not verdicts. Wire into CI as a standing check; treat new CANDIDATE_*
// as a review gate, not an auto-fail, until the lexicon is hardened against false positives.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { SURFACE_CLASSES, discoverSurfaces, emptyCoverage, validateCoverage } from "./surface-registry.mjs";
import { findFetchNegativeMappings } from "./fetch-negative-probe.mjs";

const WINDOW = 16; // lines after an anchor to scan for its resolution

// ── FORM 2 — classifier-uncertainty -> substantive default ─────────────────────
// In scope: a file that consumes an AI/classifier verdict (or sets a classify-ish field).
const CLASSIFY_EGRESS =
  /\b(?:firstFetchClassify|entity_verdict|haikuVerdict|recommend(?:ed)?[_-]?classification|classif|item_type|verdict|confidence|messages\.create|anthropic)\b/i;
// A FALLBACK-ON-ABSENCE construct whose value is a SUBSTANTIVE (confident) literal. ONLY the
// genuine default shapes — `|| "x"`, `?? "x"`, `default: "x"` (switch fallthrough). A bare
// object property (`item_type: "x"`) or assignment (`= "x"`) is a DELIBERATE value, NOT an
// uncertainty default, and must NOT be flagged (the discrimination that keeps this precise).
const CLASSIFY_TARGET =
  /\b(item_type|entity_verdict|verdict|classification|category|severity|tier|label|type)\b/i;
const SUBSTANTIVE_DEFAULT =
  /(?:\|\||\?\?|default\s*:\s*(?:return\s+)?)\s*["'](regulation|directive|standard|guidance|framework|document|specific_document|technology|market_signal|active|verified|high|critical|reachable|accessible)["']/i;
const IS_COMMENT = /^\s*(\/\/|\*|#|<!--)/;
// SOUND: uncertainty mapped to an explicit inconclusive.
const UNCERTAIN_SOUND =
  /["'](uncertain|unknown|inconclusive|unverified|pending|review)["']|=>\s*(?:null|undefined)\b|return\s+(?:null|undefined)\b|UNCERTAIN\b/i;

export function findClassifyDefaults(text, file) {
  if (!CLASSIFY_EGRESS.test(text)) return [];
  const lines = text.split(/\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (IS_COMMENT.test(lines[i])) continue;
    if (!SUBSTANTIVE_DEFAULT.test(lines[i])) continue;
    if (!CLASSIFY_TARGET.test(lines[i]) && !CLASSIFY_TARGET.test(lines[i - 1] || "")) continue;
    const window = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 4)).join("\n");
    const sound = UNCERTAIN_SOUND.test(window);
    hits.push({
      file, line: i + 1, form: 2, anchor: "uncertain-default",
      verdict: sound ? "REVIEW" : "CANDIDATE_CORRUPT",
      why: sound ? "substantive default near a classify field, but an inconclusive token is also present — read it"
                 : "a classify-ish field defaults to a SUBSTANTIVE literal on the uncertain/absent branch (line-191 shape)",
      snippet: lines[i].trim().slice(0, 110),
    });
  }
  return hits;
}

// ── FORM 3 — error / empty body consumed as content ────────────────────────────
// In scope: a file that fetches content AND writes it into an item/brief/content field.
const CONTENT_FETCH = /\b(browserlessRender|browserlessFetch|fetchContent|firstFetchClassify|drain|seedStub)\b/i;
const CONTENT_CONSUME =
  /\b(full_brief|summary|content|body|item_type|seedStubIntelligenceItem|insert\(\s*\{|intelligence_items)\b/;
// SOUND: an error-body guard is present in the file.
const ERRORBODY_GUARD = /\bisErrorBody\b|\berrorMarkerCount\b|ERROR_SIGNATURES|error[_-]?body/i;

export function findErrorBodyContent(text, file) {
  if (!CONTENT_FETCH.test(text)) return [];
  if (!CONTENT_CONSUME.test(text)) return [];
  if (ERRORBODY_GUARD.test(text)) {
    return [{ file, line: 0, form: 3, anchor: "errorbody-guard", verdict: "CANDIDATE_SOUND",
      why: "fetches + consumes content AND carries an error-body guard (isErrorBody/errorMarkerCount) — the Entry-4 protection is present", snippet: "" }];
  }
  // fetches + consumes content but NO error-body guard anywhere in the file.
  const lines = text.split(/\n/);
  const consumeLine = lines.findIndex((l) => CONTENT_CONSUME.test(l) && !/^\s*(\/\/|\*)/.test(l));
  return [{
    file, line: consumeLine + 1, form: 3, anchor: "no-errorbody-guard",
    verdict: "CANDIDATE_CORRUPT",
    why: "fetches content AND consumes it into an item/brief field, but NO error-body guard (isErrorBody/errorMarkerCount) in the file — an error/block body can be minted as content",
    snippet: (lines[consumeLine] || "").trim().slice(0, 110),
  }];
}

// ── FORM 4 — orchestration: retry a non-idempotent op, or transient -> hard fail ──
// Two sub-shapes. (a) a retry directive co-located with a non-idempotent method (POST/PUT/
// PATCH/DELETE or a mutation verb). (b) a 429/5xx/cooldown mapped to a hard failure with no
// skip/backoff branch. Scanned in BOTH .yml (CI) and code.
const RETRY_DIRECTIVE = /--retry\s+([1-9]\d*)|\bmaxRetries?\s*[:=]\s*([1-9]\d*)|\bretries?\s*[:=]\s*([1-9]\d*)|\.retry\(/;
const NONIDEMPOTENT = /-X\s*POST|-X\s*PUT|-X\s*PATCH|-X\s*DELETE|method\s*[:=]\s*["'](POST|PUT|PATCH|DELETE)|\.(post|put|patch|delete)\(|\b(insert|update|upsert|delete)\(/i;
const TRANSIENT = /\b429\b|too many requests|rate[_-]?limit|cooldown|\b50[023]\b|ETIMEDOUT|temporarily/i;
const HARDFAIL = /exit\s+1\b|process\.exit\(\s*1|throw\s+new\s+\w*(Fatal|Error)|::error::|status['"]?\s*[:=]\s*['"](failed|error)|return\s+\{[^}]*ok\s*:\s*false/i;
const TRANSIENT_SOUND = /--retry\s+0\b|exit\s+0\b|skip|backoff|retryAfter|retry[_-]?after|inconclusive|continue\b|RetryableError/i;

export function findOrchestrationMishandling(text, file) {
  const lines = text.split(/\n/);
  const hits = [];
  // sub-shape (a): retry directive near a non-idempotent method
  for (let i = 0; i < lines.length; i++) {
    if (IS_COMMENT.test(lines[i])) continue;
    if (!RETRY_DIRECTIVE.test(lines[i])) continue;
    const m = lines[i].match(/--retry\s+(\d+)/);
    if (m && m[1] === "0") continue; // explicit no-retry = sound
    const window = lines.slice(Math.max(0, i - 8), Math.min(lines.length, i + 8)).join("\n");
    if (!NONIDEMPOTENT.test(window)) continue;
    hits.push({ file, line: i + 1, form: 4, anchor: "retry-nonidempotent",
      verdict: "CANDIDATE_CORRUPT",
      why: "a retry directive is co-located with a NON-IDEMPOTENT method (POST/PUT/PATCH/DELETE/mutation) — auto-retry can double-execute the side effect (the CI-429 double-fire shape)",
      snippet: lines[i].trim().slice(0, 110) });
  }
  // sub-shape (b): a transient (429/5xx/cooldown) handled as a hard failure with no skip branch
  for (let i = 0; i < lines.length; i++) {
    if (IS_COMMENT.test(lines[i])) continue;
    if (!TRANSIENT.test(lines[i])) continue;
    const window = lines.slice(i, Math.min(lines.length, i + WINDOW)).join("\n");
    if (!HARDFAIL.test(window)) continue;
    if (TRANSIENT_SOUND.test(window)) {
      hits.push({ file, line: i + 1, form: 4, anchor: "transient-mixed", verdict: "REVIEW",
        why: "a transient (429/5xx/cooldown) is near a hard-fail AND a skip/backoff token — read which branch the transient takes",
        snippet: lines[i].trim().slice(0, 110) });
      continue;
    }
    hits.push({ file, line: i + 1, form: 4, anchor: "transient-hardfail", verdict: "CANDIDATE_CORRUPT",
      why: "a transient (429/5xx/cooldown) resolves to a HARD FAILURE (exit 1 / throw / status failed) with no skip/backoff branch nearby — a try-later treated as a definitive failure",
      snippet: lines[i].trim().slice(0, 110) });
  }
  return hits;
}

// ── workflow (.yml) discovery — the orchestration layer the surface registry omits ──
function discoverWorkflows(repoRoot) {
  const dir = resolve(repoRoot, ".github/workflows");
  let out = [];
  try {
    for (const f of readdirSync(dir)) {
      if (/\.ya?ml$/.test(f)) out.push(relative(repoRoot, resolve(dir, f)).replace(/\\/g, "/"));
    }
  } catch { /* no workflows dir */ }
  return out;
}

// ── KNOWN-ANSWER set — every confirmed instance + its SOUND counterpart ─────────
// expectFlag=true: the detector must flag this file (blindness = lost detection).
// expectFlag=false (a SOUND control): the detector must NOT flag it CANDIDATE_CORRUPT.
export const KNOWN_ANSWERS = [
  // FORM 1 (delegated)
  { file: "src/lib/sources/verification.ts", form: 1, fixed: true, note: "reachability SSOT — surfaces for the genuine DEAD(404/410)->tier L path (correct)" },
  { file: "src/lib/sources/reachability.mjs", form: 1, sound: true, note: "SOUND control: non-answer -> INCONCLUSIVE" },
  // FORM 2
  { file: "src/lib/llm/first-fetch-classify.ts", form: 2, fixed: true, note: "line-191 — unsure no longer defaults to 'regulation'" },
  { file: "src/lib/sources/entity-gate.mjs", form: 2, sound: true, note: "SOUND control: entityVerdict unsure -> UNCERTAIN" },
  // FORM 3
  { file: "src/lib/sources/entity-gate.mjs", form: 3, sound: true, note: "SOUND control: isErrorBody rejects error bodies explicitly" },
  // FORM 4
  { file: ".github/workflows/spot-check-monthly.yml", form: 4, sound: true, note: "SOUND control (FIXED): --retry 0 + 429 -> skip" },
];

export function auditInconclusive(root) {
  const surfaces = discoverSurfaces(root);
  const cov = emptyCoverage("bug-class detector (forms 1-4: fetch-negative, classify-default, error-body, orchestration)");
  const all = [];
  // forms 1-3 ride the code surface registry
  for (const cls of SURFACE_CLASSES) {
    const files = surfaces[cls.id];
    if (cls.id === "crons") { cov.walked.push({ class: "crons", note: "scheduler config", count: files.length }); continue; }
    if (!cls.hostsFetch) { cov.not_walked.push({ class: cls.id, count: files.length, reason: cls.reason }); continue; }
    let flagged = 0;
    for (const rel of files) {
      let text;
      try { text = readFileSync(resolve(root, rel), "utf8"); }
      catch { cov.cannot_see.push({ class: cls.id, file: rel, reason: "unreadable" }); continue; }
      const hits = [
        ...findFetchNegativeMappings(text, rel).map((h) => ({ ...h, form: 1 })),
        ...findClassifyDefaults(text, rel),
        ...findErrorBodyContent(text, rel),
        ...findOrchestrationMishandling(text, rel),
      ];
      if (hits.length) { all.push(...hits); flagged += hits.filter((h) => h.verdict === "CANDIDATE_CORRUPT").length; }
    }
    cov.walked.push({ class: cls.id, files: files.length, flagged });
  }
  // form 4 additionally scans .github/workflows (the orchestration layer — gap-closing)
  const wfs = discoverWorkflows(root);
  let wfFlagged = 0;
  for (const rel of wfs) {
    let text;
    try { text = readFileSync(resolve(root, rel), "utf8"); } catch { continue; }
    const hits = findOrchestrationMishandling(text, rel);
    if (hits.length) { all.push(...hits); wfFlagged += hits.filter((h) => h.verdict === "CANDIDATE_CORRUPT").length; }
  }
  cov.walked.push({ class: "github-workflows", files: wfs.length, flagged: wfFlagged, note: "orchestration layer — added by this detector (the fetch probe never scanned it)" });

  const known = KNOWN_ANSWERS.map((k) => ({ ...k, surfaced: all.some((h) => h.file === k.file && h.form === k.form) }));
  cov.assumptions_unverified.push(
    "RESIDUAL: forms 2-4 match a token lexicon over a window. Evaded by: a substantive default via a helper/enum sentinel; an error body consumed through an indirection that hides the content field; a transient whose hard-fail is >16 lines away or reached via a downstream caller. Flags are CANDIDATES for review.",
    "DISCRIMINATION: CANDIDATE_SOUND / a clean pass means an inconclusive handler is present NEAR the site — not a whole-dataflow proof. The selftest pins the 5 known shapes + the SOUND controls.",
    "SCOPE: form 4 spans BOTH code and .github/workflows; forms 1-3 ride the code surface registry. CI/orchestration is now in scope (it was the blind spot that hid instance #5)."
  );
  return { coverage: cov, hits: all, known, completeness: validateCoverage(cov) };
}

// ── runnable ──────────────────────────────────────────────────────────────────
if (/inconclusive-probe\.mjs$/.test(process.argv[1]?.replace(/\\/g, "/") || "")) {
  const root = resolve(process.argv[2] || ".");
  const { coverage, hits, known, completeness } = auditInconclusive(root);
  const byVerdict = (v) => hits.filter((h) => h.verdict === v);
  const corrupt = byVerdict("CANDIDATE_CORRUPT"), review = byVerdict("REVIEW");

  console.log("=== bug-class detector — non-answer -> definitive-answer (forms 1-4) ===\n");
  console.log(`coverage complete: ${completeness.complete}${completeness.missing?.length ? " MISSING: " + completeness.missing.join(",") : ""}`);
  console.log("\n-- coverage --"); console.dir(coverage, { depth: 5 });

  console.log("\n-- KNOWN-ANSWER re-catch (BLIND on a non-sound entry = lost detection) --");
  for (const k of known) {
    const tag = k.sound ? (k.surfaced ? "ctrl?" : "CTRL ") : (k.surfaced ? "SEEN " : "BLIND");
    console.log(`  F${k.form} ${tag}  ${k.file} — ${k.note}`);
  }

  const byForm = (n) => corrupt.filter((h) => h.form === n);
  for (const n of [1, 2, 3, 4]) {
    const arr = byForm(n);
    console.log(`\n-- FORM ${n} — CANDIDATE_CORRUPT: ${arr.length} --`);
    for (const h of arr) console.log(`  ${h.file}:${h.line} [${h.anchor}]\n      ${h.why}\n      > ${h.snippet}`);
  }
  console.log(`\n-- REVIEW (mixed signals — read): ${review.length} --`);
  for (const h of review) console.log(`  F${h.form} ${h.file}:${h.line} [${h.anchor}] — ${h.snippet}`);

  console.log(`\n=== ${corrupt.length} candidate-corrupt, ${review.length} review across ${new Set(hits.map((h) => h.file)).size} files ===`);
}
