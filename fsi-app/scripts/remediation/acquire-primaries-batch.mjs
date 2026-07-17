#!/usr/bin/env node
// acquire-primaries-batch.mjs — BATCH free acquisition of authoritative primaries (the o9 template at scale).
// Operator dispatch 2026-07-16 "collect all the data and source everything for all items". $0, guarded, existing
// mechanisms only (fetch + unpdf + extractPortalLinks + officialness gate + snapshot-store + guarded writes).
//
// PER ITEM (retrieval-before-generation first, no fabrication, no guessed tier, no fake-cert):
//   0. RETRIEVAL-FIRST: if the item already holds a floor-qualifying path-'a' snapshot, skip (free-pass will source).
//   1. CANDIDATES: source_url if it is a PDF; else fetch source_url (html) and extractPortalLinks -> enacted deep-links
//      (PDFs preferred); plus the item's pool corroborator URLs. Programmatic fetch only (Browserless is frozen; a
//      JS/bot-walled portal that yields no candidate HOLDS for manual Chrome capture, never a guess).
//   2. For each candidate (bounded): free-capture (direct fetch -> unpdf for PDF / htmlToText for HTML), resolve the
//      host's CODIFIED tier (codifiedTierForHost/classTierForHost — legal 1 / gov 2 / ruled classes; NULL = not
//      deterministically knowable -> do NOT register, HOLD). Run officialnessOf(text, host, {hostTier, floorTier}).
//      Accept the FIRST candidate at path 'a' (official instrument past the nav, host clears the floor).
//   3. On accept: registerSource(honest codified tier) -> writeSnapshot(raw_fetches, round-trip) -> repoint item
//      (source_id + source_url) off any portal to the instrument. On no-accept: HOLD (integrity_flag, honest reason).
// Re-attribution of verbatim spans runs AFTER via free-pass-run.mjs (separate $0 pass). Synthesized-span items are
// captured + repointed + staged (re-extraction is the executor step), never force-stamped.
//
// Run: --dry-run (default) | --execute   [--only=key,key]  [--limit=N]

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { readClient, readAll, registerSource, guardedUpdate, guardedInsert } from "../lib/db.mjs";
import { writeSnapshot, getSnapshot } from "../../src/lib/sources/snapshot-store.mjs";
import { officialnessOf } from "../../src/lib/sources/officialness.mjs";
import { extractPortalLinks } from "../../src/lib/sources/portal-links.mjs";
import { looksLikePdfUrl, classifyBody, pdfToText } from "../../src/lib/sources/pdf-extract.mjs";
import { classTierForHost } from "../../src/lib/sources/host-authority.ts";
import { authorityFloorFor } from "../../src/lib/agent/source-blocks.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const EXECUTE = process.argv.includes("--execute");
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--only=")); return a ? a.slice(7).split(",").filter(Boolean) : null; })();
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();

const sb = readClient();
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const MAXCH = 400000;

function htmlToText(html) {
  return String(html || "").replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&(?:[a-z]+|#\d+);/gi, " ").replace(/\s+/g, " ").trim();
}
// Free programmatic fetch. Returns { rawHtml|null, text, ok }. PDF -> unpdf text (no rawHtml). Bounded, no retry.
async function freeFetch(url) {
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; CarosLedge/1.0)" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
    if (!r.ok) return { ok: false, reason: `http ${r.status}` };
    const u8 = new Uint8Array(await r.arrayBuffer());
    if (classifyBody(r.headers.get("content-type"), u8) === "pdf") {
      const { text } = await pdfToText(u8, MAXCH);
      return { ok: true, rawHtml: null, text };
    }
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(u8);
    return { ok: true, rawHtml: raw, text: htmlToText(raw).slice(0, MAXCH) };
  } catch (e) { return { ok: false, reason: String(e?.message || e).slice(0, 80) }; }
}

async function alreadyHoldsPrimary(item, floor) {
  if (!item.source_id) return false;
  try { const s = await getSnapshot(sb, { sourceId: item.source_id }); if (!s.found) return false;
    const { data: src } = await sb.from("sources").select("url,base_tier,tier_override").eq("id", item.source_id).maybeSingle();
    const tier = src?.tier_override ?? src?.base_tier ?? null;
    return officialnessOf(s.content, hostOf(src?.url), { hostTier: tier, floorTier: floor }).path === "a";
  } catch { return false; }
}

async function candidatesFor(item) {
  const cands = [];
  if (item.source_url && looksLikePdfUrl(item.source_url)) cands.push(item.source_url);
  else if (item.source_url) {
    const f = await freeFetch(item.source_url);
    if (f.ok && f.rawHtml) { for (const l of extractPortalLinks(f.rawHtml, item.source_url)) cands.push(l.url); }
    if (f.ok && !f.rawHtml) cands.push(item.source_url); // source_url was itself a PDF by content-type
    cands.push(item.source_url); // the page itself, as a last candidate (officialness will judge)
  }
  // pool corroborators that look enacted (retrieval-first: the enacted URL may already be discovered)
  const { data: pool } = await sb.from("agent_run_searches").select("result_url").eq("intelligence_item_id", item.id);
  for (const p of pool || []) { const u = p.result_url || ""; if (/eur-lex|legislation\.gov|federalregister|ecfr|lovdata|\.pdf/i.test(u)) cands.push(u); }
  // prefer PDFs first, dedup, cap
  return [...new Set(cands)].sort((a, b) => (looksLikePdfUrl(b) ? 1 : 0) - (looksLikePdfUrl(a) ? 1 : 0)).slice(0, 5);
}

