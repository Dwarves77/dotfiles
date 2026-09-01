# Last proposer pass — meta-harness

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `meta-harness` now has **four** artifacts
(`meta-harness-run-001` … `meta-harness-run-004`); F28's rule (d) requires this file to name the latest
verbatim: **meta-harness-run-004**.

**Artifacts read:** meta-harness-run-001, -002, -003, -004.

**Full traces read:** `scripts/harness-runs/CONVENTION.md` and `PROPOSER-RUNBOOK.md` in full,
`scripts/lib/run-artifact.mjs`, `.discipline/fitness/functions/F28-harness-run-integrity.mjs` (including
its KEEP IT HONEST section), the new family's `PROTOCOL.md`, `scripts/forward-events/DRY-RUN-REPORT.md`,
and `forward-events-run-001.json` with its own `full_trace_refs`.

**Hypotheses (verified, with basis):**

1. **Self-application produced a real finding for the second consecutive cycle, not ceremony.** Run-003's
   pass found the emission gap (F28 cannot see a run that never wrote its artifact). This cycle,
   registering a fifth family edited `run-artifact.mjs` and `F28` — both of which are in meta-harness's
   OWN `GOVERNING_FILES` — so F28 immediately demanded a meta-harness artifact recording why its harness
   changed. That is the gate working on the hand that edits it. Basis: ran the fitness runner and read the
   violation text.

2. **A coordinator assertion was refuted by a lane reading the implementation.** The brief for lane FE-3
   claimed F28 rule (b) fires on the presence of a family *directory*, so withholding the directory would
   avoid a red. FE-3 read `auditFamilyPresence` and showed rule (b) iterates `ALLOWED_FAMILIES`: the
   registration itself raises NO ARTIFACTS, directory or not. The lane reported the contradiction instead
   of routing around it. Recorded in run-004's `defects_found[0]`. The durable lesson is the one this
   registry keeps re-teaching: read the implementation, do not assert from the design.

3. **`hashHarnessVersion` throws rather than degrades on an absent governing file.** FE-3 ran it directly
   against the not-yet-landed forward-events paths and got a raw ENOENT. Nothing crashes today only
   because rule (c) skips families with zero valid artifacts, which happens to shield the intermediate
   state. That is protection by ordering luck, not by design, and it is the sharpest open item on this
   substrate.

4. **The fifth family is complete on the first cycle, unlike the first three.** `forward-events` landed
   with an extractor, execution-wired tests, a protocol, a migration, a registration, and a first real run
   over 322 live items in one wave — where mint, screen and fetch-drain were all retrofitted into this
   convention after the fact. That is the substrate paying off: a new harness now has a shape to be born
   into.

**Proposal for the next cycle:**

1. **Make `hashHarnessVersion` fail with a named error, not a raw ENOENT** — a governing file listed but
   absent is a registration bug worth a sentence that says so, and the current behaviour is only safe by
   accident of evaluation order (hypothesis 3).
2. **Give F28 a rule for the ordering trap this wave walked into**: registering a family in
   `ALLOWED_FAMILIES` without its first artifact in the same commit is always a red, and the message
   should say "land the first artifact in this commit" rather than leaving the author to discover the
   coupling by running the gate (hypothesis 2's class, made mechanical).
3. **No change proposed to the artifact schema.** Four families have now written artifacts against it
   without needing a field it lacks; forward-events fit its metrics into `metrics` unchanged.

**Family gates status:** the landing commit carries `meta-harness-run-004.json`, the new family's first
artifact, and the two test updates (`run-artifact.test.mjs`'s `ALLOWED_FAMILIES` assertion and F28's own
CONVENTION-parity row count), which together take F28 from the two violations the registration raised
back to green.
