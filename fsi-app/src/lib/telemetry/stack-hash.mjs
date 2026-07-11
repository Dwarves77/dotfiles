// Stack-hash normalization for first-party error grouping (Wave-β R0.2).
//
// PURE module (repo pattern: content-change.mjs / portal-links.mjs) so the
// dedup-hash behavior is unit-testable with node --test without a Next.js
// runtime. Consumed by src/lib/telemetry/capture-error.ts (server-side ONLY —
// the hash is never computed in the browser; clients send raw message/stack
// and the ingest route derives the group key here).
//
// Grouping goal: the same defect should land in ONE error_events row per
// (release, side, route) even when its message carries dynamic fragments
// (UUIDs, ids, counts, timestamps) and even when minified chunk names shift
// column offsets. Two DIFFERENT defects should not collide. The release is
// part of the DB dedup key, so cross-release drift in line numbers is already
// isolated; normalization here only has to be stable WITHIN a build.

import { createHash } from "node:crypto";

/** How many stack frames participate in the group identity. Deep frames churn
 *  (framework internals, async plumbing); the top of the stack is the defect. */
const FRAMES_FOR_IDENTITY = 5;

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const LONG_HEX_RE = /\b[0-9a-f]{12,}\b/gi;
const NUMBER_RE = /\d+/g;

/**
 * Normalize a raw error message: dynamic fragments (uuids, hex ids, numbers)
 * collapse to '#' so "item 42 not found" and "item 97 not found" group
 * together, while genuinely different messages stay apart.
 */
export function normalizeMessage(message) {
  return String(message ?? "")
    .slice(0, 500)
    .replace(UUID_RE, "#")
    .replace(LONG_HEX_RE, "#")
    .replace(NUMBER_RE, "#")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize a stack trace to its identity frames: top N frames, each reduced
 * to the function name + file basename (paths, line and column numbers
 * stripped — they shift with unrelated edits and with minifier layout, and
 * release is already part of the dedup key).
 */
export function normalizeStack(stack) {
  const lines = String(stack ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("at ") || /@/.test(l)) // v8 frames / firefox frames
    .slice(0, FRAMES_FOR_IDENTITY);

  return lines
    .map((line) => {
      // strip "(...path/file.js:12:34)" location detail down to "file.js"
      return line
        .replace(/\(([^)]*)\)/g, (_, loc) => `(${basenameNoPosition(loc)})`)
        .replace(/@(.*)$/, (_, loc) => `@${basenameNoPosition(loc)}`)
        .replace(/\s+/g, " ")
        .trim();
    })
    .join("|");
}

function basenameNoPosition(location) {
  const noPos = String(location).replace(/:\d+(:\d+)?$/, "");
  const parts = noPos.split(/[\\/]/);
  return parts[parts.length - 1] || "";
}

/**
 * The group hash: sha256 over side + normalized message + identity frames.
 * Returns a 64-char hex string (fits error_events.stack_hash CHECK <= 64).
 */
export function stackHash({ side, message, stack }) {
  const normalized = `${side}\n${normalizeMessage(message)}\n${normalizeStack(stack)}`;
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