async function main() {
  let items = await readAll("intelligence_items", "id,legacy_id,title,item_type,source_id,source_url",
    { match: (q) => q.eq("is_archived", false).neq("provenance_status", "verified") });
  if (ONLY) items = items.filter((it) => ONLY.includes(it.legacy_id) || ONLY.some((k) => it.id.startsWith(k)));
  items = items.slice(0, LIMIT === Infinity ? items.length : LIMIT);
  console.log(`\n===== ACQUIRE PRIMARIES BATCH (${EXECUTE ? "EXECUTE" : "DRY-RUN"}) — ${items.length} non-verified items =====\n`);

  const out = [];
  let acquired = 0, held = 0, already = 0, exempt = 0;
  for (const it of items) {
    const key = it.legacy_id || it.id.slice(0, 8);
    const floor = authorityFloorFor(it.item_type);
    if (floor == null) { exempt++; out.push({ key, outcome: "EXEMPT-type" }); continue; }
    if (await alreadyHoldsPrimary(it, floor)) { already++; out.push({ key, outcome: "ALREADY-HOLDS-PRIMARY" }); console.log(`  ${key.padEnd(20)} ALREADY holds a floor primary`); continue; }

    const cands = await candidatesFor(it);
    let accepted = null;
    for (const url of cands) {
      const host = hostOf(url);
      const tier = classTierForHost(host); // codified legal/gov/ruled-class; NULL = not knowable -> skip (no guess)
      if (tier == null || tier > floor) continue;
      const f = await freeFetch(url);
      if (!f.ok || (f.text || "").length < 200) continue;
      const off = officialnessOf(f.text, host, { hostTier: tier, floorTier: floor });
      if (off.path !== "a") continue;
      accepted = { url, host, tier, text: f.text };
      break;
    }

    if (!accepted) { held++; out.push({ key, id: it.id, outcome: "HOLD-no-qualified-primary", cands: cands.length, source_url: it.source_url });
      console.log(`  ${key.padEnd(20)} HOLD (no path-'a' floor primary among ${cands.length} candidates)`);
      if (EXECUTE) await guardedInsert("integrity_flags", { category: "source_issue", subject_type: "item", subject_ref: it.id,
        description: `Batch acquisition: no floor-qualifying path-'a' primary found free among ${cands.length} candidates (source_url + portal deep-links + pool). Held for manual Chrome capture or non-EN officialness gap; no tier guessed.`,
        recommended_actions: [{ action: "manual-primary-capture", rationale: "programmatic fetch found no path-'a' floor primary; needs Chrome/unpdf manual capture or the host tier assigned by operator (non-codified regulator)." }],
        status: "open", created_by: "acquire-primaries-batch-2026-07-16" }, { cite: { skill: "remediation-discipline", reason: "batch acquisition honest hold: no free path-'a' floor primary; no guess (integrity)" } }).catch(() => {});
      continue; }

    console.log(`  ${key.padEnd(20)} ACQUIRE tier ${accepted.tier} <- ${accepted.host} (${accepted.text.length}ch, path a)`);
    if (EXECUTE) {
      const cite = { skill: "source-credibility-model", reason: `batch acquisition: register authoritative primary host ${accepted.host} at codified tier ${accepted.tier}, snapshot the enacted text as a floor capture, repoint item off any portal (o9 template)` };
      const reg = await registerSource({ url: accepted.url, name: accepted.host, base_tier: accepted.tier }, { cite });
      await writeSnapshot(svc, reg.source_id, { html: accepted.text, status: 200 });
      await guardedUpdate("intelligence_items", (qb) => qb.eq("id", it.id), { source_id: reg.source_id, source_url: accepted.url },
        { cite: { skill: "remediation-discipline", reason: `batch acquisition: repoint ${key} to its captured authoritative primary` } });
    }
    acquired++; out.push({ key, id: it.id, outcome: "ACQUIRED", host: accepted.host, tier: accepted.tier, url: accepted.url });
  }

  console.log(`\n===== SUMMARY (${EXECUTE ? "applied" : "dry-run"}) =====`);
  console.log(`  ACQUIRED primary + snapshot + repoint: ${acquired}`);
  console.log(`  ALREADY held a floor primary: ${already}`);
  console.log(`  HELD (no free path-'a' primary): ${held}`);
  console.log(`  EXEMPT item type: ${exempt}`);
  mkdirSync(resolve(ROOT, "scripts/tmp"), { recursive: true });
  writeFileSync(resolve(ROOT, `scripts/tmp/acquire-batch-${EXECUTE ? "applied" : "dryrun"}.json`), JSON.stringify({ acquired, already, held, exempt, out }, null, 2));
  console.log(`  manifest -> scripts/tmp/acquire-batch-${EXECUTE ? "applied" : "dryrun"}.json`);
  if (EXECUTE) console.log(`\n  NEXT: run free-pass-run.mjs --apply to re-attribute verbatim spans to the newly-captured primaries.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
