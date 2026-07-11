// F16 CALLER-THREAD PROOF — Unit 0c hold-integrity (proof "c"), run FIRST, network-free.
// GOVERNING SKILL: remediation-discipline (§4 cat 10 — the transport hold gate / RD-11 + F16).
//
// Proves the explicit `caller` thread reaches the gate at the RENDER transport (browserlessFetch — the
// primary content fetcher that buildLiveTransports.browserlessRender wraps, and the single-home Browserless
// primitive). Under an ENGAGED hold: the default null caller (the scheduled/pipeline path) is BLOCKED with
// FetchHoldError; the signed "manual-intake-run" / "unit3-remediation" callers PASS the gate (failing LATER
// on the missing BROWSERLESS_API_KEY — proof they got past the hold); an UNAUTHORIZED caller is BLOCKED (no
// third door). This is the threading complement to fetch-hold.test.mjs (the exactly-two-caller manifest).
//
// The direct-HTTP + API transports (directFetchClean / apiFetchForHost in canonical-pipeline.ts) call the
// IDENTICAL assertFetchAllowed(url, process.env, caller) as their first line (tsc-verified thread; they can't
// be imported here because the .ts uses @/ path-alias imports node --test can't resolve). The gate MECHANISM
// (assertFetchAllowed's caller logic) is proven exhaustively in fetch-hold.test.mjs; THIS proves the thread
// delivers the caller to it at the transport boundary. Network-free: the "passes" case fails fast on the
// unconfigured key, never a real fetch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { browserlessFetch } from "./canonical-fetch.mjs";
import { FetchHoldError } from "./fetch-hold.mjs";

process.env.SCRAPE_HOLD = "engaged";
delete process.env.BROWSERLESS_API_KEY; // so a gate-PASS fails at the key check, not the network

const isHold = (e) => e instanceof FetchHoldError || String(e?.name) === "FetchHoldError";
const URL_ = "https://example.org/x";

test("engaged hold + null caller (scheduled/pipeline path) → BLOCKED (FetchHoldError)", async () => {
  await assert.rejects(() => browserlessFetch(URL_, { maxTextLength: 1000 }), (e) => isHold(e));
  await assert.rejects(() => browserlessFetch(URL_, { maxTextLength: 1000, caller: null }), (e) => isHold(e));
});

test("engaged hold + manual-intake-run → PASSES the gate (fails later on missing key, NOT FetchHoldError)", async () => {
  await assert.rejects(
    () => browserlessFetch(URL_, { maxTextLength: 1000, caller: "manual-intake-run" }),
    (e) => !isHold(e) && /BROWSERLESS_API_KEY/.test(String(e?.message))
  );
});

test("engaged hold + unit3-remediation (2nd signed caller) → PASSES the gate too", async () => {
  await assert.rejects(
    () => browserlessFetch(URL_, { maxTextLength: 1000, caller: "unit3-remediation" }),
    (e) => !isHold(e)
  );
});

test("engaged hold + an UNAUTHORIZED caller → BLOCKED (no third door through the thread)", async () => {
  for (const bad of ["scheduled-worker", "loop", "seek-more", ""]) {
    await assert.rejects(() => browserlessFetch(URL_, { maxTextLength: 1000, caller: bad }), (e) => isHold(e));
  }
});

test("hold LIFTED → any caller passes the gate (default operating state, prod-preserving)", async () => {
  process.env.SCRAPE_HOLD = "off";
  await assert.rejects(() => browserlessFetch(URL_, { maxTextLength: 1000 }), (e) => !isHold(e)); // passes gate, fails on key
  process.env.SCRAPE_HOLD = "engaged"; // restore for any later cases
});
