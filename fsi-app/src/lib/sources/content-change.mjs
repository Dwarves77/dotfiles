// src/lib/sources/content-change.mjs
//
// CHANGE DETECTION fingerprint (P2-6 / chrome-audit S1-10). check-sources wrote
// `change_detected: false` HARDCODED on every monitoring_queue row — zero change rows ever, so
// the "source monitoring" the platform claims was accessibility-only. The fix reuses the SAME
// Browserless render the accessibility check already pays for (zero extra units — the 20k/mo
// budget is the constraint) and fingerprints its text; the worker compares against
// sources.last_content_hash (migration 161) and records an honest change_detected.
//
// PURE — no I/O. Normalization keeps the fingerprint stable across cosmetic re-renders
// (whitespace runs, case) while any wording/date/figure change flips it. A capture below the
// 200-char floor is NOT fingerprinted (null) — that is the error-page/bot-wall band (same floor
// the grounding pool uses), and hashing it would make outage-vs-recovery read as content change.
//
// v1 HONESTY NOTE: the fingerprint covers the render's text cap (the accessibility check's
// maxTextLength) — a change below that fold is missed. That is a recall bound, not a false
// signal: change_detected=true is always real. Deep-fold coverage rides the P2-5 crawler.

import { createHash } from "node:crypto";

const MIN_FINGERPRINT_CHARS = 200;

/** Normalize rendered text for fingerprinting: collapse whitespace, lowercase. */
export function normalizeForFingerprint(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * sha256 hex fingerprint of rendered page text, or null when the capture is too thin to
 * fingerprint honestly (<200 normalized chars — the error-page band).
 * @param {string|null|undefined} text
 * @returns {string|null}
 */
export function contentFingerprint(text) {
  const norm = normalizeForFingerprint(text);
  if (norm.length < MIN_FINGERPRINT_CHARS) return null;
  return createHash("sha256").update(norm).digest("hex");
}

/**
 * Change decision. TRUE only when both fingerprints exist and differ — a missing prior
 * (first observation) or a missing current (thin/failed capture) is NEVER a change.
 * @param {string|null|undefined} prevHash  sources.last_content_hash
 * @param {string|null|undefined} nextHash  contentFingerprint(current render)
 */
export function isContentChange(prevHash, nextHash) {
  return !!prevHash && !!nextHash && prevHash !== nextHash;
}
