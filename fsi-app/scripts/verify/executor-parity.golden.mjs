#!/usr/bin/env node
// executor-parity.golden.mjs — behavioral+structural golden for the doctrine-binds-to-pipeline-not-executor
// doctrine (executor-agnostic addendum rule 4). Proves the two DRIVERS of the ONE grounding pipeline —
// the CC-grounding-executor (injects a ledger, $0, subscription) and the metered path (extracts a ledger
// via the Sonnet model) — are INTERCHANGEABLE: they diverge ONLY at the points where the free driver skips
// a paid/model step it does not need, and they CONVERGE completely at the judgment core, which cannot tell
// which driver produced the ledger. The proof is STRUCTURAL (the strongest form): the downstream gate/
// persist core contains ZERO references to the driver-identity variable, so it CANNOT branch on it — parity
// is by construction, not by test coincidence. No DB, no network, no spend. Run:
//   node scripts/verify/executor-parity.golden.mjs  — exits 0 PASS, 1 FAIL.
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true });
const { perFactWouldHold } = await jiti.import("../../src/lib/agent/mint-gates.mjs");

let failed = 0;
const check = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failed++; };

// ── Load groundBriefImpl (the ONE chokepoint both drivers traverse) as source, comments stripped so only
// EXECUTABLE code is analyzed (a comment saying "injected" is not a branch). ────────────────────────────
const SRC_PATH = resolve(ROOT, "src/lib/agent/canonical-pipeline.ts");
// Normalize CRLF→LF FIRST: on Windows checkouts a stray \r defeats a `//.*$` line-comment strip (`.` stops at
// \r, and `$` cannot match before \r without the m-flag), silently leaving comments in the "code-only" body.
const full = readFileSync(SRC_PATH, "utf8").replace(/\r\n/g, "\n");
const fnStart = full.indexOf("async function groundBriefImpl(");
const fnEnd = full.indexOf("export async function registerBriefSources(", fnStart);
check("groundBriefImpl located as the single grounding chokepoint", fnStart > 0 && fnEnd > fnStart);
const fnBody = full.slice(fnStart, fnEnd);
// Strip // line comments and /* */ block comments — analyze code only.
const codeOnly = fnBody
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

// The driver-identity variable: `injected` (= opts.injectedLedger). `\binjected\b` matches the local var and
// NOT `injectedLedger` (word boundary: the `L` after `injected` is a word char, so the param token is excluded).
const injectedRefs = (codeOnly.match(/\binjected\b/g) || []).length;

// 1. THE DECLARATION — the driver-identity is read ONCE from opts into a local (null for the metered driver).
check("driver-identity declared once: `const injected = opts?.injectedLedger ?? null`",
  /const\s+injected\s*=\s*opts\?\.injectedLedger\s*\?\?\s*null/.test(codeOnly));

