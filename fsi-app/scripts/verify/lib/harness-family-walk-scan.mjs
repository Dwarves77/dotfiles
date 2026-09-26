// @ts-check
// HARNESS-FAMILY SCHEDULE/DISPATCH WALKER pure core (lane TOOL-GAP-3, 2026-09-25, closing audit coverage
// gap 6: "unrun producers, ADR-023-named runtime, declared schedule, zero dispatch history"). GOVERNING:
// docs/plans/data-machine-tool-gaps-2026-09-25.md build order step 3, "harness-family schedule walker ...
// extends the F50 'every hop fires' pattern past the 11 named loop hops to every harness family". Audit
// finding PROD-2's own closing note: "a follow-up pass should walk scripts/harness-runs/*/family.json
// against its governing_files/schedule declaration and last-run artifact timestamp ... rather than this
// lane's manual per-workflow grep."
//
// RULE 16 BINDING (CLAUDE.md): build mode holds the scrape cadence OFF and ADR-023 states "every runtime
// by explicit dispatch", a zero-dispatch family is the EXPECTED state for most families right now, not a
// defect. This module therefore never recommends "turn cadence on"; its only claim is the FACT of whether
// a family has EVER been dispatched and left a recorded artifact, which family(ies), and since when. That
// framing is load-bearing: this is an observability check, not a cadence-policy check.
//
// PURE, no fs, the runner (harness-family-schedule-walker-audit.mjs) supplies the family descriptors
// (family-registry.mjs's loadFamilies(), reused per reuse-before-construction) and each family's own run
// artifact filenames + parsed contents (reusing F50-loop-wiring.mjs's own `<family>-run-NNN.json` naming
// convention and its `trigger` field read, so this walker and F50 agree on what "fired" means).

const RUN_FILE_RE = (family) => new RegExp(`^${family}-run-\\d{3}\\.json$`);

/** Which of `entries` (a family directory's readdirSync listing) are that family's own numbered run
 * artifacts, per CONVENTION.md's `<family>-run-NNN.json` naming (same regex F50 uses in familyFiredStatus).
 * @param {string} family
 * @param {string[]} entries
 * @returns {string[]}
 */
export function runArtifactNames(family, entries) {
  const re = RUN_FILE_RE(family);
  return entries.filter((name) => re.test(name)).sort();
}

/**
 * Summarize one family's dispatch history from its parsed run artifacts. `everDispatched` is the walker's
 * one factual claim: at least one artifact exists and was readable, regardless of trigger kind, since
 * ADR-023's "explicit dispatch" covers workflow_dispatch and manual runs too, not only workflow_run chains
 * (that narrower "fired from its OWN upstream hop" question is F50's job, not this walker's).
 * @param {string} family
 * @param {Array<{name: string, parsed: any}>} artifacts already-parsed run JSON (or null for unparseable)
 * @returns {{
 *   family: string, runCount: number, everDispatched: boolean,
 *   lastRunId: string|null, lastStartedAt: string|null, lastTrigger: string|null,
 *   parseFailures: number,
 * }}
 */
export function summarizeFamilyDispatchHistory(family, artifacts) {
  let runCount = 0;
  let parseFailures = 0;
  let lastRunId = null;
  let lastStartedAt = null;
  let lastTrigger = null;

  for (const { name, parsed } of artifacts) {
    if (!parsed || typeof parsed !== 'object') { parseFailures++; continue; }
    runCount++;
    const startedAt = typeof parsed.started_at === 'string' ? parsed.started_at : null;
    // keep the LATEST by started_at (falls back to filename order, run-NNN is monotonic per CONVENTION.md
    //, when started_at is missing or unparseable, so a missing timestamp never silently drops the run).
    if (lastStartedAt === null || (startedAt && startedAt > lastStartedAt)) {
      lastStartedAt = startedAt ?? lastStartedAt;
      lastRunId = parsed.run_id ?? name.replace(/\.json$/, '');
      lastTrigger = typeof parsed.trigger === 'string' ? parsed.trigger : null;
    }
  }

  return {
    family,
    runCount,
    everDispatched: runCount > 0,
    lastRunId,
    lastStartedAt,
    lastTrigger,
    parseFailures,
  };
}

/**
 * Across every family's summary, which are zero-dispatch producers (the audit's own coverage-gap-6
 * question): a registered family (it has a family.json, so it is a real, ADR-023-named runtime with a
 * declared governing-files set, per family-registry.mjs's own validation) with `everDispatched === false`.
 * @param {Array<ReturnType<typeof summarizeFamilyDispatchHistory>>} summaries
 * @returns {Array<ReturnType<typeof summarizeFamilyDispatchHistory>>}
 */
export function findZeroDispatchProducers(summaries) {
  return summaries.filter((s) => !s.everDispatched);
}

