// Tests for load-host-verdicts.mjs (lane S1-B, 2026-10-04). No I/O beyond reading the committed fixture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  loadHostVerdicts,
  discoverHostVerdictFiles,
  validateHostVerdictEntry,
  HOST_VERDICTS_DIR,
} from "./load-host-verdicts.mjs";
import { HOST_CLASS_TIER, verdictPlacementForHost, classTierForHostWithVerdicts } from "../../../src/lib/sources/host-authority.ts";
import { readFileSync } from "node:fs";

const FIXTURE = join(HOST_VERDICTS_DIR, "host-verdicts-000.fixture.json");

const good = (over = {}) => ({
  host: "x.example", class: "analysis", evidence: "page title", verdict_source: "session-lane",
  generated_at: "2026-10-04T00:00:00Z", ...over,
});
const fakeFs = (files) => ({
  readFileSyncImpl: (p) => {
    const k = String(p).split(/[\\/]/).pop();
    if (!(k in files)) throw new Error("ENOENT " + k);
    return typeof files[k] === "string" ? files[k] : JSON.stringify(files[k]);
  },
});

test("fixture batch loads: hosts normalized, class kept, batch stamped, nothing rejected", () => {
  const r = loadHostVerdicts({ files: [FIXTURE] });
  assert.equal(r.rejected.length, 0);
  assert.equal(r.verdicts.size, 2);
  assert.equal(r.verdicts.get("unplaced-example.test").class, "association");
  assert.equal(r.verdicts.get("unplaced-example.test").batch, "host-verdicts-000.fixture");
  assert.ok(r.verdicts.has("other-fixture-host.test"), "www., case and trailing dot are normalized away");
});

test("the real discovery never applies the fixture (filename pattern host-verdicts-NNN.json only)", () => {
  assert.ok(discoverHostVerdictFiles().every((f) => !f.includes("fixture")));
  assert.equal(loadHostVerdicts().verdicts.has("unplaced-example.test"), false);
});

test("a verdict with an unknown class is rejected by the loader, the rest of the batch still applies", () => {
  const r = loadHostVerdicts({
    files: ["host-verdicts-001.json"],
    ...fakeFs({ "host-verdicts-001.json": { batch: "b", entries: [good({ host: "a.example", class: "made-up" }), good({ host: "b.example" })] } }),
  });
  assert.equal(r.verdicts.has("a.example"), false);
  assert.equal(r.verdicts.has("b.example"), true);
  assert.equal(r.rejected.length, 1);
  assert.match(r.rejected[0].reason, /unknown class/);
});

test("a prototype key is not a class", () => {
  assert.ok(validateHostVerdictEntry(good({ class: "toString" })).some((e) => /unknown class/.test(e)));
});

test("a free tier number is rejected, even beside a valid class", () => {
  assert.ok(validateHostVerdictEntry(good({ tier: 1 })).some((e) => /never a tier/.test(e)));
});

test("entry needs evidence, verdict_source session-lane and a date", () => {
  assert.ok(validateHostVerdictEntry(good({ evidence: " " })).length);
  assert.ok(validateHostVerdictEntry(good({ verdict_source: "haiku" })).length);
  assert.ok(validateHostVerdictEntry(good({ generated_at: "nope" })).length);
  assert.deepEqual(validateHostVerdictEntry(good()), []);
});

test("later batch wins per host", () => {
  const r = loadHostVerdicts({
    files: ["host-verdicts-001.json", "host-verdicts-002.json"],
    ...fakeFs({
      "host-verdicts-001.json": { entries: [good({ class: "news" })] },
      "host-verdicts-002.json": { entries: [good({ class: "gov" })] },
    }),
  });
  assert.equal(r.verdicts.get("x.example").class, "gov");
  assert.equal(r.verdicts.get("x.example").batch, "host-verdicts-002");
});

test("discovery orders numerically, not lexically", () => {
  const files = discoverHostVerdictFiles("d", { readdirSyncImpl: () => ["host-verdicts-010.json", "host-verdicts-002.json", "README.md", "host-verdicts-000.fixture.json"] });
  assert.deepEqual(files.map((f) => f.replace(/^.*[\\/]/, "")), ["host-verdicts-002.json", "host-verdicts-010.json"]);
});

test("a malformed or unreadable batch is reported, never thrown", () => {
  const r = loadHostVerdicts({
    files: ["host-verdicts-001.json", "host-verdicts-002.json", "host-verdicts-003.json"],
    ...fakeFs({ "host-verdicts-001.json": "{not json", "host-verdicts-002.json": { entries: "no" } }),
  });
  assert.equal(r.rejected.length, 3);
  assert.equal(r.verdicts.size, 0);
});

test("missing directory means no batches, not an error", () => {
  assert.deepEqual(discoverHostVerdictFiles("d", { readdirSyncImpl: () => { throw new Error("ENOENT"); } }), []);
});

// ── tier always comes from the class table (host-authority.ts) ─────────────────────────────────────
test("verdict tier is read from HOST_CLASS_TIER for the class", () => {
  const { verdicts } = loadHostVerdicts({ files: [FIXTURE] });
  assert.equal(verdictPlacementForHost("unplaced-example.test", verdicts).tier, HOST_CLASS_TIER.association);
  assert.equal(classTierForHostWithVerdicts("unplaced-example.test", [], verdicts), 4);
  assert.equal(classTierForHostWithVerdicts("unplaced-example.test", [], null), null, "no verdict, no tier");
});

test("built-in rules win over a verdict, and an aggregator never registers even with a verdict", () => {
  const m = new Map([["epa.gov", { class: "news" }], ["law.justia.com", { class: "legal" }]]);
  assert.equal(classTierForHostWithVerdicts("epa.gov", [], m), 2);
  assert.equal(classTierForHostWithVerdicts("law.justia.com", ["Justia"], m), null);
});

test("schema.json class enum equals the HOST_CLASS_TIER keys", () => {
  const schema = JSON.parse(readFileSync(join(HOST_VERDICTS_DIR, "schema.json"), "utf8"));
  assert.deepEqual([...schema.definitions.entry.properties.class.enum].sort(), Object.keys(HOST_CLASS_TIER).sort());
});
