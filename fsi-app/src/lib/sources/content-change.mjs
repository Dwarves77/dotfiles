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