// ---------------------------------------------------------------------------------------------------------
// PER-PRODUCER SUB-WALK (coordinator ruling, 2026-09-25, on PR #810: "producers: walk each producer script
// as its own unit, each is a distinct producer with its own dispatch history, rule 17"). The "producers"
// harness family is ONE workflow firing (producers.yml) that runs up to 11 independent producer scripts,
// each one calling writeProducerSummary({ producer: "<name>", ... }) on its own exit path
// (scripts/producers/lib/producer-summary.mjs); emit-producers-artifact.mjs folds every summary written in
// one firing into that firing's single producers-run-NNN.json, at `per_item[].id === "<name>"`. A firing
// that runs 3 of 11 producers still leaves an artifact, so the family-grain walk above (any artifact at
// all = "family dispatched") is not the same claim as "this ONE producer has ever fired" -- rule 17's
// "everything works in tandem" reading is that each producer is its own dispatch unit, not a single
// firing's line item, since a coordinator asking "has ecb-fx ever run" needs the per-producer answer, not
// the family's.

/**
 * Extract the producer roster: every `const PRODUCER_NAME = "<name>";` declaration in the corpus (each
 * producer script's own self-identifying constant, the literal writeProducerSummary's `producer:` argument
 * resolves to at every call site -- see ecb-fx-producer.mjs, bls-oews-producer.mjs, etc.). Mechanically
 * derived, not a hand-kept list, so a twelfth producer script added later is picked up automatically the
 * next time this scan runs, the same "discovery by construction, not a hand-kept list" reasoning
 * run-test-suite.sh's own header already uses for test discovery.
 * @param {Array<{file:string, content:string}>} corpusFiles
 * @returns {Array<{producer:string, file:string}>}
 */
export function extractProducerRoster(corpusFiles) {
  const re = /\bconst\s+PRODUCER_NAME\s*=\s*["']([a-zA-Z0-9_-]+)["']/;
  const roster = [];
  const seen = new Set();
  for (const { file, content } of corpusFiles) {
    const m = re.exec(content ?? '');
    if (!m) continue;
    const producer = m[1];
    if (seen.has(producer)) continue; // a name declared in two files is reported once, at its first file
    seen.add(producer);
    roster.push({ producer, file });
  }
  return roster;
}

/**
 * Summarize one producer's dispatch history across every parsed `producers-run-NNN.json` artifact: does
 * ANY artifact's `per_item[]` carry an entry whose `id` equals this producer's name. Mirrors
 * summarizeFamilyDispatchHistory's shape (runCount/everDispatched/lastRunId/lastStartedAt) at the
 * per-producer grain instead of the per-family grain.
 * @param {string} producer
 * @param {Array<{name:string, parsed:any}>} producersArtifacts every producers-run-NNN.json (already parsed)
 * @returns {{
 *   producer: string, runCount: number, everDispatched: boolean,
 *   lastRunId: string|null, lastStartedAt: string|null, lastOutcome: string|null,
 * }}
 */
export function summarizeProducerDispatchHistory(producer, producersArtifacts) {
  let runCount = 0;
  let lastRunId = null;
  let lastStartedAt = null;
  let lastOutcome = null;

  for (const { name, parsed } of producersArtifacts) {
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.per_item)) continue;
    const entry = parsed.per_item.find((it) => it && it.id === producer);
    if (!entry) continue;
    runCount++;
    const startedAt = typeof parsed.started_at === 'string' ? parsed.started_at : null;
    if (lastStartedAt === null || (startedAt && startedAt > lastStartedAt)) {
      lastStartedAt = startedAt ?? lastStartedAt;
      lastRunId = parsed.run_id ?? name.replace(/\.json$/, '');
      lastOutcome = typeof entry.outcome === 'string' ? entry.outcome : null;
    }
  }

  return { producer, runCount, everDispatched: runCount > 0, lastRunId, lastStartedAt, lastOutcome };
}

/**
 * Across every producer's summary, which have NEVER appeared in any producers-run-NNN.json artifact.
 * Same rule-16 framing as findZeroDispatchProducers: a factual observation, not a cadence recommendation.
 * @param {Array<ReturnType<typeof summarizeProducerDispatchHistory>>} summaries
 * @returns {Array<ReturnType<typeof summarizeProducerDispatchHistory>>}
 */
export function findNeverDispatchedIndividualProducers(summaries) {
  return summaries.filter((s) => !s.everDispatched);
}

/** Stale allowlist entry: an allowlisted family name that either does not exist among the walked
 * families, or now HAS dispatch history (so keeping it allowlisted would hide a real, since-resolved
 * observation), same self-auditing shape as dead-column-scan.mjs's staleAllowlistEntries. */
export function staleHarnessWalkAllowlistEntries({ summaries, allowlist }) {
  const byFamily = new Map(summaries.map((s) => [s.family, s]));
  const stale = [];
  for (const family of Object.keys(allowlist)) {
    const s = byFamily.get(family);
    if (!s) {
      stale.push({ family, reason: 'allowlisted but no longer a registered harness family (renamed, removed, or never existed)' });
    } else if (s.everDispatched) {
      stale.push({ family, reason: 'allowlisted as zero-dispatch but now has dispatch history, remove the entry' });
    }
  }
  return stale;
}
