#!/usr/bin/env node
// injected-no-synthesis-window.golden.mjs -- behavioral+structural golden for D30 (defect-fix-plan-2026-09-12,
// lane L19): "the synthesis context cap quarantines a mechanically grounded brief." groundBriefImpl's
// buildSourceBlocks(groundWithTier, SYNTH_INPUT_BUDGET_CHARS, ...) call feeds ONLY the paid Sonnet
// ledger-extraction call a few lines later (`claims = injected ?? extractClaimLedgerLenient(await
// callSonnet(system, user, groundSrc.blocks, groundModel))`) -- `??` short-circuits that whole call when an
// executor-injected ledger is supplied, so building the synthesis window on the injected path was pure waste
// that ALSO raised a truncation-guard flag (context-ceiling-wall(floor)) + quarantine reason for a synthesis
// cap the injected path's own span check never reads (it reads `fetched`, the full untruncated stored
// capture, directly). Evidence: bec305e1 (batch 003 apply run 34747318946), a 2,265,617-char primary,
// quarantined by exactly this flag though its record-briefs ledger was authored from the full stored pool.
//
// PROOF IS STRUCTURAL (executor-parity.golden.mjs's own technique: no DB, no network -- groundBriefImpl
// needs a live Supabase client to RUN, so this golden never calls it; it reads canonical-pipeline.ts as
// TEXT, strips comments, and proves by BALANCED-BRACE isolation that the synthesis-window build
// (buildSourceBlocks + both recordTruncation calls + the section-preparation + the `user` message) is
// INSIDE an `if (!injected)` block -- structurally unreachable when an executor ledger is injected, not
// merely untaken by luck) PLUS BEHAVIORAL (source-blocks.mjs's buildSourceBlocks is pure -- proving what
// the skip actually removes: a 2.3M-char floor-qualifying source DOES raise a ceiling wall when the
// function runs, so the structural skip above is proven to remove a REAL would-fire flag, not a
// hypothetical one). Run:
//   node scripts/verify/injected-no-synthesis-window.golden.mjs  -- exits 0 PASS, 1 FAIL.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { buildSourceBlocks } from "../../src/lib/agent/source-blocks.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

let failed = 0;
const check = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failed++; };

/** Slice the balanced `{ ... }` body starting at the `{` found at or after `openSearchFrom` -- the same
 *  helper as executor-parity.golden.mjs's own (duplicated, not imported: every verify script here is
 *  standalone by design, zero shared runtime dependency between goldens). */
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

// ── locate groundBriefImpl, comments stripped so only EXECUTABLE code is analyzed (a comment saying
// "injected" is not a branch) ───────────────────────────────────────────────────────────────────────────
const SRC_PATH = resolve(ROOT, "src/lib/agent/canonical-pipeline.ts");
// Normalize CRLF -> LF FIRST: on a Windows checkout a stray \r defeats a `//.*$` line-comment strip.
const full = readFileSync(SRC_PATH, "utf8").replace(/\r\n/g, "\n");
const fnStart = full.indexOf("async function groundBriefImpl(");
const fnEnd = full.indexOf("export async function registerBriefSources(", fnStart);
check("groundBriefImpl located", fnStart > 0 && fnEnd > fnStart);
const fnBody = full.slice(fnStart, fnEnd);
const codeOnly = fnBody
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

// 1. groundSrc/preparedSecs/user are declared with SAFE DEFAULTS before the guard, so the function still
//    compiles and returns correctly on the branch where the guarded block never runs.
check(
  'groundSrc defaults to an empty window ({ blocks: "", trims: [], ceilingWalls: [] }) before the guard',
  /let\s+groundSrc[^=]*=\s*\{\s*blocks:\s*"",\s*trims:\s*\[\],\s*ceilingWalls:\s*\[\]\s*\}/.test(codeOnly),
);
check("preparedSecs defaults to an empty array before the guard", /let\s+preparedSecs[^=]*=\s*\[\]/.test(codeOnly));
check('user defaults to an empty string before the guard', /let\s+user\s*=\s*"";/.test(codeOnly));

// 2. THE GUARD -- `if (!injected) { ... }`, isolated by balanced braces.
const guardIdx = codeOnly.indexOf("if (!injected) {");
check("the `if (!injected) { ... }` synthesis-window guard is found", guardIdx >= 0);
const guardBlock = guardIdx >= 0 ? balancedBlock(codeOnly, guardIdx) : null;
check("the guard is located as a balanced brace block", !!guardBlock);
const guarded = guardBlock ? guardBlock.content : "";

