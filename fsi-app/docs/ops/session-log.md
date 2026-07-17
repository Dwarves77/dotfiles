
## 2026-07-16 — THE PERSISTENCE CONTRACT (cc-executor drain, Step 0)

Locked from repo write paths (canonical-pipeline.ts groundBrief) + a healthy verified item's real rows (singapore-maritime-decarbonisation, item 007104ed). The executor NEVER writes section_claim_provenance directly; groundBrief writes it via the injectedLedger seam. The executor only PROPOSES candidates; the gates dispose.

CAPTURE (free, both persisted):
- raw_fetches (via snapshot-store.writeSnapshot): {source_id, content_hash(sha256), file_path(`${sid}/${yyyy-mm-dd}/${hash}.html.gz`), http_status, html_bytes, fetched_at, created_at}. Round-trip verified (getSnapshot re-read + char count + marker string).
- agent_run_searches POOL ROW (the capture made visible to the system — a snapshot alone is invisible to validate/groundBrief): {intelligence_item_id, agent_run_id(nullable), search_query, result_url, result_title, result_index, result_content_excerpt(the captured text), searched_at}. validate_item_provenance criterion 3 matches a claim's source_span against the result_content_excerpt of the pool row referenced by the claim's search_result_id.

SOURCE: registerSource({url:<specific document url>, name, base_tier:<codified tier>}) — idempotent by institution key, read-back active, returns source_id. Provisional-class → hold, never stamp.

MINT (written BY groundBrief through the seam, not by the executor):
- section_claim_provenance row: {section_row_id, intelligence_item_id, claim_text, claim_kind(FACT/ANALYSIS/GAP/LEGAL), source_span(verbatim), source_id(resolved from the span's pool row), search_result_id(the pool row id), source_tier_at_grounding(stamped from the source row), extracted_at, verified_by/at(null), mint_hold_reason(null or gate hold)}.
- The executor's injected ledger supplies only {section, claim_text, claim_kind, source_span, slot_key}; groundBrief resolves source_id + search_result_id + tier and runs kept-filter (verbatim .includes), mint gates, non-destructive applyLedgerDiff, validate.

SUBMISSION ADAPTER (the ONE authorized new mint-path code): the injectedLedger seam in groundBrief (canonical-pipeline.ts) + scripts/_reground/executor-ground.mjs. Skips the acquire-lock + metered model when a ledger is injected; runs every gate unchanged. Golden: scripts/verify/cc-executor-submit.golden.mjs.

Divergences from dispatch text: none — repo is authority; section_claim_provenance has no slot_key column (slot encoded in claim_text `[slot]` prefix).
