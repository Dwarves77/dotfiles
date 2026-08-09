// capture-worker v1.4 — Caro's Ledge server-side document capture.
// CONTRACT (operator-approved, 2026-08-01; v1.3 PDF extension 2026-08-02;
//  v1.4 transient-retry + charset + atomic-claim + content-type allowlist, 2026-08-09):
//  1. Raw decoded body stored verbatim. No summarization, no normalization, no cleaning.
//     Declared transforms only:
//       - charset decode to UTF-8 (v1.4: honors the response's declared charset, not a
//         blind UTF-8 read — a Latin-1/1252 page no longer stores as U+FFFD mojibake)
//       - (v1.2) removal of U+0000 null characters which Postgres text columns cannot
//         store — removal count recorded in the run row so the deviation is never silent
//       - (v1.3) PDF TEXT EXTRACTION for content-type application/pdf, via unpdf
//         (pdf.js). Extracted text layer stored; page/byte/char counts declared. No OCR.
//  2. Strictly additive to agent_run_searches: never updates or deletes existing evidence rows.
//  3. Failures recorded as failures; error pages / shells / walls NEVER stored as captures.
//     v1.4: content-type is an ALLOWLIST (text/xml/json/html/pdf) — video/audio/wasm and
//     other binaries are clean 'unsupported content-type' failures, not decoded to garbage.
//  4. Idempotent per final URL.
//  5. intelligence_item_id populated when exactly one non-archived item references the
//     capture's source_id; otherwise NULL = pool-scoped (discover by URL/signature).
//
//  v1.4 TRANSIENT-RETRY (the fix for the EUR-Lex cold-start wedge): a TRANSIENT non-200
//  (HTTP 202 async/warm-up, 408, 429, 5xx) or a network fetch error RE-QUEUES the row
//  (status='queued') up to MAX_ATTEMPTS instead of terminalizing it. EUR-Lex answers a
//  cold request with 202 then 200 seconds later; before v1.4 the 202 became a terminal
//  'error' and migration-065's partial unique index left the row occupying the source's
//  slot, blocking re-enqueue forever. Only PERMANENT statuses (404/410/401/403/…) and
//  post-cap exhaustion terminalize as 'error'.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { extractText, getDocumentProxy, getMeta } from "npm:unpdf@0";

const ERROR_MARKERS = [
  "Attention Required! | Cloudflare",
  "Just a moment...",
  "cf-error-details",
  "Request unsuccessful. Incapsula",
  "Access Denied</title>",
  "error-page-container",
];
const MIN_BYTES = 1000;
const MAX_PDF_BYTES = 25 * 1024 * 1024; // refuse pathological downloads, recorded honestly

