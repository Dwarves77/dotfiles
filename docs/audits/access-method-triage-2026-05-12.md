# Access-Method Triage, 2026-05-12

Three Task 6 sources rolled back during the drain-worker patch flips.
This is a research + recommend document. NO flips executed, NO rows changed.
Hold for operator review before any access_method change.

DB row resolution (from `sources` table, queried 2026-05-12):

| Source | id | url | access_method | source_role | auto_run_enabled |
|---|---|---|---|---|---|
| US Securities and Exchange Commission (SEC) | `390fb3eb-c17c-474e-9783-d0c71822c37b` | `https://www.sec.gov/` | scrape | primary_legal_authority | false |
| Carbon Pulse | `e1cf70bc-7981-4c83-b9f3-bae57b035cee` | `https://carbon-pulse.com/` | scrape | trade_press | false |
| Gallery Climate Coalition (research) | `f81c2cd0-2627-4e92-aa07-478ef395c2a2` | `https://galleryclimatecoalition.org/research/` | scrape | academic_research | false |

The "GCC about + resources" row (`5cb7d618`, `/about/`) succeeded in the flip and
is NOT included here; the research row is the URL-split sibling that failed.

The four `access_method` enum values used in the codebase today are: `scrape`,
`rss`, `api`, and `none` (per `src/lib/sources/`). No schema migration needed
to route any of these three sources to a different fetcher.

---

## 1. SEC (id `390fb3eb-c17c-474e-9783-d0c71822c37b`)

### A. Failure mode
- Flip log: pre-fetch returned an API rate-limit HTML page; Haiku titled the
  stub "SEC.gov API Rate Threshold Exceeded — Developer Access Guidelines",
  agent route 412'd, no brief produced.
- Direct curl from a developer workstation with a custom UA returns HTTP 200,
  text/html, 224 KB body within 220 ms. The failure is specific to
  Browserless's default Chrome UA / IP class; SEC's edge enforces its
  `User-Agent` policy (Sample Company AdminContact@<company>.com) and serves
  a 200-OK throttle page to non-compliant UAs.
- Consistent across retries while UA stays non-compliant.
- Observed at the cron time of the Task 6 drain flip; not time-of-day related.

### B. Alternative endpoints evaluated
- EDGAR Atom (recent filings):
  `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=10-K&count=40&output=atom`
  Returns 200 / `application/atom+xml` with compliant UA (probed today).
  Returns 403 with generic UA.
- Press releases RSS: `https://www.sec.gov/news/pressreleases.rss` returns
  200 / `application/rss+xml`, 17.8 KB, 25 items. Works without a compliant UA
  in this probe (CDN cache likely serves it from edge).
- Statements RSS: `https://www.sec.gov/news/statements.rss` returns 200,
  12.4 KB. Speeches feed is 301 to newsroom; redirect chain works.
- Sitemap: `https://www.sec.gov/sitemap.xml` exists but is enormous and not
  the right primary signal for a regulatory-watch role.
- Bulk JSON API at `https://data.sec.gov/` is filings-level (CIK indexed); not
  the right granularity for a "what is the SEC announcing" feed.

### C. Cost implications
- Browserless: dropping this source removes one slow render per cron tick.
- SEC EDGAR: free, no auth, hard limit 10 requests/sec per IP; one feed pull
  per source per drain tick is far below the limit.
- Operational requirement: SEC's fair-access policy mandates a contact-email
  User-Agent. Set globally in the fetcher, no per-source secret required.

### D. Recommended path
Switch this row to `access_method=rss` with `rss_feed_url=https://www.sec.gov/news/pressreleases.rss`,
add a SEC-compliant `User-Agent` (e.g. `FSI Agent jasonlosh@gmail.com`) to the
RSS fetcher's outbound headers, and abandon the homepage scrape entirely.

### E. Implementation effort
- Schema: none. `access_method=rss` and `rss_feed_url` already exist.
- Code: small. The RSS fetcher (`src/lib/sources/rss-fetch.ts`) needs a UA
  header (the SEC fair-access string) on outbound requests; this benefits any
  future SEC-hosted feed too. A single env var (`SEC_FAIR_ACCESS_UA`) avoids
  hard-coding an email.
- Row change: small. Update access_method + rss_feed_url for one row.
- Complexity: small.

---

## 2. Carbon Pulse (id `e1cf70bc-7981-4c83-b9f3-bae57b035cee`)

### A. Failure mode
- Flip log: pre-fetch returned a Cloudflare interstitial; Haiku titled the
  stub "Carbon Pulse Website Access — Security Verification Page", agent
  route 412'd, no brief.
- Direct curl with a generic UA returns 200 / text/html, 179 KB, ~960 ms.
  Cloudflare's bot-fight gating selectively challenges headless browsers (JS
  detection, Chrome DevTools Protocol fingerprints) but lets server-side
  curl through for static page reads.
- Consistent — Cloudflare's challenge is deterministic given the same
  client signature; Browserless's default headless Chrome trips it every time.
- Time-of-day independent.

### B. Alternative endpoints evaluated
- WordPress RSS at `https://carbon-pulse.com/feed/` returns 200 /
  `application/rss+xml`, 17.8 KB, 10 items, `lastBuildDate` updated today.
  No challenge served, no auth required.
