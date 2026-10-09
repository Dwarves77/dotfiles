// export-subset.test.mjs -- PROOF-2. Fixture schema, injected client; no database, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "node:crypto";
import { join } from "node:path";
import {
  pickSeeds, buildClosure, verifyNoOrphans, findOrphans, fkOrder, exportSubset, writeSubset,
  fetchCatalog, fetchFkGraph, isOutsideWorkspace, runCli, readPinnedIds,
} from "./export-subset.mjs";

const SECRET_TITLE = "CONFIDENTIAL-REGULATION-TITLE-XYZZY";

// ---- fixture schema --------------------------------------------------------------------------------
// tables: name -> {cols: {name: nullable}, pk}
const SCHEMA = {
  profiles: { cols: { id: false }, pk: ["id"] },
  institutions: { cols: { id: false }, pk: ["id"] },
  sources: { cols: { id: false, institution_id: true }, pk: ["id"] },
  intelligence_items: { cols: { id: false, item_type: false, domain: true, item_grade: false, provenance_status: false, title: false, source_id: true, created_by: true, superseded_by: true }, pk: ["id"] },
  intelligence_item_sections: { cols: { id: false, item_id: false }, pk: ["id"] },
  section_claim_provenance: { cols: { id: false, section_id: false, source_id: false }, pk: ["id"] },
  agent_run_searches: { cols: { id: false, item_id: false, result_content: true }, pk: ["id"] },
  item_cross_references: { cols: { id: false, item_a: false, item_b: false }, pk: ["id"] },
  audit_log: { cols: { id: false, item_id: false, actor: false }, pk: ["id"] },
  audit_detail: { cols: { id: false, audit_id: false }, pk: ["id"] },
  integrity_flags: { cols: { id: false, item_id: true, subject_ref: true }, pk: ["id"] },
  harness_runs: { cols: { id: false, item_id: true }, pk: ["id"] },
  external_link: { cols: { id: false, item_id: false, auth_user: true }, pk: ["id"] },
};
const FKS = [
  ["sources", "institution_id", "institutions", "id"],
  ["intelligence_items", "source_id", "sources", "id"],
  ["intelligence_items", "created_by", "profiles", "id"],
  ["intelligence_items", "superseded_by", "intelligence_items", "id"],
  ["intelligence_item_sections", "item_id", "intelligence_items", "id"],
  ["section_claim_provenance", "section_id", "intelligence_item_sections", "id"],
  ["section_claim_provenance", "source_id", "sources", "id"],
  ["agent_run_searches", "item_id", "intelligence_items", "id"],
  ["item_cross_references", "item_a", "intelligence_items", "id"],
  ["item_cross_references", "item_b", "intelligence_items", "id"],
  ["audit_log", "item_id", "intelligence_items", "id"],
  ["audit_log", "actor", "profiles", "id"],
  ["audit_detail", "audit_id", "audit_log", "id"],
  ["integrity_flags", "item_id", "intelligence_items", "id"],
  ["harness_runs", "item_id", "intelligence_items", "id"],
  ["external_link", "item_id", "intelligence_items", "id"],
];

function item(id, type, grade, extra = {}) {
  return { id, item_type: type, domain: null, item_grade: grade, provenance_status: "verified", title: SECRET_TITLE, source_id: null, created_by: "p1", superseded_by: null, ...extra };
}

