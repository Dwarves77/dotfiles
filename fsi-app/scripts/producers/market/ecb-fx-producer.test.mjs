// ecb-fx-producer.test.mjs — CLI-level proof for ecb-fx-producer.mjs (lane P2, build/wave-p2).
//
// Complements src/__tests__/market-ecb-fx-parser.test.mjs (which proves parseEcbFxXml, decideApply and
// the parser -> planner composition/idempotency in-process, zero subprocess). This file proves the same
// producer works as an actual CLI: --input bypasses the live fetch deterministically (so this test never
// depends on network reachability, sandboxed or not — matching fetch-oil-bulletin.mjs's own "WRITES
// NOTHING… no kill switch of its own" posture for the fetch half, except here fetch+parse+plan are one
// script, so --input is the seam this test exercises instead), and a dry run never requires DB creds.
//
// LOCATION: scripts/producers/*/*.test.mjs is a run-test-suite.sh glob (no-npm gate) — this file matches
// it exactly, same directory as the producer it tests, same convention
// scripts/producers/regional/run-envelope-producer.test.mjs already uses for a producer-adjacent proof.
//
// $0: spawns the real script as a subprocess (node --test cannot import ecb-fx-producer.mjs's module
// scope twice with different argv, and the CLI's argv/stdin/exit-code contract is exactly what a
// subprocess proves) — no network, no database.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PRODUCER_PATH = resolve(HERE, "ecb-fx-producer.mjs");

const FIXTURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<Cube>
		<Cube time="2026-08-28">
			<Cube currency="USD" rate="1.1801"/>
			<Cube currency="GBP" rate="0.8623"/>
			<Cube currency="CNY" rate="8.4123"/>
			<Cube currency="JPY" rate="164.63"/>
			<Cube currency="AUD" rate="1.7912"/>
		</Cube>
	</Cube>
</gesmes:Envelope>
`;

function withFixtureFile(fn) {
  const path = join(tmpdir(), `ecb-fx-cli-fixture-${process.pid}-${Math.random().toString(36).slice(2)}.xml`);
  writeFileSync(path, FIXTURE_XML);
  try {
    return fn(path);
  } finally {
    rmSync(path, { force: true });
  }
}

function runCli(args, envOverrides = {}) {
  // NO_PROXY-equivalent isolation isn't needed: --input means fetchEcbFxXml is never called, so this
  // subprocess makes zero network attempts regardless of sandbox/CI egress policy.
  return spawnSync(process.execPath, [PRODUCER_PATH, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...envOverrides },
  });
}

test("dry run via --input: exit 0, reports 4 tracked rows, 1 unrecognised-currency warning, plans 4 creates, writes nothing", () => {
  withFixtureFile((path) => {
    const res = runCli(["--input", path]);
    assert.equal(res.status, 0, `expected exit 0, got ${res.status}. stderr: ${res.stderr}`);
    assert.match(res.stdout, /parsed 4 row\(s\)/);
    assert.match(res.stdout, /DRY RUN/);
    assert.match(res.stdout, /4 to create, 0 to update, 0 skipped/);
    assert.match(res.stdout, /would create {2}ecb-fx:eur-usd @ 2026-08-28 {2}1\.1801 USD\/EUR/);
    assert.match(res.stderr, /not in this lane's closed vocabulary/, "AUD must warn, not silently vanish");
  });
});

test("dry run reads from stdin exactly like --input (same CSV/XML-in-from-somewhere contract oil-bulletin uses)", () => {
  const res = spawnSync(process.execPath, [PRODUCER_PATH], {
    encoding: "utf8",
    input: FIXTURE_XML,
    env: process.env,
  });
  assert.equal(res.status, 0, `expected exit 0, got ${res.status}. stderr: ${res.stderr}`);
  assert.match(res.stdout, /parsed 4 row\(s\)/);
});

// UPDATED 2026-09-02 (Lane PROD, system-completion train): ENABLED flipped false -> true in
// ecb-fx-producer.mjs (see its own header's REVIEWED-CHANGE LOG) in the same commit as migration 281
// (registers source_key 'ecb'). The two tests below used to prove the ENABLED-off refusal was the shipped,
// default state; with ENABLED now true, the FIRST gate the CLI hits on a bare --apply is the runtime kill
// switch (MARKET_PRODUCER_ECB_FX_ENABLED), which still defaults off in every environment — that is now
// the shipped default-refusal path, and these tests are updated to prove exactly that, distinctly from the
// DB-creds refusal one gate further in. decideApply's own gate ORDER (ENABLED, then kill switch, then
// creds) is unit-proven directly in market-ecb-fx-parser.test.mjs and is unchanged by this update.

test("--apply with the shipped, default state (ENABLED true, kill switch OFF) refuses on the kill switch — exit 1, no creds needed to prove the refusal", () => {
  withFixtureFile((path) => {
    // Deliberately NO NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY and NO kill-switch env var —
    // if the kill switch correctly gates before a creds check, none of that is even reached.
    const res = runCli(["--input", path, "--apply"]);
    assert.equal(res.status, 1, `expected exit 1, got ${res.status}. stdout: ${res.stdout} stderr: ${res.stderr}`);
    assert.match(res.stderr, /kill switch.*OFF/);
  });
});

test("--apply with the kill switch ON but no DB creds still refuses, distinctly (proves the THIRD gate is reachable and separate from the kill switch)", () => {
  withFixtureFile((path) => {
    const res = runCli(["--input", path, "--apply"], { MARKET_PRODUCER_ECB_FX_ENABLED: "1" });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /DB creds/, "with ENABLED true and the kill switch on, the next gate is DB creds, not another ENABLED refusal");
  });
});

// NOT TESTED HERE, DELIBERATELY: a fourth CLI-level test with every runtime gate satisfied (kill switch
// on, fake DB creds present) would need an actual network attempt against a fake Supabase URL to prove
// control passes the gates — its outcome (DNS failure vs. timeout vs. a real response) is environment-
// dependent in the same way the live-fetch path below is, and main()'s own top-level `.catch` turns ANY
// thrown error, gate refusal or genuine network failure alike, into the same exit 1. The "every gate
// satisfied" transition is instead proven where it belongs and IS deterministic: decideApply's own pure
// unit tests in market-ecb-fx-parser.test.mjs ("--apply only writes when EVERY gate is satisfied").
//
// NOT TESTED HERE, DELIBERATELY: the "no --input, no stdin content" path falls through to a LIVE fetch
// (fetchEcbFxXml). Its outcome is environment-dependent — this sandbox's egress to every ecb.europa.eu
// host returns a 403 policy denial (exit 3, NetworkError), but a GitHub runner or an operator's machine
// may reach it and succeed (exit 0, real data). A test asserting either outcome would be flaky across
// environments by construction, not a real defect either way — so this lane proves the deterministic
// paths (explicit --input, explicit stdin content, the gate refusals) and leaves the live-fetch branch to
// the same primary-source verification fetch-oil-bulletin.mjs's header asks a runner/browser to perform
// (see this producer's own header, "UNCONFIRMED THIS SESSION").
//
// ALSO NOT TESTED HERE: migration 281's live FK gate itself (whether 'ecb' actually resolves in
// public.data_sources) — that is a live-database fact this in-process/subprocess test suite has no
// credentials to observe. It is proven structurally instead: migration 281's own post-check DO block
// asserts the row is embeddable and appears in licence_clear_sources before the migration can commit.
