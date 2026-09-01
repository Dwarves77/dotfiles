// @ts-check
// PROOF for the staged_updates bridge (Task 2, lane CD, 2026-09-01) — the pure summary helpers plus the
// wired bridge function. Separate file from change-sweep.test.mjs because the bridge exercises a
// different table shape (sources / raw_fetches / staged_updates) than sweepChangedSource's fake.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import {
  summarizeAmendmentDiff,
  fingerprintChangedNote,
  bridgeChangedSourceToStagedUpdates,
} from "./change-sweep.mjs";
import { diffDocuments } from "./amendment-diff.mjs";

// ── pure summary helpers ──────────────────────────────────────────────────────────────────────────────

test("summarizeAmendmentDiff: no provision-level change reads honestly, not as silence", () => {
  const diff = diffDocuments("Article 1. Same text.", "Article 1. Same text.");
  const msg = summarizeAmendmentDiff(diff);
  assert.match(msg, /no provision-level change detected/);
});

test("summarizeAmendmentDiff: added/changed/removed counts surface in the summary", () => {
  const prev = "Article 1. Old rule applies here today.";
  const next = "Article 1. New rule applies here today. Article 2. Brand new provision text.";
  const diff = diffDocuments(prev, next);
  const msg = summarizeAmendmentDiff(diff);
  assert.match(msg, /amendment diff:/);
  assert.match(msg, new RegExp(`${diff.counts.added} provision\\(s\\) added`));
  assert.match(msg, new RegExp(`${diff.counts.changed} changed`));
});

test("fingerprintChangedNote names the source and is honest about missing detail", () => {
  assert.match(fingerprintChangedNote("https://x.example/reg"), /https:\/\/x\.example\/reg/);
  assert.match(fingerprintChangedNote(null), /unknown source/);
  assert.match(fingerprintChangedNote(undefined), /fewer than two stored/);
});

// ── bridgeChangedSourceToStagedUpdates ────────────────────────────────────────────────────────────────

function fakeSvc({ url = "https://x.example/reg", snaps = [], bodies = {}, insertError = null } = {}) {
  const staged = [];
  return {
    staged,
    storage: {
      from() {
        return {
          async download(filePath) {
            const body = bodies[filePath];
            if (!body) return { data: null, error: { message: `no fixture body for ${filePath}` } };
            const gz = gzipSync(Buffer.from(body, "utf8"));
            return { data: { arrayBuffer: async () => gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength) }, error: null };
          },
        };
      },
    },
    from(table) {
      if (table === "sources") {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: { url }, error: null }),
        };
      }
      if (table === "raw_fetches") {
        return {
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          limit: async () => ({ data: snaps, error: null }),
        };
      }
      if (table === "staged_updates") {
        return {
          insert: async (row) => {
            if (insertError) return { error: { message: insertError } };
            staged.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`fakeSvc: unexpected table ${table}`);
    },
  };
}

test("bridge: fewer than two captures -> fingerprint-changed note, LOW confidence, one staged row per item", async () => {
  const svc = fakeSvc({ snaps: [{ file_path: "s1/only.html.gz", fetched_at: "2026-08-01T00:00:00Z" }] });
  const items = [{ id: "item-a" }, { id: "item-b" }];
  const r = await bridgeChangedSourceToStagedUpdates(svc, { sourceId: "src-1", items });
  assert.equal(r.staged, 2);
  assert.equal(r.confidence, "LOW");
  assert.match(r.summary, /fewer than two stored captures/);
  assert.equal(svc.staged.length, 2);
  for (const row of svc.staged) {
    assert.equal(row.update_type, "update_item");
    assert.deepEqual(row.proposed_changes, {}, "no autonomous rewrite of item content");
    assert.match(row.reason, /^\[change-sweep\]/);
  }
});

test("bridge: two captures present -> amendment-diff summary, MEDIUM confidence", async () => {
  const svc = fakeSvc({
    snaps: [
      { file_path: "s1/2026-08-15/new.html.gz", fetched_at: "2026-08-15T00:00:00Z" },
      { file_path: "s1/2026-08-01/old.html.gz", fetched_at: "2026-08-01T00:00:00Z" },
    ],
    bodies: {
      "s1/2026-08-15/new.html.gz": "Article 1. New rule applies. Article 2. Fresh provision added here.",
      "s1/2026-08-01/old.html.gz": "Article 1. Old rule applies.",
    },
  });
  const r = await bridgeChangedSourceToStagedUpdates(svc, { sourceId: "src-1", items: [{ id: "item-a" }] });
  assert.equal(r.confidence, "MEDIUM");
  assert.match(r.summary, /amendment diff:/);
  assert.equal(r.staged, 1);
});

test("bridge: bounded with limit; the drop is REPORTED, never silent", async () => {
  const svc = fakeSvc({ snaps: [] });
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const r = await bridgeChangedSourceToStagedUpdates(svc, { sourceId: "src-1", items, limit: 2 });
  assert.equal(r.staged, 2);
  assert.equal(r.notBridged, 1);
});

test("bridge: no live items -> zero-cost no-op (no sources/raw_fetches/staged_updates call)", async () => {
  const svc = fakeSvc({});
  const r = await bridgeChangedSourceToStagedUpdates(svc, { sourceId: "src-1", items: [] });
  assert.equal(r.staged, 0);
  assert.equal(r.summary, null);
});

test("bridge: a staged_updates insert failure is reported per item, not thrown", async () => {
  const svc = fakeSvc({ snaps: [], insertError: "RLS denied" });
  const r = await bridgeChangedSourceToStagedUpdates(svc, { sourceId: "src-1", items: [{ id: "item-a" }] });
  assert.equal(r.staged, 0);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /RLS denied/);
});