function makeData() {
  return {
    profiles: [{ id: "p1" }],
    institutions: [{ id: "inst1" }, { id: "inst2" }],
    sources: [{ id: "s1", institution_id: "inst1" }, { id: "s2", institution_id: "inst2" }],
    intelligence_items: [
      item("i1", "regulation", "brief", { source_id: "s1" }),
      item("i2", "market_signal", "record", { superseded_by: "i9" }),
      item("i3", "research_finding", "brief"),
      item("i4", "regional_data", "record"),
      item("i9", "regulation", "brief"), // never a seed in the small run
    ],
    intelligence_item_sections: [{ id: "sec1", item_id: "i1" }, { id: "sec9", item_id: "i9" }],
    section_claim_provenance: [{ id: "c1", section_id: "sec1", source_id: "s2" }],
    agent_run_searches: [{ id: "a1", item_id: "i1", result_content: "x".repeat(50000) }],
    item_cross_references: [{ id: "x1", item_a: "i1", item_b: "i2" }, { id: "x2", item_a: "i1", item_b: "i9" }],
    audit_log: [{ id: "al1", item_id: "i1", actor: "p1" }],
    audit_detail: [{ id: "ad1", audit_id: "al1" }],
    integrity_flags: [{ id: "f1", item_id: "i1", subject_ref: "fleet-budget-halt" }, { id: "f2", item_id: "i1", subject_ref: "ok" }],
    harness_runs: [{ id: "h1", item_id: "i1" }],
    external_link: [{ id: "e1", item_id: "i1", auth_user: "auth-user-1" }],
  };
}

/** Fake pg client interpreting exactly the SQL shapes export-subset.mjs issues; logs every statement. */
function fakeClient(data = makeData(), { extraFks = [] } = {}) {
  const calls = [];
  const fks = [...FKS, ...extraFks];
  return {
    calls,
    async query(sql, params = []) {
      calls.push(sql.replace(/\s+/g, " ").trim());
      const s = calls[calls.length - 1];
      if (/^(BEGIN|SET |ROLLBACK)/.test(s)) return { rows: [] };
      if (s.includes("referential_constraints")) {
        const rows = [];
        for (const [child, ccol, parent, pcol] of fks) {
          rows.push({ name: `${child}_${ccol}_fkey`, child, child_col: ccol, pos: 1, parent_schema: "public", parent, parent_col: pcol });
        }
        rows.push({ name: "external_link_auth_fkey", child: "external_link", child_col: "auth_user", pos: 1, parent_schema: "auth", parent: "users", parent_col: "id" });
        return { rows };
      }
      if (s.includes("information_schema.columns")) {
        return { rows: Object.entries(SCHEMA).flatMap(([t, d]) => Object.entries(d.cols).map(([col, nullable]) => ({ t, col, nullable }))) };
      }
      if (s.includes("PRIMARY KEY")) {
        return { rows: Object.entries(SCHEMA).flatMap(([t, d]) => d.pk.map((col) => ({ t, col }))) };
      }
      if (s.startsWith("SELECT id, item_type, domain, item_grade FROM public.intelligence_items")) {
        return { rows: data.intelligence_items.filter((r) => r.provenance_status === "verified").map(({ id, item_type, domain, item_grade }) => ({ id, item_type, domain, item_grade })) };
      }
      if (s.startsWith("SELECT id FROM public.intelligence_items WHERE id = ANY($1)")) {
        return { rows: data.intelligence_items.filter((r) => params[0].includes(r.id)).map((r) => ({ id: r.id })) };
      }
      let m = s.match(/^SELECT to_jsonb\(t\) AS r FROM public\."(\w+)" t WHERE t\."(\w+)" = ANY\(\$1\)$/);
      if (m) return { rows: data[m[1]].filter((r) => params[0].includes(r[m[2]])).map((r) => ({ r: structuredClone(r) })) };
      m = s.match(/^SELECT to_jsonb\(t\) AS r FROM public\."(\w+)" t$/);
      if (m) return { rows: data[m[1]].map((r) => ({ r: structuredClone(r) })) };
      throw new Error(`fake client: unhandled SQL ${s}`);
    },
    end: async () => {},
  };
}

async function closure(seedIds, data = makeData(), opts = {}) {
  const client = fakeClient(data, opts);
  const catalog = await fetchCatalog(client);
  const fks = await fetchFkGraph(client);
  const out = await buildClosure({ client, seedIds, catalog, fks });
  return { ...out, fks, client };
}

const ids = (subset, t) => [...(subset.get(t)?.values() ?? [])].map((r) => r.id).sort();

// ---- tests -----------------------------------------------------------------------------------------

test("fetchFkGraph pairs composite keys by position and marks non-public parents external", async () => {
  const fks = await fetchFkGraph(fakeClient());
  const ext = fks.find((f) => f.name === "external_link_auth_fkey");
  assert.equal(ext.external, true);
  assert.equal(fks.find((f) => f.child === "sources").cols[0].p, "id");
});