// 2. THE UNIFYING PIVOT — both drivers collapse into ONE `claims` variable at the extraction line: the free
//    driver supplies `injected`; the metered driver calls the model. AFTER this line there is no driver identity
//    in the data — only a claim ledger, judged identically.
check("drivers unify into one `claims` ledger at the extraction pivot (`injected ?? extractClaimLedgerLenient(`)",
  /claims\s*=\s*injected\s*\?\?\s*extractClaimLedgerLenient\(/.test(codeOnly));

// 3. THE THREE ALLOWLISTED DIVERGENCE POINTS — every read of the driver-identity var is one of these, and each
//    is the free driver SKIPPING a paid/model step, never a difference in JUDGMENT of a candidate:
//    (a) acquire-lock skip  — the free driver acquires no scrape lock (`if (!injected) assertAcquireAllowed`)
//    (b) extraction source  — the pivot above (`injected ?? extractClaimLedgerLenient`)
//    (c) dominance-guard skip — a deliberate executor re-source of a QUARANTINED item versions over junk
//        (`if (reg.regression && !injected)`); the metered re-extract keeps the accidental-thinning guard.
const divergeAcquire = /if\s*\(\s*!injected\s*\)\s*assertAcquireAllowed/.test(codeOnly);
const divergeExtract = /claims\s*=\s*injected\s*\?\?/.test(codeOnly);
const divergeDominance = /if\s*\(\s*reg\.regression\s*&&\s*!injected\s*\)/.test(codeOnly);
check("divergence (a): acquire-lock skip for the free driver", divergeAcquire);
check("divergence (b): extraction-source pivot", divergeExtract);
check("divergence (c): dominance-guard skip for a deliberate executor re-source", divergeDominance);

// 4. NO FOURTH DIVERGENCE — the driver-identity var appears EXACTLY 4 times in code: 1 declaration + 3
//    allowlisted branch reads. A 5th reference would be an un-audited place the pipeline behaves differently
//    per driver — the exact thing this doctrine forbids. This is the hard structural gate.
check(`driver-identity referenced EXACTLY 4x in code (1 decl + 3 allowlisted divergences); found ${injectedRefs}`,
  injectedRefs === 4);

// 5. THE JUDGMENT CORE IS DRIVER-BLIND — the region from the verbatim kept-filter through the non-destructive
//    persist (the gates that DISPOSE + the writer that MINTS section_claim_provenance) contains ZERO driver-
//    identity references EXCEPT the single allowlisted dominance-guard skip. So the kept-filter, slot-forcing,
//    resolver/tier-stamp, and applyLedgerDiff CANNOT branch on which driver produced the ledger — parity by
//    construction. (The dominance-guard skip sits in this region and is the one allowed exception.)
const coreStart = codeOnly.indexOf("const kept = claims.filter(");
const coreEnd = codeOnly.indexOf("applyLedgerDiff");
check("judgment core located (kept-filter … applyLedgerDiff)", coreStart > 0 && coreEnd > coreStart);
const core = codeOnly.slice(coreStart, coreEnd);
const coreInjectedRefs = (core.match(/\binjected\b/g) || []).length;
check(`judgment core references driver-identity at most ONCE (the allowlisted dominance-guard skip); found ${coreInjectedRefs}`,
  coreInjectedRefs <= 1);
check("the one core reference (if any) is the dominance-guard skip, nothing else",
  coreInjectedRefs === 0 || /reg\.regression\s*&&\s*!injected/.test(core));

// 6. THE WRITER IS SHARED — section_claim_provenance is written by applyLedgerDiff, reached AFTER the pivot, so
//    both drivers mint through the identical non-destructive writer (the executor never writes claims directly).
check("both drivers mint via the shared non-destructive writer (applyLedgerDiff), never the executor directly",
  coreEnd > coreStart && codeOnly.indexOf("applyLedgerDiff") > codeOnly.indexOf("claims = injected"));

// 7. BEHAVIORAL CONFIRMATION — the gate predicate the core applies takes a CLAIM, not a driver flag: the same
//    candidate yields the same verdict whoever produced it. (Structural proof #5 already guarantees this; this
//    is the executable witness.) A clean tier-2 verbatim FACT passes; a sub-floor one holds — identically for
//    an injected ledger and a metered one, because the predicate has no driver parameter.
const ctx = { itemFloor: 2, suspendedSourceIds: new Set() };
const candidate = { claim_kind: "FACT", claim_text: "not beyond 31 December 2029", source_span: "not beyond 31 December 2029", source_id: "s", source_tier_at_grounding: 2 };
const subFloor = { ...candidate, source_tier_at_grounding: 3 };
check("gate verdict is a function of the CLAIM, not the driver: clean floor FACT passes either way",
  perFactWouldHold(candidate, ctx) === false);
check("gate verdict is a function of the CLAIM, not the driver: sub-floor FACT holds either way",
  perFactWouldHold(subFloor, ctx) === true);

// ── 8. THE SYNTHESIS SEAM (task 3.3, brief-chain-build-plan-2026-09-11 Part 3, fix round 1): a SECOND,
// independent allowlisted divergence point inside synthesiseAndWriteBrief (not groundBriefImpl's grounding
// call above, a different chokepoint, same RD-47 posture: skip the paid step, never the judgment). Fix
// round 1 (coordinator ruling): the injected branch no longer returns through its own early write -- it
// CONVERGES with the metered (model-driven) branch on ONE SHARED TAIL that runs the 600-char floor,
// checkBriefContent, and the single write call for BOTH drivers, so a lane-authored brief is judged exactly
// like a model-authored one. The proof below is structural, not a regex over a specific early-return shape:
// it walks BALANCED BRACES to isolate the `if (injected) { ... } else { ... }` branches from the code that
// follows them, then asserts the paid call is confined to the else branch, the two content gates and the
// ONE write call exist exactly once each and live strictly AFTER both branches close (the shared tail), and
// neither branch carries its own copy of any of the three. ──────────────────────────────────────────────
const synthStart = full.indexOf("async function synthesiseAndWriteBrief(");
const synthEnd = full.indexOf("export async function writeSynthesizedBrief(", synthStart);
check("synthesiseAndWriteBrief located (the synthesis chokepoint)", synthStart > 0 && synthEnd > synthStart);
const synthBody = full.slice(synthStart, synthEnd);
const synthCodeOnly = synthBody
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

const WRITE_CALL_RE = /writeSynthesizedBrief\(sb,\s*it,\s*body,\s*parsed\.metadata,\s*fmtSpec,\s*fetched\.length\)/;
const FLOOR_RE = /body\.length\s*<\s*600/;

/** Slice the balanced `{ ... }` body starting at the `{` found at or after `openSearchFrom`, returning the
 *  INNER content (braces excluded) and the index one past the matching closing `}`. Handles nesting; does
 *  not need to understand strings/regex literals because comments are already stripped and this file's own
 *  code has no `{`/`}` inside a string or template literal on the lines this walks. */
function balancedBlock(text, openSearchFrom) {
  const openIdx = text.indexOf("{", openSearchFrom);
  if (openIdx < 0) return null;
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return { content: text.slice(openIdx + 1, i), endIndex: i + 1 };
    }
  }
  return null;
}

