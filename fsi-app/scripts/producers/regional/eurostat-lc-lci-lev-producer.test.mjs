// Lane L35 (F46 external-host-home): ec.europa.eu's one home is EUROSTAT_DISSEMINATION_API_BASE, exported
// from this file (this file is the safe import target -- it guards its own CLI run behind IS_MAIN, unlike
// its sibling eurostat-nrg-pc-205-producer.mjs, which runs unconditionally at module load; see that file's
// own F46 comment). fetchAllMemberStates takes an injected fetchImpl, so this test makes NO real network
// call and never triggers this module's own IS_MAIN-guarded main().
// Run: node --test scripts/producers/regional/eurostat-lc-lci-lev-producer.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import {
  EUROSTAT_DISSEMINATION_API_BASE, fetchAllMemberStates, decideApply,
} from "./eurostat-lc-lci-lev-producer.mjs";

test("EUROSTAT_DISSEMINATION_API_BASE: the one exported constant every Eurostat producer composes from", () => {
  assert.equal(EUROSTAT_DISSEMINATION_API_BASE, "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data");
});

test("fetchAllMemberStates: builds the lc_lci_lev URL shape for each member geo (injected fetch, no network)", async () => {
  const requested = [];
  const fakeFetch = async (url) => {
    requested.push(url);
    return { ok: true, json: async () => ({ value: {}, dimension: {} }) };
  };
  await fetchAllMemberStates(fakeFetch);
  assert.ok(requested.length > 0, "expected at least one request");
  for (const u of requested) {
    assert.match(u, /^https:\/\/ec\.europa\.eu\/eurostat\/api\/dissemination\/statistics\/1\.0\/data\/lc_lci_lev\?format=JSON&lang=EN&geo=/);
  }
});

test("decideApply: dry run never writes; every gate must hold for --apply to write", () => {
  assert.equal(decideApply({ apply: false, enabled: true, killSwitchOn: true, hasCreds: true }).canWrite, false);
  assert.equal(decideApply({ apply: true, enabled: false, killSwitchOn: true, hasCreds: true }).canWrite, false);
  assert.equal(decideApply({ apply: true, enabled: true, killSwitchOn: false, hasCreds: true }).canWrite, false);
  assert.equal(decideApply({ apply: true, enabled: true, killSwitchOn: true, hasCreds: false }).canWrite, false);
  assert.equal(decideApply({ apply: true, enabled: true, killSwitchOn: true, hasCreds: true }).canWrite, true);
});

// ── Sweep (lane L35, F46 external-host-home; models eurlex-cellar.mjs's own sweep). Fails the build the
// moment a second copy of the host string appears anywhere in scope.
test("ONE home for ec.europa.eu: no other in-scope source file builds this host's URL", () => {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const files = execFileSync("git", ["ls-files", "--", "fsi-app/scripts", "fsi-app/src"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.(mjs|js|ts|tsx)$/.test(f) && !/\.(test|npmtest|selftest|golden)\.mjs$/.test(f) && !/\/fixtures\//.test(f));
  const EXCEPTIONS = new Set(["fsi-app/scripts/producers/regional/eurostat-lc-lci-lev-producer.mjs"]);
  const hostRe = /https?:\/\/ec\.europa\.eu/;
  const offenders = [];
  for (const f of files) {
    if (EXCEPTIONS.has(f)) continue;
    const src = readFileSync(resolve(root, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    if (hostRe.test(src)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], "import scripts/producers/regional/eurostat-lc-lci-lev-producer.mjs's EUROSTAT_DISSEMINATION_API_BASE instead of building an ec.europa.eu URL in: " + offenders.join(", "));
});
