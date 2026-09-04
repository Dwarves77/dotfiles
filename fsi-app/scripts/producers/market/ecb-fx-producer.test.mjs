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
	<gesmes:Sender>
		<gesmes:name>European Central Bank</gesmes:name>
	</gesmes:Sender>
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

// The LIVE shape (root cause of producers run #22, 2026-09-04 00:50 UTC — see ecb-fx-producer.mjs's own
// header): single-quoted attributes, tab indentation. Built from the coordinator's own live re-fetch
// (GitHub Codespace, 2026-09-04 00:58 UTC, HTTP 200, text/xml, 1547 bytes) — same disclosure as
// market-ecb-fx-parser.test.mjs's own ECB_FIXTURE_XML_SINGLE_QUOTED: leading shape/currency order is
// verbatim, trailing rate values are illustrative test data, not asserted live figures.
const FIXTURE_XML_SINGLE_QUOTED = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<gesmes:subject>Reference rates</gesmes:subject>
	<gesmes:Sender>
		<gesmes:name>European Central Bank</gesmes:name>
	</gesmes:Sender>
	<Cube>
		<Cube time='2026-09-03'>
			<Cube currency='USD' rate='1.1615'/>
			<Cube currency='JPY' rate='181.21'/>
			<Cube currency='CZK' rate='24.221'/>
			<Cube currency='DKK' rate='7.4746'/>
			<Cube currency='GBP' rate='0.86055'/>
			<Cube currency='HUF' rate='367.43'/>
			<Cube currency='CNY' rate='8.2891'/>
		</Cube>
	</Cube>
</gesmes:Envelope>
`;

function withFixtureFile(fn, xml = FIXTURE_XML) {
  const path = join(tmpdir(), `ecb-fx-cli-fixture-${process.pid}-${Math.random().toString(36).slice(2)}.xml`);
  writeFileSync(path, xml);
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

test("REGRESSION (producers run #22): the live single-quoted, tab-indented shape parses via the real CLI, end to end", () => {
  withFixtureFile((path) => {
    const res = runCli(["--input", path]);
    assert.equal(res.status, 0, `expected exit 0, got ${res.status}. stderr: ${res.stderr}`);
    assert.match(res.stdout, /parsed 4 row\(s\)/, `single-quoted attributes were not parsed — stdout: ${res.stdout} stderr: ${res.stderr}`);
    assert.match(res.stdout, /would create {2}ecb-fx:eur-usd @ 2026-09-03 {2}1\.1615 USD\/EUR/);
    assert.match(res.stderr, /not in this lane's closed vocabulary/, "CZK/DKK/HUF must warn, not silently vanish");
  }, FIXTURE_XML_SINGLE_QUOTED);
});

test("a refusal (0 rows) logs evidence — HTTP/content-type when known, byte count and a body snippet always", () => {
  withFixtureFile((path) => {
    const res = runCli(["--input", path]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /parsed 0 row\(s\)/);
    assert.match(res.stderr, /\[parse\] evidence:.*byte\(s\).*first 200 chars:/s, `expected an evidence line on refusal, got stderr: ${res.stderr}`);
    // --input has no HTTP response to report — must not fabricate a status/content-type it never observed.
    assert.doesNotMatch(res.stderr, /evidence:.*HTTP \d/s);
  }, "<not-ecb-xml/>");
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
