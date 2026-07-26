# Runbook — Live-Source Anti-Fabrication Audit (standing post-wave gate)

**Status:** operator-ruled standing gate, 2026-07-26. Founding case: the ADR-016 census v1 fabrication incident (Haiku scored 86% relevance from bare CELEX identifiers; the random gate caught it).
**Cadence:** MANDATORY final gate of **every** wave — classification passes, brief batches (session-labor / Haiku-batch / Sonnet), intake waves, and the steady-state conveyor's periodic output.
**Cost:** $0 — Chrome for access/reading + session labor. No API generation calls.
**Related:** [session-log](../ops/session-log.md) · two-engine discovery ADR (enforcement clause) · F17 wave-completion guard · [ADR-014 acceptance sampling](../decisions/ADR-014-wave-acceptance-sampling.md).

## Why this gate exists

Every other check this cycle verified **internal consistency** — spans against stored captures, ledger against Console. This gate checks the system **against the world**: its outputs against live primary sources. It is the only check that can catch fabrication that is internally self-consistent (a verdict/claim that agrees with its own stored data but does not correspond to reality).

## The load-bearing decision rule: fabrication vs version-drift

Two failure modes look identical from outside. **Check STORED first, then LIVE** — reversing this miscounts one as the other:

- **Span/title present in the STORED capture but absent from the LIVE page → VERSION DRIFT.** The page changed since capture. This is *monitoring intelligence*, routed to the monitoring unit. NOT a fabrication count.
- **Span/title absent from the STORED capture too → FABRICATION.** The taboo class. Zero tolerance. **Escalate immediately; stops all downstream work until the operator rules.**

## Sampling

All samples **RANDOM**, draw method stated and the drawn IDs recorded to the run artifact (reproducibility). Draw via a seeded/logged script (`Math.random` acceptable in a node runner; record the seed or the resulting IDs).

## The four strata

### Stratum 1 — Classification verdicts (the census)
Sample: **30 random `would_mint` + 30 random `invariant_reject` + 15 random `hold`** rows.
Per row: open the authoritative register page in Chrome (EUR-Lex by CELEX, legislation.gov.uk, eCFR).
- (a) instrument **EXISTS** and stored title **matches the live page** — any mismatch is a **fabrication-class** finding.
- (b) own judgment of freight-sustainability relevance from the **live page** agrees with the verdict.
**Pass:** ≥90% relevance-agreement per stratum; **title-match must be 100%**.

### Stratum 2 — Corpus briefs touched this cycle (Units 1/2/4)
Sample: the **ADR-014 10%** sample of touched items; per item **5 random FACT claims**.
- (a) span **verbatim-matches the STORED capture** (normalized compare, pipeline extractor) — failure = **FABRICATION**, zero tolerance, escalate immediately.
- (b) then open the live primary; check the span against the **CURRENT page**: present = fully verified; absent-but-in-capture = **VERSION DRIFT** (flag monitoring, not fabrication).

### Stratum 3 — Operations facts
Sample: **every** `state_cost_facts` row + **10 random** `regional_data_facts`.
Open each row's cited source live; confirm the figure and its citation. Same fabrication-vs-drift split.

### Stratum 4 — Negative control
Sample: **10 random REFUSED** rows (no-title holds). Confirm the refusal was **honest** — the row genuinely lacked metadata and no verdict leaked through.

## Chrome / extractor discipline (ruled)

Browser for **access and reading only**. Any text compared **programmatically** goes through the **pipeline extractor** (`htmlToText`: tag→space, cleanCtl, `\s+`→space, trim), **never `innerText`** — Chrome `innerText` renders subscripts tight (`CO2`) where the extractor inserts a space at the `<sub>` boundary (`CO 2`), breaking verbatim FACT-span guards on every subscript-bearing span.

## Report / certificate

Per stratum: **checked / passed / drift / fabrication**, with **URL and evidence for every non-pass**.

- **ANY confirmed fabrication finding STOPS downstream work** (index build, depth lane) until the operator rules.
- **Zero fabrication + pass rates at threshold = the audit CERTIFIES the cycle.** The certificate (method, samples, results) goes in the session log.

## Mechanical rule — re-sweep recoverable holds after any enrichment (RD, 2026-07-26)

A hold bucket is a **conveyor, not parking**. After ANY enrichment top-up (title, metadata, source), **re-sweep every `unclassifiable_pending_enrichment` hold whose blocking input is now resolvable BEFORE any topline or index publication** — null their disposition and re-run the fail-closed classifier. Founding case: the recoverable-holds finding (stratum 4, 2026-07-26) — 1,073 of 1,311 `unclassifiable` holds had gained titles post-enrichment but were never re-swept, inflating the held bucket and understating the gap by ~1,073. This check makes the recoverable-holds class impossible to miss silently: a topline/index published while resolvable holds sit unclassified is RED. The genuinely-still-blocked residual (238 in the founding case) stays held honestly.

## Standing-gate enforcement

- **Two-engine discovery ADR:** no wave's output is announced complete, and no index/surface publication proceeds, until its live-source audit passes.
- **F17-pattern mechanical guard:** a wave-completion artifact **without an attached live-audit result is RED**.
- This runbook is INDEXED and its adoption logged in the session log.