// 3. EVERYTHING the injected path must never build lives INSIDE the guard.
check("buildSourceBlocks(...) is inside the guard", guarded.includes("buildSourceBlocks("));
check(
  "the groundSrc.trims/ceilingWalls recordTruncation call is inside the guard",
  /recordTruncation\(sb,\s*itemId,\s*\[\.\.\.groundSrc\.trims/.test(guarded),
);
check("prepareSectionForGrounding(...) (preparedSecs) is inside the guard", guarded.includes("prepareSectionForGrounding("));
check(
  "the section-ceiling recordTruncation call is inside the guard",
  /recordTruncation\(sb,\s*itemId,\s*preparedSecs\.filter/.test(guarded),
);
check("the `user` message assembly is inside the guard", /user\s*=\s*`BRIEF SECTIONS/.test(guarded));

// 4. NONE OF THEM appear OUTSIDE the guard anywhere else in groundBriefImpl -- the ONLY call sites are the
//    ones just proven to be inside it: structurally UNREACHABLE on the injected path, not merely untaken.
const outside = guardBlock ? codeOnly.slice(0, guardIdx) + codeOnly.slice(guardBlock.endIndex) : codeOnly;
check("buildSourceBlocks(...) never appears outside the guard", !outside.includes("buildSourceBlocks("));
check(
  "the groundSrc-trims recordTruncation call never appears outside the guard",
  !/recordTruncation\(sb,\s*itemId,\s*\[\.\.\.groundSrc\.trims/.test(outside),
);
check("prepareSectionForGrounding(...) never appears outside the guard", !outside.includes("prepareSectionForGrounding("));

// 5. THE PIVOT (mirrors executor-parity.golden.mjs's own check 2): the injected path short-circuits the
//    whole Sonnet call, so groundSrc.blocks/user are read ONLY from the branch just proven unreachable.
check(
  "drivers unify at `claims = injected ?? extractClaimLedgerLenient(await callSonnet(system, user, groundSrc.blocks, groundModel))`",
  /claims\s*=\s*injected\s*\?\?\s*extractClaimLedgerLenient\(\s*await\s*callSonnet\(system,\s*user,\s*groundSrc\.blocks,\s*groundModel\)\)/.test(
    codeOnly,
  ),
);

// ── BEHAVIORAL: prove the skip removes a REAL would-fire flag, not a hypothetical one (source-blocks.mjs
// is pure, no DB/network -- this mirrors bec305e1's own shape: a 2,265,617-char floor-qualifying primary). ─
const HUGE_PRIMARY = "x".repeat(2_300_000);
const pool = [{ url: "https://example.org/law", text: HUGE_PRIMARY, tier: 1 }];
const wouldFire = buildSourceBlocks(pool, 560_000, { floorTier: 2, hardCeiling: 560_000 });
check(
  "a 2.3M-char floor-qualifying primary DOES raise a context-ceiling-wall when buildSourceBlocks runs " +
    "(confirms the guard above removes a REAL flag on the injected path, matching bec305e1's own " +
    "2,265,617-char primary)",
  wouldFire.ceilingWalls.length === 1 && wouldFire.ceilingWalls[0].transport === "context-ceiling-wall(floor)",
);

// ── I1 (review, fix round 1, 2026-09-13): D29's `doReplaceLedger` guard requires BOTH an injected ledger
// AND `opts.replaceLedger === true` -- a bare `replaceLedger:true` on the metered path (no injectedLedger)
// is documented as "a caller error this line refuses to act on", but had zero mechanical proof behind it
// (apply-record-briefs.test.mjs can only assert what IT passes to groundBrief, not groundBrief's internal
// guard; groundBriefImpl itself needs a live Supabase client to run, so it cannot be driven by a plain unit
// test). Proof here is BEHAVIORAL, not mere presence (rule 15, "attack, don't assert presence"): extract the
// exact declaration's right-hand-side expression as source text and EVALUATE it against every combination
// of injected/opts, the same way executor-parity.golden.mjs's own check 7 evaluates an extracted predicate.
const doReplaceLedgerMatch = codeOnly.match(
  /const\s+doReplaceLedger\s*=\s*(!!injected\s*&&\s*opts\?\.replaceLedger\s*===\s*true)\s*;/,
);
check(
  "the `doReplaceLedger` guard declaration is found, requiring BOTH `!!injected` and `opts?.replaceLedger === true`",
  !!doReplaceLedgerMatch,
);
if (doReplaceLedgerMatch) {
  const evalGuard = (injected, opts) => new Function("injected", "opts", `return ${doReplaceLedgerMatch[1]};`)(injected, opts);
  check(
    "ATTACK: bare replaceLedger:true with NO injected ledger is refused -- the documented caller-error case (a regression dropping `!!injected` from the guard would make this TRUE)",
    evalGuard(null, { replaceLedger: true }) === false,
  );
  check(
    "ATTACK: replaceLedger:true with injected undefined (opts omitted no injectedLedger key) is refused",
    evalGuard(undefined, { replaceLedger: true }) === false,
  );
  check(
    "an injected ledger present but replaceLedger not set stays false -- byte-for-byte non-destructive default",
    evalGuard([{ claim_text: "x" }], {}) === false,
  );
  check(
    "an injected ledger present but replaceLedger explicitly false stays false",
    evalGuard([{ claim_text: "x" }], { replaceLedger: false }) === false,
  );
  check(
    "the guard is true ONLY when BOTH an injected ledger AND replaceLedger:true are present -- the one case D29 actually wants archived",
    evalGuard([{ claim_text: "x" }], { replaceLedger: true }) === true,
  );
  check(
    "an empty-array injected ledger ([]) still counts as injected under `!!` (JS arrays are truthy regardless of length, matching groundBriefImpl's own `opts?.injectedLedger ?? null` semantics)",
    evalGuard([], { replaceLedger: true }) === true,
  );
}

console.log(failed ? `\nGOLDEN FAILED (${failed})` : "\nGOLDEN PASSED");
process.exit(failed ? 1 : 0);
