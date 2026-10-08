// load-registry.test.mjs -- lane S8-E0. Proves the producer registry loader: it lists the real registry
// entries, refuses a malformed entry (each way), and selects the runs a dispatch asks for. Fixture
// directories only for the refusals; the listing test reads the real directory.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProducerRegistry, selectRuns, buildCommands, REGISTRY_DIR } from "./load-registry.mjs";

function good(over = {}) {
  return {
    name: "demo-producer",
    script: "scripts/producers/market/demo-producer.mjs",
    domain_table: "market_series",
    source: "demo",
    licence: "CC0 1.0",
    dry_capable: true,
    enabled_env: "MARKET_PRODUCER_DEMO_ENABLED",
    in_all: true,
    ...over,
  };
}

function fixtureDir(files) {
  const dir = mkdtempSync(join(tmpdir(), "producer-registry-"));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), typeof body === "string" ? body : JSON.stringify(body));
  }
  return dir;
}

const exists = () => true;

test("the real registry lists the four moved producers (and any added since), sorted, each script on disk", () => {
  const entries = loadProducerRegistry(REGISTRY_DIR);
  const names = entries.map((e) => e.name);
  // A superset check: the registry is an entry directory that later lanes add to, so the four original entries
  // must still be there, but a new entry must not make this test red.
  for (const original of ["ecb-fx", "eia-v2-petroleum-spot", "eu-weekly-oil-bulletin", "sbti-target-dashboard"]) {
    assert.ok(names.includes(original), `${original} is in the registry`);
  }
  assert.deepEqual(names, [...names].sort(), "entries are listed sorted");
  assert.equal(entries.every((e) => e.dry_capable === true), true);
  assert.ok(entries.find((e) => e.name === "sbti-target-dashboard").in_all === false, "SBTi stays out of the all sweep");
});

test("a well-formed fixture entry loads", () => {
  const dir = fixtureDir({ "demo-producer.json": good() });
  try {
    const entries = loadProducerRegistry(dir, { exists });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, "demo-producer");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const REFUSALS = [
  ["invalid JSON", "{ not json", /not valid JSON/],
  ["missing required field", (() => { const e = good(); delete e.licence; return e; })(), /missing required field "licence"/],
  ["dry_capable not true", good({ dry_capable: false }), /dry_capable must be true/],
  ["unknown field", good({ surprise: 1 }), /unknown field "surprise"/],
  ["script outside producers or gen", good({ script: "scripts/lib/db.mjs" }), /script must match/],
  ["script path traversal", good({ script: "scripts/producers/../lib/db.mjs" }), /script must match/],
  ["name not kebab-case", good({ name: "Demo_Producer" }), /name must match/],
  ["in_all not boolean", good({ in_all: "yes" }), /in_all must be a boolean/],
  ["enabled_env malformed", good({ enabled_env: "lower-case" }), /enabled_env must be null or/],
  ["args carries the mode flag", good({ args: ["--apply"] }), /must not carry --apply/],
  ["domain_table malformed", good({ domain_table: "Market Series" }), /domain_table must match/],
  ["pre without script", good({ pre: { args: [] } }), /pre\.script/],
];

for (const [label, body, pattern] of REFUSALS) {
  test(`a malformed entry is refused: ${label}`, () => {
    const dir = fixtureDir({ "demo-producer.json": body });
    try {
      assert.throws(() => loadProducerRegistry(dir, { exists }), pattern);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test("a filename that does not match the entry name is refused", () => {
  const dir = fixtureDir({ "other-name.json": good() });
  try {
    assert.throws(() => loadProducerRegistry(dir, { exists }), /filename must be demo-producer\.json/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a script that does not exist on disk is refused", () => {
  const dir = fixtureDir({ "demo-producer.json": good() });
  try {
    assert.throws(() => loadProducerRegistry(dir, { exists: () => false }), /script does not exist/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("selectRuns: all picks in_all entries; registry with a name picks that one even when not in_all; unknown name throws", () => {
  const entries = [good({ name: "a-one" }), good({ name: "b-two", in_all: false })];
  assert.deepEqual(selectRuns(entries, { producer: "all" }).map((e) => e.name), ["a-one"]);
  assert.deepEqual(selectRuns(entries, { producer: "registry" }).map((e) => e.name), ["a-one"]);
  assert.deepEqual(selectRuns(entries, { producer: "registry", only: "b-two" }).map((e) => e.name), ["b-two"]);
  assert.throws(() => selectRuns(entries, { producer: "registry", only: "nope" }), /unknown registry producer "nope"/);
  assert.throws(() => selectRuns(entries, { producer: "all", only: "b-two" }), /only applies when producer is "registry"/);
  assert.deepEqual(selectRuns(entries, { producer: "regional" }), []);
});

test("buildCommands: dry has no --apply, apply appends it last, the enable env is set, pre carries --since", () => {
  const entry = good({
    args: ["--input", "/tmp/x.csv"],
    pre: { script: "scripts/producers/market/fetch-demo.mjs", args: ["--out", "/tmp/x.csv"], since_flag: "--since" },
  });
  const dry = buildCommands(entry, { mode: "dry", since: "" });
  assert.deepEqual(dry.map((c) => c.args), [
    ["scripts/producers/market/fetch-demo.mjs", "--out", "/tmp/x.csv"],
    ["scripts/producers/market/demo-producer.mjs", "--input", "/tmp/x.csv"],
  ]);
  assert.equal(dry[1].env.MARKET_PRODUCER_DEMO_ENABLED, "1");
  const apply = buildCommands(entry, { mode: "apply", since: "2026-01-01" });
  assert.deepEqual(apply[0].args, ["scripts/producers/market/fetch-demo.mjs", "--out", "/tmp/x.csv", "--since", "2026-01-01"]);
  assert.deepEqual(apply[1].args, ["scripts/producers/market/demo-producer.mjs", "--input", "/tmp/x.csv", "--apply"]);
  assert.throws(() => buildCommands(entry, { mode: "bogus" }), /mode must be dry or apply/);
});