test("pickSeeds spreads across the four surfaces and both grades and honours N", () => {
  const cands = [];
  const types = ["regulation", "market_signal", "regional_data", "research_finding"];
  for (let i = 0; i < 40; i++) cands.push({ id: `id${String(i).padStart(2, "0")}`, item_type: types[i % 4], domain: null, item_grade: i % 8 < 4 ? "brief" : "record" });
  const picked = pickSeeds(cands, 8);
  assert.equal(picked.length, 8);
  const surf = new Set(picked.map((id) => types[Number(id.slice(2)) % 4]));
  assert.equal(surf.size, 4);
  const grades = new Set(picked.map((id) => (Number(id.slice(2)) % 8 < 4 ? "brief" : "record")));
  assert.equal(grades.size, 2);
  assert.equal(pickSeeds(cands, 100).length, 40, "tops up from what exists, never over-asks");
});

test("closure: FK closure is complete on the fixture schema", async () => {
  const { subset, fks } = await closure(["i1", "i2"]);
  assert.deepEqual(ids(subset, "intelligence_items"), ["i1", "i2"]);
  assert.deepEqual(ids(subset, "intelligence_item_sections"), ["sec1"]);
  assert.deepEqual(ids(subset, "section_claim_provenance"), ["c1"]);
  assert.deepEqual(ids(subset, "agent_run_searches"), ["a1"]);
  // the grounding pool is whole, never truncated (ADR-016)
  assert.equal([...subset.get("agent_run_searches").values()][0].result_content.length, 50000);
  // parents pulled up: source s2 came through the claim, institutions through the sources
  assert.deepEqual(ids(subset, "sources"), ["s1", "s2"]);
  assert.deepEqual(ids(subset, "institutions"), ["inst1", "inst2"]);
  verifyNoOrphans(subset, fks);
});

test("closure: restricted parent never pulled up; both endpoints needed for a cross reference", async () => {
  const { subset, stats } = await closure(["i1", "i2"]);
  assert.deepEqual(ids(subset, "item_cross_references"), ["x1"], "x2 points at non-seed i9 and is dropped");
  assert.ok(!ids(subset, "intelligence_items").includes("i9"));
  // nullable FK to a non-seed item is nulled, not dropped
  const i2 = subset.get("intelligence_items").get(JSON.stringify(["i2"]));
  assert.equal(i2.superseded_by, null);
  assert.ok(stats.nulled["intelligence_items.intelligence_items_superseded_by_fkey"] >= 1);
});

test("closure: excluded and external parents are nulled or drop the row, and the drop cascades", async () => {
  const { subset, stats } = await closure(["i1", "i2"]);
  assert.equal(subset.has("profiles"), false);
  assert.equal(subset.get("intelligence_items").get(JSON.stringify(["i1"])).created_by, null);
  assert.equal(subset.has("audit_log"), false, "NOT NULL FK to profiles drops the row");
  assert.equal(subset.has("audit_detail"), false, "its child follows through the prune fixpoint");
  assert.ok(stats.dropped.audit_log >= 1);
  // auth FK nullable: nulled, so no auth user id leaves production
  assert.equal(subset.get("external_link").get(JSON.stringify(["e1"])).auth_user, null);
});

test("closure: harness_runs excluded, fleet-budget-halt flag row excluded", async () => {
  const { subset } = await closure(["i1"]);
  assert.equal(subset.has("harness_runs"), false);
  assert.deepEqual(ids(subset, "integrity_flags"), ["f2"]);
});

test("closure: a table reached only through a nullable parent is kept when the parent is in the set", async () => {
  const { subset } = await closure(["i1"]);
  assert.equal(subset.get("intelligence_items").get(JSON.stringify(["i1"])).source_id, "s1");
});

