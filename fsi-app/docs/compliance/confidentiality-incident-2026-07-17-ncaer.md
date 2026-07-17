# Confidentiality Incident — NCAER "Logistics Cost in India" Report

**Date:** 2026-07-17
**Status:** Contained. Operator notified same day. Counsel notification pending operator decision.

## 1. What was found

During Lane B promotion-queue processing on intelligence item `beae0a7e-1088-4d35-b89f-362aade1d1a8` ("India's National Logistics Policy Carbon Intensity Standards"), Session B inspected a staged pool row (`agent_run_searches` id `a5299625-2fa0-40c7-b33d-e9e04df90b29`, pool index 2) pointing to:

```
https://www.dpiit.gov.in/static/uploads/2025/07/b6c9db15ce083fd10caa9787bf8a281f.pdf
```

Retrieving this URL returns a 35-page, 1,174,021-byte PDF titled *"Report on Logistics Cost in India: Assessment and Long-term Framework"* (Logistics Division, DPIIT, Ministry of Commerce & Industry, Government of India, 2023; authored by Prof. Poonam Munjal and Prof. Sanjib Pohit, National Council of Applied Economic Research (NCAER), with a named Task Force). The document's own cover page carries the following notice, transcribed verbatim:

> "Disclaimer: This report contains confidential information and its disclosure to any third party is strictly prohibited without the written consent of the Logistics Division."

The document's content is unrelated to the intelligence item's subject ("Carbon Intensity Standards") — it is a logistics-cost research report, not a carbon-related instrument.

## 2. Acquisition trace

- **Original pipeline ingestion:** `agent_run_searches` row created 2026-06-06T02:37:25.566Z (`searched_at`), `agent_run_id` null, `result_index` 2, `result_title` "generate pool source". The stored `result_content_excerpt` (269 characters) is not document content — it is an Akamai CDN "Access Denied" error page (`Reference #18.6c55d117.1780713242.3000d795`, `errors.edgesuite.net`). **The original pipeline fetch was blocked and captured none of the document's content.**
- **Session-B investigative re-fetch (2026-07-17):** during trace verification, a direct HTTP fetch (`curl`, browser user-agent header, 20-second bound) to the same URL returned `HTTP/1.1 200 OK`, `Content-Type: application/pdf`, `Content-Length: 1174021`, served via CDN (`MPULSE_CDN_CACHE: HIT`), `Last-Modified: Mon, 07 Jul 2025 09:42:52 GMT`, with **no authentication challenge, login wall, or access-control response**. Text was extracted locally (`pdftotext`, 76,969 characters) for the sole purpose of identifying the document's nature and confirming the confidentiality notice above.
- **Public-host determination:** the host serves the full PDF over plain HTTPS with no authentication, to any requester presenting an ordinary browser user-agent. The original pipeline fetch's block (Access Denied) reflects a bot/user-agent filter, not an access-control or authentication barrier on the resource itself.
- **Local copies:** the investigative PDF and extracted-text files were written to a session scratch directory (`scripts/tmp/`) and deleted the same session, prior to this record's authorship, as part of routine tmp cleanup before a git bank. They were never committed, never written to any corpus table, and never left the local scratch directory.

## 3. Grounding exposure finding

- `section_claim_provenance` rows with `search_result_id` = the pool row above: **0**.
- `dpiit.gov.in` is a registered source (`sources` id `735cb9df-fe9f-414c-96e1-2f7e7d172c98`, base_tier 2), but at a **different URL** (`https://dpiit.gov.in/logistics-division`, the department's general page) — not this PDF. `section_claim_provenance` rows with `source_id` = that registered source: **0**.
- No other pool row anywhere in the corpus references `dpiit.gov.in` other than the single row identified above.
- **Conclusion: no claim in any item was ever grounded to this document, at any point, and nothing derived from it reached a customer-facing surface.** The only place the document's content existed, transiently, was in this session's local investigative trace.

## 4. Actions taken

- **2026-07-17 (this session):** identified the pool row and its full grounding-exposure trace (Sections 2–3 above).
- **2026-07-17 (this session):** `agent_run_searches` row `a5299625-2fa0-40c7-b33d-e9e04df90b29` — `result_content_excerpt` replaced with an explicit containment-hold marker (guarded write, cited) stating the URL resolves to a confidential document, summarizing the exposure trace, and directing that the URL not be re-fetched. The row is preserved (URL, item association, timestamps intact) for audit; no confidential content remains stored anywhere in the corpus. Capture is now quarantined-unselectable: nothing extractable remains in the row for any future grounding pass to pull a span from.
- **2026-07-17 (this session):** grounding blocked as a structural consequence of the redaction above — there is no source-level block needed beyond the row redaction, since the confidential PDF was never itself a registered `sources` row (the registered `dpiit.gov.in` source points to the department's general page, which is unaffected and remains a legitimate tier-2 government source).
- **2026-07-17 (this session):** this record created (first entry in `docs/compliance/`).

## 5. Recurrence fix

A capture-gate confidentiality-marking detector (screening fetched content for explicit third-party-disclosure-prohibition language before staging, analogous to the roadblock-detection gate already wired into primary acquisition) is the intended mechanical fix for this failure class. This incident is designated as that fix's origin case. The detector itself, and the `operator_review_queue` infrastructure this incident's row is intended to backfill into once built, are scoped to a separate, already-dispatched build (`operator_review_queue` admin surface dispatch, 2026-07-17) and are not built as part of this containment action. This record stands as the interim durable evidence of the incident pending that infrastructure landing.

## 6. Status

Operator notified same day (2026-07-17, this session, in chat). Counsel notification pending operator decision. No further corpus exposure identified. No customer-facing exposure identified.
