// capture-worker v1.3 — Caro's Ledge server-side document capture.
// CONTRACT (operator-approved, 2026-08-01; v1.3 extension operator-directed 2026-08-02):
//  1. Raw decoded body stored verbatim. No summarization, no normalization, no cleaning.
//     Declared transforms only:
//       - charset decode to UTF-8
//       - (v1.2) removal of U+0000 null characters which Postgres text columns cannot
//         store — removal count recorded in the run row so the deviation is never silent
//       - (v1.3) PDF TEXT EXTRACTION for content-type application/pdf, via unpdf
//         (pdf.js). The extracted text layer is stored, page count / byte count /
//         extracted-char count recorded as a declared_transform entry in the run row.
//         A PDF whose text layer is empty or tiny (scanned/image PDF) is recorded as a
//         clean failure — OCR is NOT supported and is never silently faked.
//  2. Strictly additive to agent_run_searches: never updates or deletes existing evidence rows.
//  3. Failures recorded as failures; error pages / shells / walls NEVER stored as captures.
//     Non-PDF binary content-types (images, octet-stream, zip, word) remain clean
//     'unsupported content-type' failures.
//  4. Idempotent per final URL.
//  5. intelligence_item_id populated when exactly one non-archived item references the
//     capture's source_id; otherwise NULL = pool-scoped (discover by URL/signature).
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
// v1.3: application/pdf is handled; the rest stay refused.
const UNSUPPORTED_BINARY_TYPES = ["image/", "application/octet-stream", "application/zip", "application/msword", "application/vnd"];
const MAX_PDF_BYTES = 25 * 1024 * 1024; // refuse pathological downloads, recorded honestly

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
    if (row.status !== "queued") {
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
    await supabase.from("pending_first_fetch").update({
      attempt_count: row.attempt_count + 1, last_attempt_at: new Date().toISOString(),
      status: "error", last_error_text: report.detail,
    }).eq("id", row.id);
    return report;
  }
  report.url = src.url;

  let itemId: string | null = null;
  const { data: items } = await supabase.from("intelligence_items")
    .select("id").eq("source_id", src.id).eq("is_archived", false).limit(2);
  if (items && items.length === 1) itemId = items[0].id;
  report.intelligence_item_id = itemId;

  await supabase.from("pending_first_fetch").update({
    attempt_count: row.attempt_count + 1, last_attempt_at: new Date().toISOString(), status: "fetching",
  }).eq("id", row.id);

  const runStart = Date.now();
  let resp: Response, text: string;
  let isPdf = false;
  let title: string | null = null;
  try {
    resp = await fetch(src.url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CarosLedge-CaptureWorker/1.3)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.9,*/*;q=0.8",
        "Accept-Language": "en",
      },
    });
    report.http_status = resp.status;
    const ctype = (resp.headers.get("content-type") || "").toLowerCase();
    report.content_type = ctype;
    isPdf = ctype.startsWith("application/pdf");
    if (!isPdf && UNSUPPORTED_BINARY_TYPES.some((b) => ctype.startsWith(b) || ctype.includes(b))) {
      report.detail = `unsupported content-type (${ctype}): binary document, text extraction not supported, NOT stored`;
      await recordFailure(supabase, row, src, report, runStart);
      return report;
    }
    if (isPdf) {
      // v1.3 declared transform: PDF text-layer extraction. The bytes are decoded by
      // pdf.js (via unpdf); the stored capture is the extracted text layer, page-merged
      // in document order. No OCR: an image-only PDF yields ~0 chars and fails honestly.
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
      text = await resp.text();
    }
  } catch (e) {
    report.detail = `fetch error: ${(e as Error).message}`;
    await recordFailure(supabase, row, src, report, runStart);
    return report;
  }

  // v1.2: strip U+0000 (unstorable in Postgres text); count and declare.
  const beforeLen = text?.length ?? 0;
  if (text && text.includes("\u0000")) {
    text = text.replaceAll("\u0000", "");
    report.nulls_removed = beforeLen - text.length;
  }
  report.chars = text?.length ?? 0;

  if (resp.status !== 200) {
    report.detail = `non-200 status ${resp.status}, body NOT stored`;
    await recordFailure(supabase, row, src, report, runStart);
    return report;
  }
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
  if (runErr) { report.detail = `agent_runs insert failed: ${runErr.message}`; return report; }
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
  if (capErr) { report.detail = `capture insert failed: ${capErr.message}`; return report; }

  await supabase.from("pending_first_fetch").update({ status: "done", last_error_text: null }).eq("id", row.id);
  report.outcome = "captured";
  const scope = itemId ? "item-linked" : "pool-scoped";
  report.capture_id = cap.id;
  report.detail = isPdf
    ? `pdf text layer stored (${report.pdf_pages} pages, declared transform), ${scope}`
    : `stored verbatim, ${scope}`;
  return report;
}

// deno-lint-ignore no-explicit-any
async function recordFailure(supabase: any, row: any, src: any, report: Record<string, unknown>, runStart: number) {
  await supabase.from("agent_runs").insert({
    source_id: src.id, source_url: src.url, fetch_method: "capture-worker",
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