- Sitemap exists (Yoast SEO default) and is reachable but the feed is
  sufficient for headline-level intel scanning.
- Carbon Pulse runs a freemium model: free preview headlines on the public
  site, full bodies behind a paid subscription
  (`/about/subscriptions/`). No documented public API. The RSS already
  contains the same preview-level body that the homepage exposes, so RSS
  buys us the same content the scrape was after — full bodies are gated
  regardless of fetch path.
- No authenticated-session shortcut without paying.
- archive.org has partial coverage; not needed.

### C. Cost implications
- Browserless: removes one render per tick, avoids the Cloudflare-challenge
  retry storm.
- RSS: free, no rate-limit issues at our volume.
- Paid API tier: not pursued — would only matter if we wanted full bodies,
  and that is a product decision, not a fetch-method decision.

### D. Recommended path
Switch this row to `access_method=rss` with
`rss_feed_url=https://carbon-pulse.com/feed/`; accept that we capture
headline + preview only, which matches the public-site signal anyway.

### E. Implementation effort
- Schema: none.
- Code: none beyond the row update; the existing RSS fetcher handles WP
  feeds out of the box (rss-fetch.ts already targets this shape).
- Row change: small.
- Complexity: small.

---

## 3. Gallery Climate Coalition — research (id `f81c2cd0-2627-4e92-aa07-478ef395c2a2`)

### A. Failure mode
- Flip log: pre-fetch failed with `Browserless 500: TimeoutError: Navigation
  timeout of 15000 ms exceeded`.
- Direct curl returns HTTP 404, text/html, 1559 bytes. With follow-redirects,
  still 404 — the URL `https://galleryclimatecoalition.org/research/` does
  not exist on the live site. Browserless hangs because the 404 page likely
  client-side renders error UI past the `waitForSelector('body')` window.
- This is a URL-split error during classification. The about+resources row
  was split into about-and-resources (`/about/`) and research (`/research/`),
  but only the former exists. The actual research-style content lives at
  `/resources/` (200, 73 KB) and under `/news/` (commissioned reports,
  11 items in sitemap excluding `/de/` localization).
- Consistent — it's a 404, not a CDN behavior.

### B. Alternative endpoints evaluated
- `/resources/`: returns 200, 73 KB; this is the actual "research outputs"
  hub. Lists carbon calculator, commissioned reports, member tools.
- `/feed/`: returns 200 but is structurally empty (no `<item>` elements —
  site does not publish a posts feed). Not usable.
- `/sitemap.xml`: 200, 26 KB, lists 11 news/research entries (post
  localization-filter) including commissioned reports. Could power a
  per-page walker but overkill for a tier-3 source.
- No API. archive.org coverage exists but is not needed.

### C. Cost implications
- Browserless: removes a guaranteed-timeout render per tick (worst case for
  drain throughput).
- A `/resources/` scrape is one cheap render, well below Browserless
  timeout.

### D. Recommended path
Update this row's `url` to `https://galleryclimatecoalition.org/resources/`
and keep `access_method=scrape`; the URL-split during classification picked
a path that does not exist, so the fix is to point the row at the actual
research-output hub, not to change the fetch method.

### E. Implementation effort
- Schema: none.
- Code: none.
- Row change: small (one column update, plus a note in
  `classification_rationale` recording the URL correction).
- Complexity: small. Operator should confirm `/resources/` matches the
  `academic_research` source-role intent before applying.

---

## Cross-source observations

1. Two of three failures (SEC, Carbon Pulse) are CDN/bot-defense reactions
   to Browserless's headless Chrome signature, not real fetch barriers.
   First-party feeds exist and bypass the protection entirely. This pattern
   will repeat for every high-traffic / Cloudflare-fronted source we add;
   the drain worker should treat "pre-fetch returns interstitial" as a
   strong signal to prefer RSS discovery before retrying.
2. One of three (GCC research) is a data-quality bug from the URL-split
   classification step, not a fetch problem. The URL-split logic should
   validate target URLs return 200 before committing the split, or the
   classifier should emit candidate URLs the operator confirms before they
   land in `sources.url`.
3. The `access_method` enum (`scrape | rss | api | none`) is sufficient for
   all three remediations. No schema migration required.
4. SEC fair-access UA is a global concern: a `SEC_FAIR_ACCESS_UA` env var
   plumbed through the RSS and scrape fetchers fixes this row and prevents
   future SEC-hosted feeds from regressing.
5. Recommended drain-worker behavior: when an HTML pre-fetch returns under
   ~5 KB and contains tokens like "rate limit", "verification", "checking
   your browser", or "challenge-platform", surface a soft-fail with a
   "consider RSS" hint rather than retrying the same scrape.

## Related

- [WORKER-ACTIVATION-AUDIT-2026-05-08](./WORKER-ACTIVATION-AUDIT-2026-05-08.md) — Both diagnose the same source-fetch worker path; triage explains why the drain fetches fail (Browserless UA/Cloudflare) that this audit's ingestion…
- [four-page-architecture-survey-2026-05-09](./four-page-architecture-survey-2026-05-09.md) — Shares the access_method enum and sources fetch-config columns; the survey documents the enum's distribution and migration 056 extension
