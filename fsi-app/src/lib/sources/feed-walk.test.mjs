// @ts-check
// PROOF (B3 feed-walk). Pure parser + dep-injected walker, no network:
//   - RSS 2.0 <item><link> and Atom <entry><link href> both parse; CDATA titles unwrap; https-only.
//   - Atom rel="alternate" preferred over the first bare <link>.
//   - error-body gate: a bot-block body is {ok:false} INCONCLUSIVE — never an honest "empty feed".
//   - a non-feed HTML body with 0 entries is {ok:false} "not a feed".
//   - a real feed with entries persists via the injected write-site and reports counts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeedEntries, walkFeed } from "./feed-walk.mjs";

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>CARB News</title>
<item><title><![CDATA[Advanced Clean Fleets — amendments adopted]]></title>
<link>https://ww2.arb.ca.gov/news/acf-amendments</link><pubDate>Fri, 17 Jul 2026 10:00:00 GMT</pubDate></item>
<item><title>Board meeting</title><link>http://insecure.example/x</link></item>
<item><title>No link at all</title></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Reg feed</title>
<entry><title>LCFS amendment package</title>
<link rel="self" href="https://feeds.example/self"/>
<link rel="alternate" href="https://ww2.arb.ca.gov/rulemaking/lcfs-2026"/>
<updated>2026-07-16T00:00:00Z</updated></entry>
</feed>`;

test("parseFeedEntries: RSS items parse, CDATA unwraps, https-only", () => {
  const e = parseFeedEntries(RSS);
  assert.equal(e.length, 1, "http:// and link-less items dropped");
  assert.equal(e[0].url, "https://ww2.arb.ca.gov/news/acf-amendments");
  assert.equal(e[0].anchorText, "Advanced Clean Fleets — amendments adopted");
  assert.match(e[0].published ?? "", /17 Jul 2026/);
});

test("parseFeedEntries: Atom entries parse, rel=alternate wins over rel=self", () => {
  const e = parseFeedEntries(ATOM);
  assert.equal(e.length, 1);
  assert.equal(e[0].url, "https://ww2.arb.ca.gov/rulemaking/lcfs-2026");
  assert.equal(e[0].anchorText, "LCFS amendment package");
});

test("walkFeed: error body → ok:false INCONCLUSIVE (never an empty feed)", async () => {
  const r = await walkFeed(
    { fetchText: async () => "<html><body>403 Forbidden — Access denied</body></html>", persist: async () => ({ upserted: 0, failed: 0 }) },
    { feedUrl: "https://x.example/feed" }
  );
  assert.equal(r.ok, false);
  assert.match(/** @type {any} */ (r).error, /error-body gate/);
});

test("walkFeed: non-feed HTML with zero entries → ok:false 'not a feed'", async () => {
  const r = await walkFeed(
    { fetchText: async () => "<html><body>Welcome to our regular web page with plenty of content here.</body></html>", persist: async () => ({ upserted: 0, failed: 0 }) },
    { feedUrl: "https://x.example/feed" }
  );
  assert.equal(r.ok, false);
  assert.match(/** @type {any} */ (r).error, /not a feed/);
});

test("walkFeed: real feed persists entries through the injected write-site", async () => {
  const persisted = [];
  const r = await walkFeed(
    { fetchText: async () => RSS, persist: async (links) => { persisted.push(...links); return { upserted: links.length, failed: 0 }; } },
    { feedUrl: "https://ww2.arb.ca.gov/rss.xml" }
  );
  assert.equal(r.ok, true);
  assert.equal(/** @type {any} */ (r).entries, 1);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].url, "https://ww2.arb.ca.gov/news/acf-amendments");
});
