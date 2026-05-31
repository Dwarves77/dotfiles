// THE single canonical Browserless content-fetch (plain JS), callable by BOTH the TS
// routes (via browserless.ts, which wraps this and adds typed shapes + the SEC UA) AND
// the .mjs build/discovery runners (which import it directly). ONE implementation, so
// the ~10 fetch sites cannot diverge into aligned copies again — the exact duplicated-
// and-diverged defect D1 + D3 exist to kill. browserless.ts re-exports BrowserlessError
// so `e instanceof BrowserlessError` is the SAME class across the TS and .mjs worlds.

export class BrowserlessError extends Error {
  constructor(message, status, renderMs) {
    super(message);
    this.name = "BrowserlessError";
    this.status = status;
    this.renderMs = renderMs;
  }
}

// Render `url` via Browserless /content. Returns { status, html, text, htmlLength,
// textLength, renderMs }. Throws BrowserlessError on missing key / non-2xx / failure.
// `userAgent` (optional) is set as both userAgent + setExtraHTTPHeaders (SEC fair-access
// policy); browserless.ts computes it per-host and passes it.
export async function browserlessFetch(url, options = {}) {
  const key = process.env.BROWSERLESS_API_KEY;
  if (!key) throw new BrowserlessError("BROWSERLESS_API_KEY not configured");

  const {
    waitSelector = "body",
    waitTimeoutMs = 5000,
    gotoTimeoutMs = 15000,
    maxTextLength = 100000,
    userAgent,
  } = options;

  const start = Date.now();
  let status = 0;
  try {
    const renderBody = {
      url,
      waitForSelector: { selector: waitSelector, timeout: waitTimeoutMs },
      gotoOptions: { waitUntil: "networkidle2", timeout: gotoTimeoutMs },
    };
    if (userAgent) {
      renderBody.userAgent = userAgent;
      renderBody.setExtraHTTPHeaders = { "User-Agent": userAgent };
    }
    const res = await fetch(`https://chrome.browserless.io/content?token=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(renderBody),
    });
    status = res.status;
    if (!res.ok) {
      const body = await res.text();
      throw new BrowserlessError(`Browserless ${res.status}: ${body.slice(0, 200)}`, res.status, Date.now() - start);
    }
    const html = await res.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxTextLength);
    return { status, html, text, htmlLength: html.length, textLength: text.length, renderMs: Date.now() - start };
  } catch (e) {
    if (e instanceof BrowserlessError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new BrowserlessError(msg, status || undefined, Date.now() - start);
  }
}
