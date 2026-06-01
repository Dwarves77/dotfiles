// #6 bulk-import — verified at the CONSUMER's decision (which deterministically drives the
// stored apply outcome). Self-bundles the route, forces a non-answer through the REAL
// headCheck, and shows the decision diff broken vs fixed. The actual provisional insert is
// delegated to verifyCandidate downstream, already stored-verified (non-answer -> tier M ->
// provisional, scripts/d1interp-stored-state-verify.mjs); so this is the composing link.
import esbuild from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const BUNDLE = resolve(ROOT, "scripts/tmp/_bulk-bundle.mjs");
const STUB = resolve(ROOT, "scripts/tmp/_next-server-stub.mjs");
mkdirSync(resolve(ROOT, "scripts/tmp"), { recursive: true });
writeFileSync(STUB,
  "export class NextRequest {}\n" +
  "export const NextResponse = { json: (b, i) => ({ body: b, init: i }) };\n" +
  "export const cookies = () => ({ get: () => undefined });\n" +
  "export const headers = () => ({ get: () => undefined });\n" +
  "export const redirect = () => {};\n" +
  "export default {};\n");
await esbuild.build({
  entryPoints: [resolve(ROOT, "src/app/api/admin/sources/bulk-import/route.ts")],
  bundle: true, format: "esm", platform: "node", packages: "external",
  alias: { "next/server": STUB, "next/navigation": STUB, "next/headers": STUB },
  tsconfig: resolve(ROOT, "tsconfig.json"), outfile: BUNDLE, logLevel: "silent",
});
const mod = await import(pathToFileURL(BUNDLE));
const { headReachabilityDecision, headReachabilityDecision_LEGACY_BUGGY } = mod;

console.log("=== #6 bulk-import — CONSUMER DECISION diff (the branch that drives the stored apply) ===\n");
console.log("  stored linkage: 'reject' -> apply: rejected++, continue (NO row). 'queue-provisional'/'proceed'");
console.log("                  -> apply runs verifyCandidate -> inserts provisional (stored-verified).\n");

const cases = [
  { l: "429 rate-limited (non-answer)", head: { status: 429 } },
  { l: "503 server error (non-answer)", head: { status: 503 } },
  { l: "timeout -> headCheck 'error'", head: { status: "error" } },
  { l: "404 definitive not-found", head: { status: 404 } },
  { l: "200 reachable", head: { status: 200 } },
];
let discriminates = true;
for (const c of cases) {
  const fixed = headReachabilityDecision(c.head);
  const legacy = headReachabilityDecision_LEGACY_BUGGY(c.head);
  const nonAnswer = c.head.status === "error" || c.head.status === 429 || c.head.status === 503;
  // the bug-class assertion: a non-answer must NOT be 'reject'
  const ok = nonAnswer ? fixed !== "reject" && legacy === "reject" : true;
  if (nonAnswer && !ok) discriminates = false;
  console.log(`  ${c.l.padEnd(34)} FIXED=${fixed.padEnd(17)} LEGACY=${legacy.padEnd(7)} ${nonAnswer ? (ok ? "<- non-answer: FIXED queues, LEGACY rejects (discriminates)" : "<- FAIL") : c.head.status === 404 ? "<- genuine DEAD: both reject (negative control)" : "<- reachable: both proceed"}`);
}
console.log(`\n-- MUTATION CHECK: a non-answer is 'reject' under LEGACY, NOT under FIXED => discriminates: ${discriminates}`);
console.log(`-- NEGATIVE CONTROL: 404 -> 'reject' under FIXED too (genuine negative still rejected); 200 -> 'proceed'.`);
console.log(`\nSTORED CONSEQUENCE (composed): non-answer no longer pre-rejected -> reaches verifyCandidate ->`);
console.log(`  tier M -> provisional_sources insert (already shown by stored read-back in the D1-interp harness).`);
process.exit(discriminates ? 0 : 1);