// v1.4: transient statuses that warrant a re-queue rather than a terminal failure.
// 202 = Accepted (EUR-Lex cold-start warm-up); 408 = Request Timeout; 429 = Too Many
// Requests; 5xx = server-side transient. A network-level fetch throw is also transient.
const RETRYABLE_STATUS = new Set([202, 408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 5;

// v1.4: content-type ALLOWLIST for the non-PDF text path. Anything not text-ish and not
// PDF is a clean unsupported failure — never decoded and stored as a "capture".
function isTextType(ct: string): boolean {
  if (!ct) return true; // servers that omit content-type: treat as text, MIN_BYTES/marker gates still apply
  return (
    ct.startsWith("text/") ||
    ct.includes("html") ||
    ct.includes("xml") ||
    ct.includes("json") ||
    ct.includes("+text")
  );
}

// v1.4: decode bytes using the response's declared charset, falling back to UTF-8.
// Fixes the mojibake class (Latin-1/1252 government pages) that made stored captures
// impossible for the grounder to span-match against.
function decodeBody(buf: ArrayBuffer, ctype: string): string {
  const m = /charset=([^;]+)/i.exec(ctype);
  const declared = m ? m[1].trim().replace(/["']/g, "").toLowerCase() : "";
  for (const cs of [declared, "utf-8"]) {
    if (!cs) continue;
    try {
      return new TextDecoder(cs, { fatal: false }).decode(buf);
    } catch {
      /* unknown charset label — try the next */
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

Deno.serve(async (req: Request) => {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty ok */ }
  const limit = Math.min(Number(body.limit ?? 3), 10);
  const queueIds = Array.isArray(body.queue_ids) ? (body.queue_ids as string[]) : null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let q;
  if (queueIds) {
    q = supabase.from("pending_first_fetch")
      .select("id, source_id, status, attempt_count").in("id", queueIds);
  } else {
    q = supabase.from("pending_first_fetch")
      .select("id, source_id, status, attempt_count")
      .eq("status", "queued").order("queued_at").limit(limit);
  }
  const { data: queue, error: qErr } = await q;
  if (qErr) return json({ error: qErr.message }, 500);

  const results = [];
  for (const row of queue ?? []) {
    // An explicit queue_ids replay may target a row currently at 'error' (a v1.3 wedge)
    // — accept 'queued' and 'error' for explicit replays; the default drain stays queued-only.
    if (row.status !== "queued" && !(queueIds && row.status === "error")) {
      results.push({ queue_id: row.id, outcome: "skipped", detail: `status=${row.status}, not queued` });
      continue;
    }
    results.push(await processRow(supabase, row));
  }
  return json({ processed: results.length, results });
});

// deno-lint-ignore no-explicit-any
async function processRow(supabase: any, row: any) {
  const report: Record<string, unknown> = {
    queue_id: row.id, source_id: row.source_id, outcome: "error",
    http_status: null, chars: null, capture_id: null, run_id: null,
    intelligence_item_id: null, content_type: null, nulls_removed: 0,
    pdf_pages: null, pdf_bytes: null, detail: null, url: null,
  };

  const { data: src, error: sErr } = await supabase.from("sources")
    .select("id, url, name").eq("id", row.source_id).single();
  if (sErr || !src?.url) {
    report.detail = "source row or url missing";
    await recordFailure(supabase, row, src ?? { id: row.source_id, url: null }, report, Date.now());
    return report;
  }
  report.url = src.url;

  let itemId: string | null = null;
  const { data: items, error: itemsErr } = await supabase.from("intelligence_items")
    .select("id").eq("source_id", src.id).eq("is_archived", false).limit(2);
  if (itemsErr) {
    // Don't silently pool-scope on a read error (repo error-swallow post-mortem class):
    // a transient read failure should retry, not mislabel scope.
    report.detail = `item-scope read failed: ${itemsErr.message}`;
    await recordRetry(supabase, row, src, report, Date.now(), 0);
    return report;
  }
  if (items && items.length === 1) itemId = items[0].id;
  report.intelligence_item_id = itemId;

  // v1.4 ATOMIC CLAIM: only transition queued/error → fetching if we win the row.
  // Two concurrent invocations can no longer both fetch the same source.
  const { data: claimed } = await supabase.from("pending_first_fetch").update({
    attempt_count: row.attempt_count + 1, last_attempt_at: new Date().toISOString(), status: "fetching",
  }).eq("id", row.id).in("status", ["queued", "error"]).select("id");
  if (!claimed || claimed.length === 0) {
    report.outcome = "skipped";
    report.detail = "row already claimed by another run";
    return report;
  }
  const effectiveAttempt = row.attempt_count + 1;

  const runStart = Date.now();
  let resp: Response, text: string;
  let isPdf = false;
  let title: string | null = null;
  try {
    resp = await fetch(src.url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CarosLedge-CaptureWorker/1.4)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.9,*/*;q=0.8",
        "Accept-Language": "en",
      },
    });
    report.http_status = resp.status;
    const ctype = (resp.headers.get("content-type") || "").toLowerCase();
    report.content_type = ctype;
    isPdf = ctype.startsWith("application/pdf");

    // v1.4: transient non-200 re-queues BEFORE we try to read a warm-up body.
    if (resp.status !== 200) {
      report.detail = `non-200 status ${resp.status}, body NOT stored`;
      if (RETRYABLE_STATUS.has(resp.status) && effectiveAttempt < MAX_ATTEMPTS) {
        await recordRetry(supabase, row, src, report, runStart, resp.status);
      } else {
        await recordFailure(supabase, row, src, report, runStart);
      }
      return report;
    }

    if (!isPdf && !isTextType(ctype)) {
      report.detail = `unsupported content-type (${ctype}): not text/pdf, text extraction not supported, NOT stored`;
      await recordFailure(supabase, row, src, report, runStart);
      return report;
    }

    if (isPdf) {
      const buf = await resp.arrayBuffer();
      report.pdf_bytes = buf.byteLength;
      if (buf.byteLength > MAX_PDF_BYTES) {
        report.detail = `pdf too large (${buf.byteLength} bytes > ${MAX_PDF_BYTES} cap), NOT stored`;
        await recordFailure(supabase, row, src, report, runStart);
        return report;
      }
      try {
        const pdf = await getDocumentProxy(new Uint8Array(buf));
        const { totalPages, text: extracted } = await extractText(pdf, { mergePages: true });
        report.pdf_pages = totalPages;
        text = typeof extracted === "string" ? extracted : String(extracted ?? "");
        try {
          const meta = await getMeta(pdf);
          const t = (meta?.info as Record<string, unknown> | undefined)?.Title;
          if (typeof t === "string" && t.trim().length > 0) title = t.trim().slice(0, 500);
        } catch { /* metadata optional */ }
      } catch (e) {
        report.detail = `pdf extraction failed: ${(e as Error).message}, NOT stored`;
        await recordFailure(supabase, row, src, report, runStart);
        return report;
      }
    } else {
      // v1.4: charset-aware decode instead of a blind UTF-8 resp.text().
      text = decodeBody(await resp.arrayBuffer(), ctype);
    }
  } catch (e) {
    // v1.4: a network-level fetch throw is transient — re-queue under the cap.
    report.detail = `fetch error: ${(e as Error).message}`;
    if (effectiveAttempt < MAX_ATTEMPTS) {
      await recordRetry(supabase, row, src, report, runStart, 0);
    } else {
      await recordFailure(supabase, row, src, report, runStart);
    }
    return report;
  }

  // v1.2: strip U+0000 (unstorable in Postgres text); count and declare.
  const beforeLen = text?.length ?? 0;
  if (text && text.includes("\u0000")) {
    text = text.replaceAll("\u0000", "");
    report.nulls_removed = beforeLen - text.length;
  }
  report.chars = text?.length ?? 0;

  if (!text || text.length < MIN_BYTES) {
    report.detail = isPdf
      ? `pdf text layer too small (${text?.length ?? 0} chars over ${report.pdf_pages ?? "?"} pages) — likely scanned/image PDF, OCR not supported, NOT stored`
      : `body too small (${text?.length ?? 0} chars), NOT stored`;
    await recordFailure(supabase, row, src, report, runStart);
    return report;
  }
  const markerHit = ERROR_MARKERS.find((m) => text.includes(m));
  if (markerHit) {
    report.detail = `error-page marker \"${markerHit}\", NOT stored`;
    await recordFailure(supabase, row, src, report, runStart);
    return report;
  }

  const { data: existing } = await supabase.from("agent_run_searches")
    .select("id").eq("result_url", resp.url)
    .eq("search_query", "capture-worker:first-fetch").limit(1);
  if (existing && existing.length > 0) {
    report.outcome = "duplicate_skipped";
    report.capture_id = existing[0].id;
    report.detail = "worker capture already exists for this final URL";
    await supabase.from("pending_first_fetch").update({ status: "done", last_error_text: null }).eq("id", row.id);
    return report;
  }

  if (!isPdf) {
    const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    title = titleMatch ? titleMatch[1].trim().slice(0, 500) : src.name;
  } else if (!title) {
    title = src.name;
  }

  const runErrors: Record<string, unknown>[] = [];
  if (report.nulls_removed && (report.nulls_removed as number) > 0) {
    runErrors.push({ declared_transform: "u0000-removal", count: report.nulls_removed, at: new Date().toISOString() });
  }
  if (isPdf) {
    runErrors.push({
      declared_transform: "pdf-text-extraction", engine: "unpdf(pdf.js)",
      pages: report.pdf_pages, pdf_bytes: report.pdf_bytes, extracted_chars: report.chars,
      at: new Date().toISOString(),
    });
  }
  const { data: run, error: runErr } = await supabase.from("agent_runs").insert({
    source_id: src.id, source_url: src.url, fetch_method: "capture-worker",
    status: "success", fetch_status: resp.status, fetch_html_bytes: text.length,
    intelligence_item_id: itemId, errors: runErrors,
    ended_at: new Date().toISOString(), duration_ms: Date.now() - runStart,
  }).select("id").single();
  if (runErr) {
    // v1.4: don't leave the row stuck at 'fetching' on a write failure — re-queue it.
    report.detail = `agent_runs insert failed: ${runErr.message}`;
    await recordRetry(supabase, row, src, report, runStart, 0);
    return report;
  }
  report.run_id = run.id;

  const { data: cap, error: capErr } = await supabase.from("agent_run_searches").insert({
    agent_run_id: run.id,
    intelligence_item_id: itemId,
    search_query: "capture-worker:first-fetch",
    result_url: resp.url,
    result_title: title,
    result_index: 0,
    result_content_excerpt: text,
    searched_at: new Date().toISOString(),
  }).select("id").single();
  if (capErr) {
    // A run row exists but the capture insert failed — mark the run failed and re-queue
    // rather than leaving a 'success' run with no body and a wedged 'fetching' row.
    report.detail = `capture insert failed: ${capErr.message}`;
    await supabase.from("agent_runs").update({ status: "error" }).eq("id", run.id);
    await recordRetry(supabase, row, src, report, runStart, 0);
    return report;
  }

  await supabase.from("pending_first_fetch").update({ status: "done", last_error_text: null }).eq("id", row.id);
  report.outcome = "captured";
  const scope = itemId ? "item-linked" : "pool-scoped";
  report.capture_id = cap.id;
  report.detail = isPdf
    ? `pdf text layer stored (${report.pdf_pages} pages, declared transform), ${scope}`
    : `stored verbatim, ${scope}`;
  return report;
}

// v1.4: re-queue a TRANSIENT failure so the next drain retries it (bounded by MAX_ATTEMPTS
// at the call sites). Keeps status='queued' so migration-065's partial unique index does
// not wedge the source slot. Deliberately writes NO agent_runs row: a transient retry is
// not a capture outcome, and agent_runs.status has no 'retry' value (CHECK: running/
// success/skipped/error) — the requeue + last_error_text + attempt_count are the record.
// deno-lint-ignore no-explicit-any
async function recordRetry(supabase: any, _row: any, _src: any, report: Record<string, unknown>, _runStart: number, _httpStatus: number) {
  await supabase.from("pending_first_fetch").update({
    status: "queued", last_error_text: `[transient, will retry] ${report.detail}`,
  }).eq("id", _row.id);
  report.outcome = "requeued";
}

// deno-lint-ignore no-explicit-any
async function recordFailure(supabase: any, row: any, src: any, report: Record<string, unknown>, runStart: number) {
  await supabase.from("agent_runs").insert({
    source_id: src.id, source_url: src.url ?? null, fetch_method: "capture-worker",
    status: "error", fetch_status: report.http_status,
    ended_at: new Date().toISOString(), duration_ms: Date.now() - runStart,
    errors: [{ detail: report.detail, content_type: report.content_type, at: new Date().toISOString() }],
  });
  await supabase.from("pending_first_fetch").update({
    status: "error", last_error_text: report.detail,
  }).eq("id", row.id);
  report.outcome = "failed";
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json" },
  });
}
