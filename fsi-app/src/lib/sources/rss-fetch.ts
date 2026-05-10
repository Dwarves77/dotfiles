// RSS / Atom source fetcher.
//
// Used by the access_method routing switch in /api/agent/run when a
// source's access_method is "rss". Returns a BrowserlessResult-shaped
// object so the downstream pipeline (raw persist, classification,
// intelligence_items write) is unchanged.
//
// This is a feed-pull, not a per-item walk. The classifier sees the
// concatenated feed body (channel description + recent item titles
// and summaries). Per-item walking happens in a follow-up wave when
// individual feed entries become first-class intelligence_items.

import type { BrowserlessResult } from "@/lib/sources/browserless";

export class RssFetchError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly renderMs?: number
  ) {
    super(message);
    this.name = "RssFetchError";
  }
}

export interface RssFetchSource {
  url: string;
  rss_feed_url?: string | null;
}

export interface RssFetchOptions {
  /** Cap stripped-text output length (chars). Default: 100000. */
  maxTextLength?: number;
  /** Network timeout in ms. Default: 20000. */
  timeoutMs?: number;
  /** Maximum number of items to include in the text body. Default: 25. */
  maxItems?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_TEXT = 100_000;
const DEFAULT_MAX_ITEMS = 25;

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractTag(scope: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = scope.match(re);
  if (!m) return null;
  return stripTags(stripCdata(m[1]));
}

function rssFeedToText(html: string, maxItems: number, maxChars: number): string {
  // Channel-level metadata.
  const channel = html.match(/<channel[^>]*>([\s\S]*?)<\/channel>/i);
  const feed = html.match(/<feed[^>]*>([\s\S]*?)<\/feed>/i);
  const root = channel?.[1] ?? feed?.[1] ?? html;

  const channelTitle = extractTag(root, "title") ?? "";
  const channelDesc = extractTag(root, "description") ?? extractTag(root, "subtitle") ?? "";

  // Item-level extraction. RSS uses <item>, Atom uses <entry>.
  const items: string[] = [];
  const itemRe = /<(item|entry)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = itemRe.exec(root)) !== null && count < maxItems) {
    const inner = m[2];
    const t = extractTag(inner, "title") ?? "";
    const d =
      extractTag(inner, "description") ??
      extractTag(inner, "summary") ??
      extractTag(inner, "content") ??
      "";
    const link = extractTag(inner, "link") ?? "";
    const pub = extractTag(inner, "pubDate") ?? extractTag(inner, "updated") ?? "";
    items.push(`Title: ${t}\nLink: ${link}\nDate: ${pub}\nSummary: ${d}\n`);
    count++;
  }

  const composed =
    `Channel: ${channelTitle}\nDescription: ${channelDesc}\nItems (${items.length}):\n\n` +
    items.join("\n---\n");
  return composed.slice(0, maxChars);
}

export async function rssFetch(
  source: RssFetchSource,
  options: RssFetchOptions = {}
): Promise<BrowserlessResult> {
  const url = source.rss_feed_url ?? source.url;
  if (!url) {
    throw new RssFetchError("rss_feed_url and url both empty");
  }
  const {
    maxTextLength = DEFAULT_MAX_TEXT,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxItems = DEFAULT_MAX_ITEMS,
  } = options;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  let status = 0;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "CarosLedge-Ingest/1.0",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.5",
      },
      signal: controller.signal,
    });
    status = res.status;
    if (!res.ok) {
      const body = await res.text();
      throw new RssFetchError(
        `RSS ${res.status}: ${body.slice(0, 200)}`,
        res.status,
        Date.now() - start
      );
    }
    const html = await res.text();
    const text = rssFeedToText(html, maxItems, maxTextLength);
    return {
      status,
      html,
      text,
      htmlLength: html.length,
      textLength: text.length,
      renderMs: Date.now() - start,
    };
  } catch (e: unknown) {
    if (e instanceof RssFetchError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new RssFetchError(msg, status || undefined, Date.now() - start);
  } finally {
    clearTimeout(timeoutHandle);
  }
}
