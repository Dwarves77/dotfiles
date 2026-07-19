// Typed TS wrapper over the canonical Browserless content fetch.
//
// The render + parse logic now lives ONCE in canonical-fetch.mjs (plain JS) so that the
// .mjs build/discovery runners call the SAME implementation as the TS routes — no more
// aligned-but-divergent copies (when Browserless v2 changed waitForSelector from string
// to object, four files needed the same fix and one was missed, leaving the manual-fetch
// button broken in production; D1 makes the single-source-of-truth real on BOTH sides).
//
// This file keeps the TS-facing API stable: the BrowserlessOptions/BrowserlessResult
// types, the browserlessRender(url, options) signature, and BrowserlessError (re-exported
// from canonical-fetch.mjs so `e instanceof BrowserlessError` is the SAME class across
// the TS and .mjs worlds). It adds the per-host SEC fair-access UA before delegating.

import { secFairAccessUaForUrl } from "@/lib/sources/sec-fair-access";
import { browserlessFetch, BrowserlessError } from "@/lib/sources/canonical-fetch.mjs";

export { BrowserlessError };

export interface BrowserlessOptions {
  /** CSS selector to wait for. Default: "body". */
  waitSelector?: string;
  /** waitForSelector timeout in ms. Default: 5000. */
  waitTimeoutMs?: number;
  /** goto navigation timeout in ms. Default: 15000. */
  gotoTimeoutMs?: number;
  /** Cap stripped-text output length (chars). Default: 100000. */
  maxTextLength?: number;
}

export interface BrowserlessResult {
  /** HTTP status returned by the Browserless /content endpoint. */
  status: number;
  /** Raw HTML body (uncapped). */
  html: string;
  /** Stripped, whitespace-collapsed text content (capped at maxTextLength). */
  text: string;
  /** Length of html (before any cap). */
  htmlLength: number;
  /** Length of text after cap is applied. */
  textLength: number;
  /** Wall-clock ms from request start to response body returned. */
  renderMs: number;
  /** Pre-cap text length (no-silent-truncation, D4): present so a capped collect is surfaceable. */
  fullTextLength?: number;
  /** True when maxTextLength truncated the text (D5) — a 458KB page and a naturally-30KB page must
   *  never look identical to the caller. */
  truncated?: boolean;
}

/**
 * Render `url` via Browserless and return both raw HTML and stripped text. Delegates to
 * the canonical implementation (canonical-fetch.mjs); this wrapper only computes the
 * per-host SEC fair-access UA and applies the typed result shape. Throws BrowserlessError
 * on non-2xx / network failure, exactly as before — callers wrap in try/catch.
 */
export async function browserlessRender(
  url: string,
  options: BrowserlessOptions = {}
): Promise<BrowserlessResult> {
  const secUa = secFairAccessUaForUrl(url);
  const result = await browserlessFetch(url, {
    waitSelector: options.waitSelector,
    waitTimeoutMs: options.waitTimeoutMs,
    gotoTimeoutMs: options.gotoTimeoutMs,
    maxTextLength: options.maxTextLength,
    userAgent: secUa ?? undefined,
  });
  return result as BrowserlessResult;
}
