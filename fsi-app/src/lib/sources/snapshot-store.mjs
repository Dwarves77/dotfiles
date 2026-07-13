// @ts-check
// SNAPSHOT STORE (Phase 1, operator ruling 2026-07-13, snapshot-first rebuild). The read+write home for the
// raw_fetches snapshot layer — the 660 hashed May snapshots (bodies gzipped in the Supabase Storage bucket
// `raw_fetches`) that the old pipeline neither read nor wrote. Snapshot-first verification reads here FIRST
// (before any fetch); the locked paid-acquire path writes here on every acquisition (invariant I3 — an
// acquiring run that leaves no raw_fetches row is a violation).
//
// The sole prior writer was scripts/wave1-cold-start.mjs::persistRaw (one-time cold start); this module makes
// that write/read a first-class, reused primitive. Storage key shape is preserved: `${sourceId}/${yyyy-mm-dd}/
// ${content_hash}.html.gz`. Selection logic (pickLatest) is a pure, node-testable core; I/O is injected.

import { createHash } from "node:crypto";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/** SHA-256 hex of a string — the content_hash used for storage key + freshness comparison. @param {string} s */
export function sha256Hex(s) {
  return createHash("sha256").update(String(s), "utf8").digest("hex");
}

/**
 * PURE: pick the newest snapshot row from a set (by fetched_at, then created_at). Returns null on empty.
 * @param {Array<{ content_hash?: string, file_path?: string, fetched_at?: string, created_at?: string, http_status?: number, html_bytes?: number }>} rows
 */
export function pickLatest(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows
    .slice()
    .sort((a, b) => String(b.fetched_at ?? b.created_at ?? "").localeCompare(String(a.fetched_at ?? a.created_at ?? "")))[0];
}

/**
 * Find the latest snapshot METADATA row for a source (no body download). Returns null when none.
 * @param {import("@supabase/supabase-js").SupabaseClient} svc
 * @param {{ sourceId: string }} q
 */
export async function findSnapshotRow(svc, q) {
  if (!q?.sourceId) return null;
  const { data, error } = await svc
    .from("raw_fetches")
    .select("id, content_hash, file_path, fetched_at, created_at, http_status, html_bytes")
    .eq("source_id", q.sourceId)
    .order("fetched_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`snapshot lookup failed: ${error.message}`);
  return pickLatest(data ?? []);
}

/**
 * Download + gunzip a stored snapshot body by its storage key. Returns the decoded HTML/text string.
 * @param {import("@supabase/supabase-js").SupabaseClient} svc
 * @param {string} filePath  raw_fetches.file_path (the storage key in bucket `raw_fetches`)
 */
export async function readSnapshotBody(svc, filePath) {
  const { data, error } = await svc.storage.from("raw_fetches").download(filePath);
  if (error || !data) throw new Error(`snapshot body download failed (${filePath}): ${error?.message ?? "no data"}`);
  const buf = Buffer.from(await data.arrayBuffer());
  const out = await gunzipAsync(buf);
  return out.toString("utf8");
}

/**
 * Full snapshot lookup: metadata + body. Returns { found:false } when no snapshot exists, else the content +
 * its hash + when it was captured. This is step 1 of the snapshot-first flow.
 * @param {import("@supabase/supabase-js").SupabaseClient} svc
 * @param {{ sourceId: string }} q
 * @returns {Promise<{ found: false } | { found: true, content: string, contentHash: string, fetchedAt: string, filePath: string, httpStatus: number|null }>}
 */
export async function getSnapshot(svc, q) {
  const row = await findSnapshotRow(svc, q);
  if (!row || !row.file_path) return { found: false };
  const content = await readSnapshotBody(svc, row.file_path);
  return {
    found: true,
    content,
    contentHash: String(row.content_hash ?? ""),
    fetchedAt: String(row.fetched_at ?? row.created_at ?? ""),
    filePath: String(row.file_path),
    httpStatus: row.http_status ?? null,
  };
}

/**
 * WRITE a snapshot on acquisition (invariant I3). Hashes + gzips the body, uploads to the `raw_fetches` bucket,
 * upserts the metadata row (onConflict source_id,content_hash so re-acquiring identical content is idempotent).
 * Mirrors wave1-cold-start::persistRaw exactly. Returns the content hash + storage key.
 * @param {import("@supabase/supabase-js").SupabaseClient} svc
 * @param {string} sourceId
 * @param {{ html: string, status?: number, isoDay?: string }} fetchResult
 * @returns {Promise<{ contentHash: string, filePath: string, rawFetchId: string }>}
 */
export async function writeSnapshot(svc, sourceId, fetchResult) {
  if (!sourceId) throw new Error("writeSnapshot: sourceId required (I3 — an acquiring run must attribute its snapshot)");
  const html = String(fetchResult?.html ?? "");
  const contentHash = sha256Hex(html);
  const day = fetchResult.isoDay ?? new Date().toISOString().slice(0, 10);
  const filePath = `${sourceId}/${day}/${contentHash}.html.gz`;
  const gz = await gzipAsync(Buffer.from(html, "utf8"));
  const up = await svc.storage.from("raw_fetches").upload(filePath, gz, { contentType: "application/gzip", upsert: true });
  if (up.error) throw new Error(`snapshot upload failed: ${up.error.message}`);
  const { data, error } = await svc
    .from("raw_fetches")
    .upsert(
      { source_id: sourceId, content_hash: contentHash, file_path: filePath, http_status: fetchResult.status ?? null, html_bytes: html.length },
      { onConflict: "source_id,content_hash" },
    )
    .select("id")
    .single();
  if (error || !data) throw new Error(`raw_fetches upsert failed: ${error?.message ?? "no data"}`);
  return { contentHash, filePath, rawFetchId: data.id };
}
