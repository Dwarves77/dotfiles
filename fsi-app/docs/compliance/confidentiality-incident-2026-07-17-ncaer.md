# Confidentiality Incident — NCAER "Logistics Cost in India" Report

**Date:** 2026-07-17 (traced and contained); 2026-07-18 (operator-ruled, independently re-verified, resolved)
**Status:** Resolved. Zero grounding exposure, zero customer-surface exposure, verified independently by two sessions. Counsel notification not triggered.

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

A capture-gate confidentiality-marking detector (screening fetched content for explicit third-party-disclosure-prohibition language before staging, analogous to the roadblock-detection gate already wired into primary acquisition) is the intended mechanical fix for this failure class. This incident is designated as that fix's origin case. The detector itself, and the `operator_review_queue` infrastructure this incident's row is intended to backfill into once built, are scoped to a separate, already-dispatched build (`operator_review_queue` admin surface dispatch, 2026-07-17) and are not built as part of this containment action. This record stands as the interim durable evidence of the incident pending that infrastructure landing. Recorded on the standing hardening ledger (`docs/PROGRAM-BOARD.md`) as a queued item, this incident cited as origin case.

## 6. Session A verification and evidentiary-metadata addendum (2026-07-18)

Per operator ruling (2026-07-18 restart reconciliation), Session A independently re-ran the grounding-exposure trace before relying on Session B's finding, rather than taking it on trust:

- Re-queried `section_claim_provenance` corpus-wide for `search_result_id = a5299625-2fa0-40c7-b33d-e9e04df90b29` (0 rows) and for `source_id = 735cb9df-fe9f-414c-96e1-2f7e7d172c98` (the registered dpiit.gov.in source; 0 rows).
- Re-queried `agent_run_searches` corpus-wide for any URL containing the document's content-path token (`b6c9db15`) and for any URL on host `dpiit.gov.in`: in both cases the ONLY match, corpus-wide, is the single pool row already identified in Section 2.
- Re-queried `raw_fetches` for the registered dpiit.gov.in source_id: one row, 2026-05-10, 313 bytes — the department's general logistics-division page snapshot, unrelated to the PDF, predating the PDF's own pool capture. The permanent snapshot store (`raw_fetches`, RD-46 primary-text-is-permanent) never held the confidential document at any point.
- **Independent confirmation: the grounding-exposure finding in Section 3 is correct.** Zero claims grounded, zero customer-surface exposure, corpus-wide, at any point.

**Evidentiary-metadata gap (honest disclosure, not filled).** The operator's containment ruling calls for retaining a content hash alongside source URL, fetch timestamp, byte count, and the quoted cover-page marking as the evidentiary minimum before any purge. Source URL, fetch timestamps (both the 2026-06-06 blocked original and the 2026-07-17 investigative confirmation), byte count (1,174,021 bytes per the `Content-Length` header), and the verbatim cover-page marking are all captured in Section 1–2 above. A **content hash is not available**: Session B's local investigative copy (the only copy that ever held the actual document bytes) was deleted before this evidentiary requirement was established, and re-fetching solely to compute a hash would re-create the exact exposure this record exists to close out (the row is marked DO NOT RE-FETCH for that reason). This gap is recorded honestly per the integrity rule rather than backfilled with a hash computed from a re-fetch. If the document is ever legitimately re-encountered (e.g., a future non-confidential re-publication, or a courier-verified copy obtained through a sanctioned channel), a hash should be captured then and appended here.

## 7. Doctrine addendum — confidentiality-ruled purges supersede append-only (operator ruling 2026-07-18)

RD-46 (`primary-text-is-permanent`, `remediation-discipline` SKILL.md category 27) holds that a captured primary is retained permanently and `raw_fetches` is append-only by construction, with no prune or delete path. This incident did not in fact require a purge against that store — the confidential document was never captured into `raw_fetches` (Section 6 above) — but the operator ruled the general case explicitly, and it is recorded here as a standing exception to RD-46:

**A confidentiality-ruled purge is a sanctioned, narrow exception to RD-46's append-only guarantee.** When stored content is confirmed to be a confidential third-party document improperly staged into the corpus (this incident's shape), the operator may rule a purge of the extractable content from `agent_run_searches` and, if the permanent store is ever implicated, `raw_fetches` — through the guarded write path only, never a raw delete. The exception is bounded: (a) an operator ruling is required EACH time, this is never a standing automatic capability; (b) the evidentiary minimum (source URL, fetch timestamp, byte count, content hash where available, the confidentiality marking quoted verbatim) MUST be captured to a durable incident record in `docs/compliance/` BEFORE the purge, never after; (c) the purge removes only the extractable substance, never the row's audit metadata (URL, item association, timestamps) — the row is redacted, not deleted, so the audit trail survives; (d) this incident is the origin case. No invariant number is assigned pending operator confirmation this addendum's phrasing is final; it stands as an amendment note on RD-46 in the interim.

## 8. Status

**Resolved.** Operator notified same day (2026-07-17, this session, in chat) and ruled on 2026-07-18 (see Sections 6–7, executed same day). Counsel notification: not triggered — the grounding-exposure finding is zero-exposure, corpus-wide and customer-surface, independently verified twice (Session B 2026-07-17, Session A 2026-07-18). `integrity_flags` row `963d4450-9edf-4c69-8bb3-e59a0a3d85a0` resolved to this record. No further corpus exposure identified.