test("orphan check fails on a planted orphan, naming the FK (attack)", async () => {
  const { subset, fks } = await closure(["i1"]);
  verifyNoOrphans(subset, fks); // clean first
  subset.get("section_claim_provenance").set(JSON.stringify(["cX"]), { id: "cX", section_id: "nope", source_id: "s1" });
  assert.throws(() => verifyNoOrphans(subset, fks), (e) => /section_claim_provenance_section_id_fkey/.test(e.message) && !/nope/.test(e.message));
  assert.equal(findOrphans(subset, fks)[0].orphans, 1);
});

test("orphan check also fails on a surviving value pointing at an external schema (attack)", async () => {
  const { subset, fks } = await closure(["i1"]);
  subset.get("external_link").get(JSON.stringify(["e1"])).auth_user = "real-user";
  assert.throws(() => verifyNoOrphans(subset, fks), /external_link_auth_fkey/);
});

test("fkOrder puts parents first and survives a cycle", () => {
  const fks = [{ child: "b", parent: "a", cols: [], external: false }, { child: "c", parent: "b", cols: [], external: false }];
  assert.deepEqual(fkOrder(["c", "b", "a"], fks), ["a", "b", "c"]);
  const cyc = [{ child: "a", parent: "b", cols: [], external: false }, { child: "b", parent: "a", cols: [], external: false }];
  assert.deepEqual(fkOrder(["a", "b"], cyc).sort(), ["a", "b"]);
});

test("exportSubset: read-only transaction, nothing but counts printed, manifest hashes match the files", async () => {
  const client = fakeClient();
  const written = new Map();
  const logs = [];
  const manifest = await exportSubset({
    client, outDir: "/runner-temp/subset", items: 3, root: "/workspace/repo",
    log: (m) => logs.push(m), now: "2026-10-07T00:00:00Z",
    writeFileFn: (p, body) => written.set(p, body), mkdirFn: () => {},
  });
  assert.equal(client.calls[0], "BEGIN");
  assert.equal(client.calls[1], "SET TRANSACTION READ ONLY");
  assert.equal(client.calls.at(-1), "ROLLBACK");
  assert.ok(client.calls.every((c) => !/^(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE)/i.test(c)), "no write statement is ever issued");
  const printed = logs.join("\n");
  assert.ok(!printed.includes(SECRET_TITLE), "no row content on any stream");
  assert.match(printed, /orphans=0/);
  // order: parents first
  const order = manifest.tables.map((t) => t.table);
  assert.ok(order.indexOf("institutions") < order.indexOf("sources"));
  assert.ok(order.indexOf("sources") < order.indexOf("intelligence_items"));
  for (const t of manifest.tables) {
    const body = written.get(join("/runner-temp/subset", t.file));
    assert.equal(hash("sha256", body), t.sha256);
    assert.equal(body.split("\n").filter(Boolean).length, t.rows);
  }
  assert.ok(written.has(join("/runner-temp/subset", "manifest.json")));
  assert.ok(!written.get(join("/runner-temp/subset", "manifest.json")).includes(SECRET_TITLE));
});

test("exportSubset rolls back and writes nothing when the orphan check fails (attack)", async () => {
  const client = fakeClient();
  const written = [];
  const closureFn = async (a) => {
    const out = await buildClosure(a);
    out.subset.get("agent_run_searches").set(JSON.stringify(["aX"]), { id: "aX", item_id: "ghost", result_content: null });
    return out;
  };
  await assert.rejects(
    exportSubset({ client, outDir: "/runner-temp/s", items: 2, root: "/w", closureFn, writeFileFn: (p) => written.push(p), mkdirFn: () => {}, log: () => {} }),
    /agent_run_searches_item_id_fkey/,
  );
  assert.equal(written.length, 0, "no file is written when the subset is not closed");
  assert.equal(client.calls.at(-1), "ROLLBACK");
});

test("exportSubset refuses an out dir inside the workspace", async () => {
  await assert.rejects(
    exportSubset({ client: fakeClient(), outDir: "/workspace/repo/fsi-app/scripts/tmp/subset", root: "/workspace/repo", log: () => {} }),
    /outside the git workspace/,
  );
  assert.equal(isOutsideWorkspace("/workspace/repo/x", "/workspace/repo"), false);
  assert.equal(isOutsideWorkspace("/runner-temp/x", "/workspace/repo"), true);
});

