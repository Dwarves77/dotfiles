// SeedFallbackTrigger vocabulary proof (lane rsc503, 2026-09-08).
//
// THE DEFECT THIS TEST WOULD HAVE CAUGHT. `SeedFallbackTrigger` has named `"timeout"` since
// SF-2, and until this lane NOTHING in src/ ever wrote it. Every real timeout was reported as
// something else:
//
//   - supabase-server's `withTimeout` RESOLVED with an empty fallback tuple, so the caller fell
//     into its own `!resources.length` branch and recorded `"rpc_error"`. A timeout is not an
//     RPC error.
//   - lib/data.ts's own 10s races rejected with a bare `new Error("timeout")`, indistinguishable
//     from any other exception, so they recorded `"exception"`.
//
// The trigger is not decoration: `recordSeedFallbackFlag` writes it to the platform integrity_flag
// queue, and `RECOMMENDED_ACTION` keys the operator's remediation off it. The admin queue was being
// told the database had rejected a query when in fact the query never came back — a wrong number on
// one screen sourced from a value the code could not produce. This test fails if any member of the
// vocabulary loses its writer again, in either direction.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const SRC = resolve(ROOT, "src");

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": SRC } });
const { ReadTimeoutError, isReadTimeout } = await jiti.import("../supabase-server.ts");

function tsFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "_archive") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) tsFiles(full, acc);
    else if (/\.tsx?$/.test(name)) acc.push(full);
  }
  return acc;
}

test("every SeedFallbackTrigger member has a writer in src/", () => {
  const decl = readFileSync(resolve(SRC, "lib/notifications/seed-fallback-flag.ts"), "utf8");
  const block = decl.slice(decl.indexOf("export type SeedFallbackTrigger"));
  const members = [...block.slice(0, block.indexOf(";")).matchAll(/"([a-z_A-Z]+)"/g)].map((m) => m[1]);
  assert.ok(members.length >= 6, `expected the full vocabulary, read ${JSON.stringify(members)}`);
  assert.ok(members.includes("timeout"), "the vocabulary must still name timeout");

  const corpus = tsFiles(SRC)
    .filter((f) => !f.endsWith("seed-fallback-flag.ts"))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");

  // `service_role_missing` is the one member no CALLER can ever supply, and that is ruled, not
  // accidental: seed-fallback-flag.ts's own header records the operator ruling of 2026-07-13 that
  // the env-missing case "can't self-record (the write needs the missing key)". It is detected
  // inside recordSeedFallbackFlag by reading the env directly, and logged [UNRECORDABLE]. Asserted
  // here rather than skipped, so the exemption stays tied to the mechanism that justifies it.
  const unwritableByDesign = new Set(["service_role_missing"]);
  assert.ok(
    decl.includes("[UNRECORDABLE]") || readFileSync(resolve(SRC, "lib/notifications/seed-fallback-flag.ts"), "utf8").includes("[UNRECORDABLE]"),
    "service_role_missing is exempt only while the [UNRECORDABLE] env branch that detects it exists",
  );

  for (const member of members) {
    if (unwritableByDesign.has(member)) continue;
    assert.ok(
      corpus.includes(`"${member}"`),
      `SeedFallbackTrigger "${member}" is named by the type but written by nothing: either a code path stopped reporting it, or the member is dormant vocabulary`,
    );
  }
});

test("a bounded read that runs out of time rejects, and is identifiable as a timeout", async () => {
  const e = new ReadTimeoutError(8000);
  assert.equal(isReadTimeout(e), true);
  assert.equal(isReadTimeout(new Error("Supabase read exceeded 8000ms")), false, "the message must not be the discriminator");
  assert.equal(isReadTimeout(undefined), false);
  assert.match(e.message, /8000/);
});

test("withTimeout rejects rather than resolving an empty stand-in payload", () => {
  // Structural: a wrapper that RESOLVES a fallback cannot be told apart from a successful read
  // that happened to return nothing, which is exactly how the timeout became an rpc_error.
  const src = readFileSync(resolve(SRC, "lib/supabase-server.ts"), "utf8");
  const body = src.slice(src.indexOf("function withTimeout"), src.indexOf("export async function fetchDashboardData"));
  assert.ok(body.includes("reject(new ReadTimeoutError"), "withTimeout must reject with ReadTimeoutError");
  assert.ok(!/resolve\(fallback\)/.test(body), "withTimeout must not resolve a stand-in payload");
  assert.ok(body.includes("clearTimeout"), "the losing timer must be cleared, or every read leaks one");

  // And no caller may still be passing a fallback tuple as a third argument.
  for (const m of src.matchAll(/await withTimeout\(/g)) {
    const call = src.slice(m.index, src.indexOf("\n    );", m.index));
    const argLines = call.split("\n").filter((l) => /^\s*\d+,?\s*(\/\/.*)?$/.test(l));
    assert.equal(argLines.length, 1, "withTimeout takes exactly a promise and a millisecond bound");
  }
});

test("the failure state names a reason, and it is keyed on the same trigger the flag queue records", async () => {
  const { describeFallbackTrigger } = await jiti.import("../supabase-server.ts");

  // THE DEFECT THIS WOULD HAVE CAUGHT: "Data temporarily unavailable. Refresh to retry." was the
  // whole of what production told the reader — no reason, and no retry that could fire, because
  // the refresh was answered from the poisoned cache entry (see lib/cache/fallback-guard.ts).
  assert.match(describeFallbackTrigger("timeout"), /time limit/);
  assert.match(describeFallbackTrigger("rpc_error"), /no rows/);
  assert.match(describeFallbackTrigger("exception"), /failed/);
  assert.match(describeFallbackTrigger("supabase_not_configured"), /not configured/);
  assert.match(describeFallbackTrigger("service_role_missing"), /not configured/);

  // `null_orgId` is ruled NOT a degradation (operator ruling 2026-07-13): an anonymous or
  // no-membership render of a public page. Telling that reader the system failed would be false.
  assert.equal(describeFallbackTrigger("null_orgId"), undefined);
  assert.equal(describeFallbackTrigger(undefined), undefined);

  // Every surface that renders the sentinel renders the reason with it, or one screen says less
  // than another about the same failure.
  for (const route of ["community", "settings", "regulations", "map"]) {
    const src = readFileSync(resolve(SRC, `app/${route}/page.tsx`), "utf8");
    const line = src.split("\n").find((l) => l.includes("<SystemErrorBanner"));
    assert.ok(line, `${route}/page.tsx should render SystemErrorBanner`);
    assert.ok(
      line.includes("describeFallbackTrigger"),
      `${route}/page.tsx renders the sentinel without its reason clause`,
    );
  }
  const dash = readFileSync(resolve(SRC, "app/page.tsx"), "utf8");
  assert.ok(dash.includes("fetchErrorReason={describeFallbackTrigger("), "the dashboard renders the reason too");
});
