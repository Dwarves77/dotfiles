// D3 drift-check — LAYER 3 (real-artifact reconstruction). READ-ONLY (reads source).
//
// Proves the drift-check catches the REAL Browserless drift, is NOT fooled by the
// real stale comment (the actual `verification.ts` says "browserlessRender is
// overkill" — a text predicate would false-IMPLEMENT off it), reports the real
// caller IMPLEMENTED, and reports proxy.ts UNCONFIRMABLE (runtime).
import { DRIFT, evaluateAnchor, textGrepHas } from "./drift-check.mjs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const f = (p) => resolve(ROOT, p);
let fails = 0;
const expect = (label, got, want) => {
  const ok = got === want;
  console.log(`  [${ok ? "OK" : "FAIL"}] ${label}: ${got} (want ${want})`);
  if (!ok) fails++;
};

console.log("=== drift-check L3 — real-artifact reconstruction ===");

// 1. REAL Browserless drift: verification.ts MENTIONS browserlessRender in a comment
//    but does NOT call it (uses plain fetch). AST → DRIFTED.
const verif = f("src/lib/sources/verification.ts");
expect(
  "verification.ts AST calls(browserlessRender)",
  evaluateAnchor({ decision: "all-Browserless", file: verif, predicate: { kind: "calls", callee: "browserlessRender" } }).verdict,
  DRIFT.DRIFTED
);
// the trap, demonstrated on the REAL file:
const textHas = textGrepHas(verif, "browserlessRender");
console.log(`  TEXT grep "browserlessRender" in verification.ts = ${textHas} -> a text predicate would WRONGLY report ${textHas ? "IMPLEMENTED" : "DRIFTED"} (the real stale-comment trap)`);
if (!textHas) { console.error("  (expected the comment token present to demonstrate the trap)"); fails++; }
expect(
  "verification.ts AST noRawSourceFetch",
  evaluateAnchor({ decision: "all-Browserless", file: verif, predicate: { kind: "noRawSourceFetch" } }).verdict,
  DRIFT.DRIFTED
);

// 2. POSITIVE control: fetch-now really CALLS browserlessRender → IMPLEMENTED.
expect(
  "fetch-now AST calls(browserlessRender)",
  evaluateAnchor({ decision: "all-Browserless", file: f("src/app/api/admin/sources/[id]/fetch-now/route.ts"), predicate: { kind: "calls", callee: "browserlessRender" } }).verdict,
  DRIFT.IMPLEMENTED
);

// 3. proxy.ts runtime pickup → UNCONFIRMABLE (loud, not a pass).
expect(
  "proxy.ts runtime pickup",
  evaluateAnchor({ decision: "proxy.ts is Next-16 middleware", file: f("src/proxy.ts"), predicate: { kind: "runtime", desc: "middleware actually loads at runtime" } }).verdict,
  DRIFT.UNCONFIRMABLE
);

console.log(`\n${fails === 0 ? "drift-check L3 PASS — DRIFTED on the real drift (AST, not fooled by the comment), IMPLEMENTED on the real caller, UNCONFIRMABLE on proxy.ts" : fails + " L3 FAILURE(S)"}`);
process.exitCode = fails === 0 ? 0 : 1;