test("runCli: exit 2 without a connection, 1 on a bad out dir, 0 on success", async () => {
  const errs = [];
  assert.equal(await runCli(["--out", "/runner-temp/o"], { connect: async () => null, errorLog: (m) => errs.push(m) }), 2);
  assert.equal(await runCli([], { errorLog: (m) => errs.push(m) }), 1);
  assert.equal(await runCli(["--out", "/runner-temp/o", "--items", "0"], { errorLog: (m) => errs.push(m) }), 1);
  assert.ok(errs.every((m) => !m.includes(SECRET_TITLE)));
});

test("writeSubset skips empty tables and numbers files in order", () => {
  const written = new Map();
  const subset = new Map([["a", new Map([["k", { id: 1 }]])], ["b", new Map()]]);
  const m = writeSubset({ subset, order: ["a", "b"], outDir: "/o", stats: { nulled: {}, dropped: {} }, now: "t", writeFileFn: (p, b) => written.set(p, b), mkdirFn: () => {} });
  assert.deepEqual(m.tables.map((t) => t.file), ["001_a.jsonl"]);
});

test("pinned ids (from a record-briefs batch file) are in the manifest's item rows even when the round robin would not pick them", async () => {
  const pinIds = readPinnedIds(JSON.stringify({ batch: "b", entries: [{ item_id: "i9", body: "x" }, { item_id: "i3" }, { item_id: "i9" }] }));
  assert.deepEqual(pinIds, ["i9", "i3"], "deduplicated, order kept");
  const written = new Map();
  const logs = [];
  const manifest = await exportSubset({
    client: fakeClient(), outDir: "/runner-temp/subset", items: 1, pinIds, root: "/workspace/repo",
    log: (m) => logs.push(m), writeFileFn: (p, body) => written.set(p, body), mkdirFn: () => {},
  });
  const itemsFile = manifest.tables.find((t) => t.table === "intelligence_items").file;
  const rows = written.get(join("/runner-temp/subset", itemsFile)).split(String.fromCharCode(10)).filter(Boolean).map((l) => JSON.parse(l));
  const got = rows.map((r) => r.id);
  assert.ok(got.includes("i9") && got.includes("i3"), "both pinned ids present");
  assert.equal(got.length, 3, "two pinned plus one round-robin pick: " + got.join(","));
  assert.match(logs.join(String.fromCharCode(10)), /pinned=2/);
});

test("a pinned id missing from the source fails the export, naming only counts", async () => {
  await assert.rejects(
    exportSubset({ client: fakeClient(), outDir: "/runner-temp/s", items: 1, pinIds: ["i1", "nope"], root: "/w", log: () => {}, writeFileFn: () => {}, mkdirFn: () => {} }),
    (e) => /1 of 2 pinned item ids do not exist/.test(e.message) && !e.message.includes("nope"),
  );
});

test("readPinnedIds rejects a file that names no ids", () => {
  assert.throws(() => readPinnedIds(JSON.stringify({ entries: [] })), /names no item ids/);
});

// ── lane GATE-9 (2026-10-08, AUD-AT-5 gate-script neuter row): the CLI's EXIT STATUS ───────────────────────────
test("GATE-9 exit status: export-subset.mjs exits 1 without --out and non-zero without production credentials", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const { withoutCredentials } = await import("../lib/env-file.mjs");
  const script = fileURLToPath(new URL("./export-subset.mjs", import.meta.url));
  const env = { ...withoutCredentials(), SUPABASE_DB_URL: "", PROOF_DB_URL: "", SUPABASE_DB_PASSWORD: "", NEXT_PUBLIC_SUPABASE_URL: "" };
  const noOut = spawnSync(process.execPath, [script], { encoding: "utf8", env });
  assert.equal(noOut.status, 1, noOut.stdout + noOut.stderr);
  assert.match(noOut.stderr, /--out <dir> is required/);
  const noCreds = spawnSync(process.execPath, [script, "--out", "subset-out-unused"], { encoding: "utf8", env });
  assert.notEqual(noCreds.status, 0, "without credentials the export must not report success");
});
