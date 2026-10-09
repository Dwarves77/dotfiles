// run-rendering-guard.test.mjs (lane GATE-9, 2026-10-08): the sibling test run-rendering-guard.mjs never had.
// AUD-AT-5 OWED-9 / RG-1 / RG-2: the register could not oracle-test a neutered guard because no test executed
// or even read the script, and the workflow step that wraps it was changed (a `status=0` reset before the exit)
// without any gate noticing. The guard needs Playwright and a browser, neither of which the no-npm suite has, so
// this test cannot run it; it pins the one thing the CI job depends on and that a one-line edit can destroy: THE
// EXIT STATUS CONTRACT, read from the script's own code (comments and string literals removed).
//   exit 0  only when realFailures is empty, and nowhere else;
//   exit 1  after the FAILURE(S) report, i.e. whenever realFailures is not empty;
//   exit 2  only from the main().catch handler (an engine error);
//   process.exit is never reassigned, process.exitCode is never assigned, and main() runs only behind
//   isMainModule().
// The behavioral half (a failing layout makes the real script exit 1) is proven where Playwright exists: the
// rendering-guard job itself, whose step is pinned by F52-workflow-file-validity.test.mjs to exit with the
// guard's own status.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = readFileSync(join(HERE, "run-rendering-guard.mjs"), "utf8");
const BT = String.fromCharCode(96);
const EMPTY_TEMPLATE = BT + BT;

/** The source with block comments, line comments and the CONTENT of string and template literals removed, so an
 *  exit call or a status assignment in prose cannot satisfy or defeat a check. Small and honest: it tracks
 *  quotes and `${...}` depth well enough for this one file, and the first test proves it did not eat code. */
function codeOnly(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); i = e === -1 ? n : e + 2; continue; }
    if (c === "/" && d === "/") { const e = src.indexOf("\n", i); i = e === -1 ? n : e; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
      out += c + c; i = j + 1; continue;
    }
    if (c === BT) {
      let j = i + 1; let depth = 0;
      while (j < n) {
        if (src[j] === "\\") { j += 2; continue; }
        if (depth === 0 && src[j] === BT) break;
        if (src[j] === "$" && src[j + 1] === "{") { depth++; j += 2; continue; }
        if (depth > 0 && src[j] === "}") { depth--; j++; continue; }
        j++;
      }
      out += EMPTY_TEMPLATE; i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}

