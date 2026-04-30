// Single source of truth for Browserless content fetches.
//
// Four routes need to render JS-heavy sources via Browserless:
//   - /api/agent/run             — agent route source-content fetch
//   - /api/admin/sources/[id]/fetch-now — manual admin re-fetch button
//   - /api/data/fetch-source     — single-source server fetch
//   - /api/data/scan-all         — batch scan worker
//
// All four POST to chrome.browserless.io/content with the same schema.
// Before this helper, the schema was duplicated across the four files
// — when Browserless v2 changed waitForSelector from string to object,
// four files needed the same fix and one path was missed in the first
// pass, leaving the manual-fetch button broken in production. This
// helper consolidates the schema in one place so future Browserless
// schema changes touch a single file.
//
// Returns both raw HTML and stripped text; callers slice to whatever
// length they need. Throws on non-2xx response or network failure;
// callers wrap in try/catch as before.

const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;

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
}

export class BrowserlessError extends Error {
  constructor(message: string, public readonly status?: number, public readonly renderMs?: number) {
    super(message);
    this.name = "BrowserlessError";
  }
}

/**
 * Render `url` via Browserless and return both raw HTML and stripped
 * text. Schema follows docs.browserless.io OpenAPI for the /content
 * endpoint as of Apr 2026:
 *
 *   waitForSelector: { selector: "...", timeout: ..., visible: true }
 *
 * The string form (`waitForSelector: "body"`) was the v1 schema; v2
 * returns 400 "must be of type object". `visible: true` ensures the
 * DOM is actually rendered, not just present in markup.
 */
export async function browserlessRender(
  url: string,
  options: BrowserlessOptions = {}
): Promise<BrowserlessResult> {
  if (!BROWSERLESS_API_KEY) {
    throw new BrowserlessError("BROWSERLESS_API_KEY not configured");
  }

  const {
    waitSelector = "body",
    waitTimeoutMs = 5000,
    gotoTimeoutMs = 15000,
    maxTextLength = 100000,
  } = options;

  const start = Date.now();
  let status = 0;
  try {
    // visible:true was too strict — sites with display:none containers (or
    // delayed body visibility on SPA portals like climate-laws.org and some
    // .gov sites) timed out the waitForSelector even though the body was
    // present and renderable. Drop the visible flag; selector-presence
    // alone is the right signal for content extraction.
    const res = await fetch(
      `https://chrome.browserless.io/content?token=${BROWSERLESS_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          waitForSelector: { selector: waitSelector, timeout: waitTimeoutMs },
          gotoOptions: { waitUntil: "networkidle2", timeout: gotoTimeoutMs },
        }),
      }
    );
    status = res.status;
    if (!res.ok) {
      const body = await res.text();
      throw new BrowserlessError(
        `Browserless ${res.status}: ${body.slice(0, 200)}`,
        res.status,
        Date.now() - start
      );
    }
    const html = await res.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxTextLength);
    return {
      status,
      html,
      text,
      htmlLength: html.length,
      textLength: text.length,
      renderMs: Date.now() - start,
    };
  } catch (e: unknown) {
    if (e instanceof BrowserlessError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new BrowserlessError(msg, status || undefined, Date.now() - start);
  }
}
