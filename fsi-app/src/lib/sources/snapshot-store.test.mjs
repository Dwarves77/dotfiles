// @ts-check
// Tests for the snapshot store: pure selection/hash cores + read/write round-trips against an injected fake
// supabase client. No network, no real Storage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { pickLatest, sha256Hex, findSnapshotRow, getSnapshot, writeSnapshot } from "./snapshot-store.mjs";

test("pickLatest: newest fetched_at wins; empty -> null", () => {
  assert.equal(pickLatest([]), null);
  const rows = [
    { content_hash: "a", fetched_at: "2026-05-10T00:00:00Z" },
    { content_hash: "c", fetched_at: "2026-05-19T00:00:00Z" },
    { content_hash: "b", fetched_at: "2026-05-12T00:00:00Z" },
  ];
  assert.equal(pickLatest(rows).content_hash, "c");
});

test("sha256Hex: deterministic + differs on change", () => {
  assert.equal(sha256Hex("hello"), sha256Hex("hello"));
  assert.notEqual(sha256Hex("hello"), sha256Hex("hello!"));
});

/** Minimal chainable fake for the raw_fetches select path. */
function fakeSelectClient(rows) {
  const builder = {
    select() { return builder; },
    eq() { return builder; },
    order() { return builder; },
    limit() { return Promise.resolve({ data: rows, error: null }); },
  };
  return { from() { return builder; } };
}

test("findSnapshotRow: returns latest row, or null with no sourceId", async () => {
  const svc = fakeSelectClient([
    { content_hash: "old", file_path: "s/2026-05-10/old.html.gz", fetched_at: "2026-05-10T00:00:00Z" },
    { content_hash: "new", file_path: "s/2026-05-19/new.html.gz", fetched_at: "2026-05-19T00:00:00Z" },
  ]);
  // findSnapshotRow orders server-side; our fake returns as-given, so pickLatest does the ordering.
  const row = await findSnapshotRow(svc, { sourceId: "s1" });
  assert.equal(row.content_hash, "new");
  assert.equal(await findSnapshotRow(svc, {}), null);
});

test("getSnapshot: found:false when no rows", async () => {
  const svc = fakeSelectClient([]);
  const r = await getSnapshot(svc, { sourceId: "s1" });
  assert.equal(r.found, false);
});

test("getSnapshot: round-trips a gzipped stored body", async () => {
  const body = "<html>enacted text of Regulation (EU) 2099/1</html>";
  const gz = gzipSync(Buffer.from(body, "utf8"));
  const svc = {
    from() {
      const b = { select() { return b; }, eq() { return b; }, order() { return b; }, limit() { return Promise.resolve({ data: [{ content_hash: sha256Hex(body), file_path: "s1/2026-05-19/x.html.gz", fetched_at: "2026-05-19T00:00:00Z", http_status: 200 }], error: null }); } };
      return b;
    },
    storage: {
      from() {
        return { download: () => Promise.resolve({ data: { arrayBuffer: () => Promise.resolve(gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength)) }, error: null }) };
      },
    },
  };
  const r = await getSnapshot(svc, { sourceId: "s1" });
  assert.equal(r.found, true);
  assert.equal(r.content, body);
  assert.equal(r.contentHash, sha256Hex(body));
  assert.equal(r.httpStatus, 200);
});

test("writeSnapshot: builds the canonical storage key and upserts idempotently by hash", async () => {
  const html = "<html>fresh acquire</html>";
  let uploadedPath = null;
  let upserted = null;
  const svc = {
    from() {
      return {
        upsert(row) { upserted = row; return { select() { return { single: () => Promise.resolve({ data: { id: "rf-1" }, error: null }) }; } }; },
      };
    },
    storage: {
      from() {
        return { upload: (path) => { uploadedPath = path; return Promise.resolve({ error: null }); } };
      },
    },
  };
  const r = await writeSnapshot(svc, "src-9", { html, status: 200, isoDay: "2026-07-13" });
  assert.equal(r.contentHash, sha256Hex(html));
  assert.equal(r.filePath, `src-9/2026-07-13/${sha256Hex(html)}.html.gz`);
  assert.equal(uploadedPath, r.filePath);
  assert.equal(upserted.source_id, "src-9");
  assert.equal(upserted.content_hash, sha256Hex(html));
  await assert.rejects(() => writeSnapshot(svc, "", { html }), /sourceId required/);
});