/** Everything the exit-status contract requires of the script, as a list of violations (empty = holds). */
function contractProblems(src) {
  const code = codeOnly(src);
  const problems = [];
  const calls = [...code.matchAll(/process\.exit\(([^)]*)\)/g)].map((m) => m[1].trim()).sort();
  if (JSON.stringify(calls) !== JSON.stringify(["0", "1", "2"])) problems.push(`process.exit calls are ${JSON.stringify(calls)}, expected exactly 0, 1, 2`);
  if (/process\.exitCode\s*=/.test(code)) problems.push("process.exitCode is assigned");
  if (/process\.exit\s*=[^=]/.test(code) || /process\s*\[\s*["']exit["']\s*\]\s*=/.test(code)) problems.push("process.exit is reassigned (the neutered form)");
  const pass = code.match(/if \(realFailures\.length === 0\) \{([^}]*)\}/);
  if (!pass || !/process\.exit\(0\)/.test(pass[1])) {
    problems.push("exit(0) is not inside the realFailures.length === 0 branch");
  } else {
    const after = code.slice(code.indexOf(pass[0]) + pass[0].length);
    const fallThrough = /^\s*console\.error\(``\);?\s*for \(const f of realFailures\)[^;]*;\s*console\.error\(``\);\s*process\.exit\(1\);/s;
    if (!fallThrough.test(after)) problems.push("the fall-through after the pass branch does not report realFailures and exit 1");
  }
  if (!/const realFailures = failures\.filter\(\(f\) => \{/.test(code)) {
    problems.push("realFailures is not failures.filter(...)");
  } else {
    const start = code.indexOf("const realFailures");
    const body = code.slice(start, code.indexOf("console.log(``)", start));
    const returns = [...body.matchAll(/return (true|false);/g)].map((m) => m[1]).join(",");
    if (returns !== "false,false,true") problems.push("a failure can be dropped other than by a dated exemption");
  }
  const guard = code.match(/if \(isMainModule\(import\.meta\.url\)\) \{([\s\S]*?)\n\}/);
  if (!guard || !/main\(\)\.catch\(\(e\) => \{[^}]*process\.exit\(2\);/s.test(guard[1])) problems.push("main() is not run behind isMainModule() with an exit(2) catch");
  if ([...code.matchAll(/\bmain\(\)/g)].length !== 2) problems.push("main() is called somewhere other than the entry guard");
  return problems;
}

test("the comment and string stripper keeps the code: main, the guard call and the exit calls survive", () => {
  const code = codeOnly(RAW);
  assert.match(code, /async function main\(\)/);
  assert.match(code, /isMainModule\(import\.meta\.url\)/);
  assert.ok((code.match(/process\.exit\(/g) ?? []).length >= 3);
  assert.ok(!code.includes("RENDERING GUARD"), "string content is removed");
});

test("RG-3: the committed script keeps the exit-status contract", () => {
  assert.deepEqual(contractProblems(RAW), []);
});

test("RG-3 attacks: every way of neutering the guard's exit status is caught", () => {
  const mutate = (from, to) => {
    assert.ok(RAW.includes(from), "attack fixture text is present in the script: " + from);
    return RAW.replace(from, () => to);
  };
  const attacks = {
    "the failing exit becomes 0": mutate("process.exit(1);\n}\n\nif (isMainModule", "process.exit(0);\n}\n\nif (isMainModule"),
    "the engine-error exit becomes 0": mutate("process.exit(2);", "process.exit(0);"),
    "process.exit is wrapped to always exit 0 (the N3 form)": "process.exit = () => {};\n" + RAW,
    "process.exitCode is reset": mutate("await browser.close();", "await browser.close(); process.exitCode = 0;"),
    "an early exit(0) is added": mutate("const fixtures = buildFixtures();", "const fixtures = buildFixtures(); if (process.env.X) process.exit(0);"),
    "a finding is dropped without an exemption": mutate("    return true;\n  });", "    return false;\n  });"),
    "main() runs unguarded": RAW + "\nmain();\n",
  };
  for (const [name, src] of Object.entries(attacks)) {
    assert.notDeepEqual(contractProblems(src), [], "not caught: " + name);
  }
});

// ── DFIX-2 (register 21, p1 116, p2 108): the row guard measures every layout's own width ──────────────────────
// The list row has four layouts (phone, stacked 768 to 1023, mid 1024 to 1279, wide 1280+, PAR-1), and every
// UX smoke spec runs at UX_VIEWPORTS. A list that drops 768 or 1024 would let the stacked and mid layouts go
// unmeasured again (the gap the register recorded when only 375 and 1280 were measured). ux-harness.mjs needs
// Playwright's esbuild, so this reads it as text, like the exit-status contract above.
const HARNESS = readFileSync(join(HERE, "smoke", "ux-harness.mjs"), "utf8");

/** The widths UX_VIEWPORTS resolves to, read from a harness source: each `NAME = Object.freeze({ width: N` constant
 *  and the names listed in the UX_VIEWPORTS array. null when either is missing. */
function uxViewportWidths(src) {
  const widths = new Map();
  for (const m of src.matchAll(/export const (\w+_VIEWPORT) = Object\.freeze\(\{\s*width:\s*(\d+)/g)) widths.set(m[1], Number(m[2]));
  const list = /export const UX_VIEWPORTS = Object\.freeze\(\[([^\]]*)\]\)/.exec(src);
  if (!list) return null;
  const names = list[1].split(",").map((x) => x.trim()).filter(Boolean);
  if (names.some((n) => !widths.has(n))) return null;
  return names.map((n) => widths.get(n));
}

test("DFIX-2: the row guard's UX viewports are 375, 768, 1024 and 1280 (one per row layout)", () => {
  assert.deepEqual(uxViewportWidths(HARNESS), [375, 768, 1024, 1280]);
});

test("DFIX-2 attacks: dropping the stacked or mid width from UX_VIEWPORTS is caught", () => {
  const dropTablet = HARNESS.replace("[MOBILE_VIEWPORT, TABLET_VIEWPORT, MID_VIEWPORT, DESKTOP_VIEWPORT]", "[MOBILE_VIEWPORT, MID_VIEWPORT, DESKTOP_VIEWPORT]");
  const dropMid = HARNESS.replace("[MOBILE_VIEWPORT, TABLET_VIEWPORT, MID_VIEWPORT, DESKTOP_VIEWPORT]", "[MOBILE_VIEWPORT, TABLET_VIEWPORT, DESKTOP_VIEWPORT]");
  const retype = HARNESS.replace(/TABLET_VIEWPORT = Object\.freeze\(\{ width: 768/, "TABLET_VIEWPORT = Object.freeze({ width: 700");
  assert.notDeepEqual(uxViewportWidths(dropTablet), [375, 768, 1024, 1280]);
  assert.notDeepEqual(uxViewportWidths(dropMid), [375, 768, 1024, 1280]);
  assert.notDeepEqual(uxViewportWidths(retype), [375, 768, 1024, 1280]);
  assert.equal(uxViewportWidths("export const UX_VIEWPORTS = nothing"), null);
});
