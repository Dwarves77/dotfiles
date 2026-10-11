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
