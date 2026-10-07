// gate-a-probe.mjs (lane OPS-1, 2026-10-07). The Gate A honesty assertion of
// .github/workflows/uptime-probes.yml, as a script so the decision is unit-tested instead of living as
// untested shell. Usage: node scripts/health/gate-a-probe.mjs <path-to-/api/health/surfaces-response.json>
// Prints one line per gauge (state named) and exits 1 on an unreadable gauge or a computed alarm above 0,
// 0 otherwise (a not_computed gauge passes with a warning line). The decision is src/lib/health/gate-a-gauges.mjs.
import { readFileSync } from "node:fs";
import { decideGateAProbe } from "../../src/lib/health/gate-a-gauges.mjs";
import { isMainModule } from "../lib/is-main.mjs";

export function runProbe(path, log = console.log) {
  let gate_a;
  try {
    gate_a = JSON.parse(readFileSync(path, "utf8"))?.gate_a;
  } catch (e) {
    log(`ERROR response body unreadable (${e instanceof Error ? e.message : "parse"}), fail-closed`);
    return 1;
  }
  const { fail, lines } = decideGateAProbe(gate_a);
  for (const l of lines) log(l);
  log(fail ? "Gate-A honesty assertion FAILED" : "Gate-A honesty assertion passed (see per-gauge states above)");
  return fail ? 1 : 0;
}

if (isMainModule(import.meta.url)) process.exit(runProbe(process.argv[2]));
