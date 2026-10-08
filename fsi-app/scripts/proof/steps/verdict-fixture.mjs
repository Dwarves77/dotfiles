// scripts/proof/steps/verdict-fixture.mjs -- PROOF-3 (lane proof3-chain-steps, 2026-10-07): the ledger-verdicts
// fixture the chain proof's Ledger consume step reads, generated at run time with the LIVE prompt version.
//
// WHY A FIXTURE AT RUN TIME. Ledger consume promotes a candidate only when a verdict carries the live
// FIRST_FETCH_CLASSIFY_PROMPT_VERSION; every committed verdict (386 entries across ledger-verdicts-001/002) carries
// an older version, so none can promote (chain-fire 2026-10-07, finding F4). The proof must exercise promotion, so
// it authors a small batch through the SAME contract: scripts/turns/ledger-verdicts/schema.json, enforced by
// validateVerdictsFile in run-ledger-consume.mjs. This module imports that validator rather than restating the
// contract, and refuses to return a batch it rejects.
//
// SHAPE OF THE BATCH. Five entries over five real candidate rows read from the local ledger:
//   entries 1 to 4  entity_verdict "specific_document", current prompt version  -> usable input for promotion
//   entry 5         same shape but a STALE prompt version                       -> must be excluded and counted,
//                   never promoted and never fatal (the per-entry staleness split in partitionVerdictsByPromptVersion)
// The values for the document fields (item type, domain, severity, priority, urgency tier) are the ones the
// committed batch ledger-verdicts-002 uses for its regulation entries. `classified_by` is the schema's one allowed
// constant ("session-haiku"); the rationale and source_export_ref say plainly that these are fixture verdicts.
// Nothing here reads a page or calls a model.

import { validateVerdictsFile, partitionVerdictsByPromptVersion } from "../../turns/run-ledger-consume.mjs";

export const FIXTURE_SIZE = 5;
export const USABLE_ENTRIES = 4;
/** A well-formed prompt version that is not the live one. */
export const STALE_PROMPT_VERSION = "sha256:0000000000000000";
export const FIXTURE_BATCH_NAME = "ledger-verdicts-chain-proof";

const PROMPT_VERSION_RE = /^sha256:[0-9a-f]{16}$/;

function titleFor(row) {
  const anchor = typeof row.anchor_text === "string" ? row.anchor_text.replace(/\s+/g, " ").trim() : "";
  const title = anchor || String(row.url);
  return title.length > 160 ? title.slice(0, 160) : title;
}

/**
 * Build the verdict batch. PURE (the clock is injected). Throws, naming the problem, when there are fewer than
 * USABLE_ENTRIES + 1 candidate rows, when a row has no url or id, when the prompt version is malformed, or when
 * the finished batch fails validateVerdictsFile.
 * @param {{rows: {candidate_id: string, url: string, anchor_text?: string|null}[], promptVersion: string, now?: () => Date}} args
 */
export function buildVerdictBatch({ rows, promptVersion, now = () => new Date() }) {
  if (!PROMPT_VERSION_RE.test(String(promptVersion))) throw new Error(`the live prompt version ${JSON.stringify(promptVersion)} does not match ^sha256:[0-9a-f]{16}$`);
  if (promptVersion === STALE_PROMPT_VERSION) throw new Error("the live prompt version equals the stale marker; the fixture could not tell them apart");
  if (!Array.isArray(rows) || rows.length < FIXTURE_SIZE) {
    throw new Error(`the verdict fixture needs ${FIXTURE_SIZE} candidate rows with status candidate, the local ledger has ${Array.isArray(rows) ? rows.length : 0}`);
  }
  const stamp = now().toISOString();
  const picked = rows.slice(0, FIXTURE_SIZE);
  const entries = picked.map((row, i) => {
    if (!row || typeof row.candidate_id !== "string" || row.candidate_id === "" || typeof row.url !== "string" || row.url === "") {
      throw new Error(`candidate row ${i} has no id or url`);
    }
    const stale = i >= USABLE_ENTRIES;
    return {
      candidate_id: row.candidate_id,
      url: row.url,
      entity_verdict: "specific_document",
      item_type: "regulation",
      domain: 1,
      surface_tags: ["regulations"],
      relevance: 30,
      severity: "MONITORING",
      priority: "LOW",
      urgency_tier: "informational",
      topic_tags: [],
      jurisdictions: [],
      title_candidate: titleFor(row),
      summary: null,
      rationale: "Chain proof fixture verdict: written by scripts/proof/steps, not a classification of the page.",
      confidence: 0.5,
      classified_by: "session-haiku",
      classified_at: stamp,
      prompt_version: stale ? STALE_PROMPT_VERSION : promptVersion,
    };
  });
  const batch = {
    batch: FIXTURE_BATCH_NAME,
    generated_at: stamp,
    prompt_version: promptVersion,
    classified_by: "session-haiku",
    source_export_ref: "chain-proof fixture (scripts/proof/steps/verdict-fixture.mjs), not a session classification",
    entries,
  };
  const errors = validateVerdictsFile(batch);
  if (errors.length) throw new Error(`the generated verdict fixture fails the verdict schema: ${errors.slice(0, 5).join("; ")}`);
  const { current, stale } = partitionVerdictsByPromptVersion(entries, promptVersion);
  if (current.length !== USABLE_ENTRIES || stale.length !== FIXTURE_SIZE - USABLE_ENTRIES) {
    throw new Error(`the verdict fixture splits ${current.length} current and ${stale.length} stale, expected ${USABLE_ENTRIES} and ${FIXTURE_SIZE - USABLE_ENTRIES}`);
  }
  return batch;
}
