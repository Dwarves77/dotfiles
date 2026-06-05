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
// textLength, renderMs, stealth }. Throws BrowserlessError only when BOTH the fast render
// AND the stealth-mode retry fail. `userAgent` (optional) is set as both userAgent +
// setExtraHTTPHeaders (SEC fair-access policy); browserless.ts computes it per-host.
//
// ONE fetch path that ESCALATES — there is deliberately not a second weaker implementation
// the system could pick by mistake. The fast standard render handles most sites; bot-protected
// / HTTP2-hostile sites (McKinsey, Cloudflare) throw net::ERR_HTTP2_PROTOCOL_ERROR on the plain
// render and only succeed under Browserless stealth mode, so on ANY failure we retry once with
// stealth. Verified: McKinsey sustainability page fails plain (HTTP2) and renders 207k chars
// under stealth.
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
  // Base URL is configurable so a regional/self-hosted endpoint (e.g. https://production-sfo.browserless.io)
  // needs only an env var, not a code change. Defaults to the legacy cloud endpoint (still supports stealth).
  const base = (process.env.BROWSERLESS_BASE_URL || "https://chrome.browserless.io").replace(/\/+$/, "");

  const toText = (html) =>
    html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxTextLength);

  // Tier 1/2 — Browserless /content render. stealth=true bypasses many bot/HTTP2 blocks.
  async function render(stealth) {
    const start = Date.now();
    const renderBody = {
      url,
      waitForSelector: { selector: waitSelector, timeout: waitTimeoutMs },
      gotoOptions: { waitUntil: "networkidle2", timeout: gotoTimeoutMs },
    };
    if (userAgent) {
      renderBody.userAgent = userAgent;
      renderBody.setExtraHTTPHeaders = { "User-Agent": userAgent };
    }
    const qs = stealth ? `&launch=${encodeURIComponent(JSON.stringify({ stealth: true }))}` : "";
    const res = await fetch(`${base}/content?token=${key}${qs}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(renderBody),
    });
    if (!res.ok) throw new BrowserlessError(`Browserless ${res.status}${stealth ? " (stealth)" : ""}: ${(await res.text()).slice(0, 160)}`, res.status, Date.now() - start);
    const html = await res.text();
    return { status: res.status, html, text: toText(html), htmlLength: html.length, textLength: toText(html).length, renderMs: Date.now() - start, tier: stealth ? "stealth" : "plain" };
  }

  // Tier 3 — Browserless /unblock: the dedicated bot-bypass (residential proxy + challenge solving)
  // for sites that block even stealth (Akamai/Azure-WAF). Heaviest, so it is the LAST resort only.
  async function unblock() {
    const start = Date.now();
    const res = await fetch(`${base}/unblock?token=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, content: true, cookies: false, screenshot: false, browserWSEndpoint: false, gotoOptions: { waitUntil: "domcontentloaded", timeout: gotoTimeoutMs } }),
    });
    if (!res.ok) throw new BrowserlessError(`Browserless /unblock ${res.status}: ${(await res.text()).slice(0, 160)}`, res.status, Date.now() - start);
    const data = await res.json();
    const html = typeof data?.content === "string" ? data.content : "";
    return { status: res.status, html, text: toText(html), htmlLength: html.length, textLength: toText(html).length, renderMs: Date.now() - start, tier: "unblock" };
  }

  // A "soft block" is a 200 that is really a WAF / JS-challenge / empty shell (no throw) — e.g.
  // irena.org's Azure-WAF "enable JavaScript" page (~90 chars). Treated the same as a hard failure.
  const looksBlocked = (r) =>
    !r || r.textLength < 150 ||
    /enable javascript to run|azure waf|just a moment|checking your browser|attention required|cf-browser-verification|verify you are (a )?human|access denied|captcha/i.test(r.text || "");

  // ONE escalating path: plain -> stealth -> unblock. Return the first tier that yields real content;
  // if every tier is blocked, return the least-bad result (the deep-dive's >200ch filter drops it, and
  // the multi-source design leans on corroborators). Only throw when every tier hard-errors.
  let best = null;
  let lastErr;
  for (const attempt of [() => render(false), () => render(true), () => unblock()]) {
    let r;
    try { r = await attempt(); } catch (e) { lastErr = e; continue; }
    if (!looksBlocked(r)) return r;
    best = best && best.textLength >= r.textLength ? best : r;
  }
  if (best) return best;
  if (lastErr instanceof BrowserlessError) throw lastErr;
  throw new BrowserlessError(lastErr instanceof Error ? lastErr.message : `all fetch tiers blocked for ${url}`);
}