const ifIdx = synthCodeOnly.indexOf("if (injected) {");
check("the `if (injected) { ... }` branch is found", ifIdx >= 0);
const ifBlock = ifIdx >= 0 ? balancedBlock(synthCodeOnly, ifIdx) : null;
check("the injected branch is located as a balanced brace block", !!ifBlock);

const afterIf = ifBlock ? synthCodeOnly.slice(ifBlock.endIndex) : "";
const elseHeaderMatch = afterIf.match(/^\s*else\s*\{/);
check("the injected branch is paired with an `else { ... }` (the metered driver's own branch)", !!elseHeaderMatch);
const elseBlock = ifBlock && elseHeaderMatch
  ? balancedBlock(synthCodeOnly, ifBlock.endIndex + elseHeaderMatch[0].indexOf("{"))
  : null;
check("the else branch is located as a balanced brace block", !!elseBlock);

check("the injected branch contains ZERO references to the paid model call (generateBriefText): structurally unreachable, not merely untaken",
  !!ifBlock && !ifBlock.content.includes("generateBriefText("));
check("the else branch (metered driver) still contains the paid model call: proves the live path was preserved, not deleted",
  !!elseBlock && elseBlock.content.includes("generateBriefText("));

// SHARED TAIL: everything in the function AFTER both branches close.
const tailText = elseBlock ? synthCodeOnly.slice(elseBlock.endIndex) : "";
check("a non-empty shared tail exists after both branches close", tailText.trim().length > 0);
check("the 600-char floor lives in the shared tail (fix round 1): reached by BOTH drivers, not only the metered one",
  FLOOR_RE.test(tailText));
check("checkBriefContent lives in the shared tail (fix round 1): reached by BOTH drivers, not only the metered one",
  tailText.includes("checkBriefContent("));
check("the ONE writeSynthesizedBrief(...) call lives in the shared tail, reached by BOTH drivers",
  WRITE_CALL_RE.test(tailText));

// NO PER-BRANCH DUPLICATION: neither branch carries its own copy of the floor, checkBriefContent, or a
// write call -- if it did, the branches would NOT be converging on one shared judgment, they would each be
// running (or skipping) their own.
check("the injected branch itself contains NO copy of the 600-char floor, checkBriefContent, or a write call",
  !!ifBlock && !FLOOR_RE.test(ifBlock.content) && !ifBlock.content.includes("checkBriefContent(") && !ifBlock.content.includes("writeSynthesizedBrief("));
check("the else branch itself contains NO copy of the 600-char floor, checkBriefContent, or a write call",
  !!elseBlock && !FLOOR_RE.test(elseBlock.content) && !elseBlock.content.includes("checkBriefContent(") && !elseBlock.content.includes("writeSynthesizedBrief("));

// EXACTLY ONE of each in the WHOLE function (the shared-tail checks above plus the no-duplication checks
// already imply this, but assert the count directly too -- the hard structural gate, mirroring section 7's
// "referenced EXACTLY 4x" style above).
const writeCallCount = (synthCodeOnly.match(new RegExp(WRITE_CALL_RE.source, "g")) || []).length;
check(`exactly ONE writeSynthesizedBrief(...) call site in the whole function (found ${writeCallCount}): both drivers converge on the SAME write, never a second one`,
  writeCallCount === 1);
const floorCount = (synthCodeOnly.match(new RegExp(FLOOR_RE.source, "g")) || []).length;
check(`exactly ONE 600-char floor check in the whole function (found ${floorCount}): the injected branch has no bypass of its own`,
  floorCount === 1);
const checkBriefContentCount = (synthCodeOnly.match(/checkBriefContent\(/g) || []).length;
check(`exactly ONE checkBriefContent(...) call in the whole function (found ${checkBriefContentCount})`,
  checkBriefContentCount === 1);

console.log(failed ? `\nGOLDEN FAILED (${failed})` : "\nGOLDEN PASSED");
process.exit(failed ? 1 : 0);
