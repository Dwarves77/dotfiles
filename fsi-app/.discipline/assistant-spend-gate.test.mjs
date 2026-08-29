// ASSISTANT SPEND GATE (ADR-020-era operator doctrine, guard added 2026-08-28).
//
// THE DEFECT THIS PINS: /api/ask is the platform's only user-triggered paid path. Under the BUILD-PHASE
// spend regime the sole dollar gate is the operator-priced line, and this route carries none — so with no
// enablement gate it could spend while sitting outside the authorization model entirely. It did: 3 paid
// `agent_runs` rows on 2026-08-12/13 ($0.0688, purpose "ask-assistant") landed while the Assistant was
// believed OFF, because OFF was enforced by non-use rather than by code.
//
// WHY A SOURCE-TEXT TEST: this repo has no component/route render harness (the same constraint F26 and
// the prose-renderer scope guard record). The invariants below are therefore asserted against the route's
// source, and the ORDERING assertion is the load-bearing one — a gate that exists but sits after the paid
// call would read as present while spending anyway.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// HOME: this guard lives in .discipline/ (not src/__tests__/) for the same reason F15 does — rule 016
// excludes the discipline engine because it "references the API pattern to ENFORCE it, never to call it."
// A detector that names api.anthropic.com is indistinguishable from a caller to a text scan; the engine is
// where that exemption is granted. vocab-drift-guard.test.mjs is the precedent: a guard scanning app source.
const ROUTE = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "app", "api", "ask", "route.ts");
const src = readFileSync(ROUTE, "utf8");

// CODE-ONLY VIEW. The direct-API scan below must read CODE, not prose: this route's own comments
// legitimately NAME the pattern they warn against ("...api.anthropic.com fetch on a customer path — an
// ungated, untelemetried spend site"), and a naive text scan flags that sentence as the very violation it
// documents. Caught by this test failing on its own first run. Comments are stripped before scanning;
// the structural assertions above deliberately keep using the raw source.
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("assistant gate: enablement is fail-closed on an exact string, never a truthy env read", () => {
  assert.ok(
    /const\s+ASSISTANT_ENABLED\s*=\s*process\.env\.ASSISTANT_ENABLED\s*===\s*["']true["']/.test(src),
    'ASSISTANT_ENABLED must be a strict === "true" comparison. A truthy read (process.env.X, !!X, or ' +
      '"1"/"yes" handling) turns any stray value into an ON state — the failure mode is spend, so this ' +
      "gate fails closed or it is not a gate.",
  );
});

test("assistant gate: a disabled Assistant refuses the request", () => {
  assert.ok(
    /if\s*\(\s*!ASSISTANT_ENABLED\s*\)/.test(src),
    "The route must refuse when ASSISTANT_ENABLED is false. Reading the flag without branching on it is " +
      "a control surface that lies (the spend-regime lesson: a deployed env var nothing acts on).",
  );
});

test("assistant gate: the refusal precedes every paid call (ordering is the real invariant)", () => {
  const gateIdx = src.indexOf("if (!ASSISTANT_ENABLED)");
  assert.ok(gateIdx > 0, "enablement gate not found");

  // Every site that can reach the Anthropic chokepoint must come AFTER the gate.
  for (const marker of ["setSpendTicket(", "spendStreamRaw("]) {
    const callIdx = src.indexOf(marker);
    assert.ok(callIdx > 0, `expected the route to call ${marker} through the spend chokepoint`);
    assert.ok(
      gateIdx < callIdx,
      `${marker} appears BEFORE the ASSISTANT_ENABLED gate (gate@${gateIdx}, call@${callIdx}). A gate ` +
        "downstream of the paid call does not prevent spend — it only reports it afterwards.",
    );
  }
});

test("assistant gate: the route still routes through the spend chokepoint (F15), not a raw API call", () => {
  assert.ok(
    /from\s+["']@\/lib\/llm\/spend-client["']/.test(src),
    "The route must call the model through spend-client (the F15 chokepoint), so the unlogged-ledger " +
      "invariant and telemetry stay intact. A direct fetch would bypass both.",
  );
  assert.ok(
    !/api\.anthropic\.com|["']x-api-key["']|new\s+Anthropic\b/.test(code),
    "The route must not make a direct Anthropic API call — that is an F15 violation and an unmetered path.",
  );
});
