// @ts-check

import { isErrorBody } from "./entity-gate.mjs";

/** @typedef {{url:string, anchorText:string|null, published:string|null}} FeedEntry */

const strip = (s) => String(s ?? "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/\s+/g, " ")
  .trim();

/** First inner text of `tag` within `block`, or null. @param {string} block @param {string} tag */
function inner(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? strip(m[1]) : null;
}

/**
 * Parse RSS 2.0 <item> and Atom <entry> blocks into FeedEntry rows. https links only; entries without
 * a resolvable link are dropped (the ledger holds fetchable candidates).
 * @param {string} xml @returns {FeedEntry[]}
 */
export function parseFeedEntries(xml) {
  const body = String(xml ?? "");
  /** @type {FeedEntry[]} */
  const out = [];
  const blocks = body.match(/<(?:item|entry)[\s>][\s\S]*?<\/(?:item|entry)>/gi) ?? [];
  for (const b of blocks) {
    // RSS: <link>https://…</link>. Atom: <link href="https://…" [rel="alternate"]/>.
    let link = inner(b, "link");
    if (!link || !/^https?:\/\//i.test(link)) {
      const atom =
        b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) ||
        b.match(/<link[^>]*href=["']([^"']+)["']/i);
      link = atom ? strip(atom[1]) : null;
    }
    if (!link || !/^https:\/\//i.test(link)) continue;
    const title = inner(b, "title");
    const published = inner(b, "pubDate") || inner(b, "published") || inner(b, "updated");
    out.push({ url: link, anchorText: title ? title.slice(0, 300) : null, published });
  }
  return out;
}

/**
 * Walk one feed: fetch (injected) → error-body gate → parse entries → persist (injected).
 * Returns {ok:false} on an unreadable/blocked body — INCONCLUSIVE, never "empty feed".
 * @param {{fetchText:(url:string)=>Promise<string>, persist:(links:Array<{url:string,anchorText?:string|null}>)=>Promise<{upserted:number,failed:number}>}} deps
 * @param {{feedUrl:string}} opts
 * @returns {Promise<{ok:true, feedUrl:string, entries:number, upserted:number, failed:number} | {ok:false, feedUrl:string, error:string}>}
 */
export async function walkFeed(deps, { feedUrl }) {
  let body;
  try {
    body = await deps.fetchText(feedUrl);
  } catch (e) {
    return { ok: false, feedUrl, error: `fetch failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (isErrorBody(body)) {
    return { ok: false, feedUrl, error: "error-body gate: bot-block / error response — inconclusive, not an empty feed" };
  }
  const entries = parseFeedEntries(body);
  if (!entries.length && !/(<rss[\s>]|<feed[\s>])/i.test(body)) {
    return { ok: false, feedUrl, error: `not a feed: no <rss>/<feed> root and 0 entries (${body.length}ch body)` };
  }
  const p = await deps.persist(entries.map((e) => ({ url: e.url, anchorText: e.anchorText })));
  return { ok: true, feedUrl, entries: entries.length, upserted: p.upserted, failed: p.failed };
}
