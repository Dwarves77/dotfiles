/**
 * sprint4-114-spancheck-test.mjs — task 1.14 unit test, NO dev server needed.
 * Compiles span-check.ts and asserts that an unreachable URL throws RetryableError
 * (the timeout/network -> retry-then-stage policy). The WDK retry LOOP itself is
 * runtime (workflow) scope; this proves the throw behavior the loop depends on.
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
mkdirSync("./.spancheck-out", { recursive: true });
writeFileSync("./.spancheck-out/tsconfig.json", JSON.stringify({
  compilerOptions: { target: "es2022", module: "es2022", moduleResolution: "bundler", esModuleInterop: true, rootDir: "../src/lib/agent", outDir: "./out", strict: false, skipLibCheck: true },
  include: ["../src/lib/agent/span-check.ts"],
}));
execSync("npx tsc -p ./.spancheck-out/tsconfig.json", { stdio: "inherit" });
const { spanCheckFetch } = await import(`file://${resolve(ROOT, ".spancheck-out", "out", "span-check.js")}`);

let fail = 0;
const check = (name, cond, d = "") => { console.log(`  [${cond ? "PASS" : "FAIL"}] ${name} ${d}`); if (!cond) fail++; };

// Closed port -> ECONNREFUSED (network error) -> RetryableError.
let threw = null;
try {
  await spanCheckFetch("http://127.0.0.1:1/", 2000);
} catch (e) {
  threw = e;
}
check("unreachable URL throws", threw !== null, threw ? `(${threw.name}: ${String(threw.message).slice(0, 80)})` : "(did not throw)");
check(
  "thrown error is RetryableError",
  !!threw && (threw.constructor?.name === "RetryableError" || /RetryableError/.test(String(threw?.constructor?.name))),
  threw ? `ctor=${threw.constructor?.name}` : ""
);

console.log(`\n${fail === 0 ? "ALL PASS" : fail + " FAIL"} — 1.14 span-check timeout test`);
rmSync("./.spancheck-out", { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
