// tier-opinions.mjs — MAINT dispatch step investigating "the upstream that produces tier opinions".
//
// FINDING (Lane MAINT, 2026-09-02), reported per the dispatch's own instruction rather than built
// around: source_tier_opinions (migration 091) sits at 0 rows because its writer never ran, not
// because it doesn't exist or is broken.
//
//   THE WRITER EXISTS AND IS WIRED. recordTierOpinion (src/lib/sources/tier-opinion-writer.ts) is
//   called from registerCitedSources (src/lib/sources/source-growth.ts:139), which is real, tested
//   production code — `git log --oneline -- src/lib/sources/tier-opinion-writer.ts` shows one commit
//   (1a4c7cf5), which is the S2 lane's double-invocation dedup fix (registerBriefSources vs.
//   growSourcesFromBrief calling registerCitedSources twice for the same cited list — see that file's
//   own `skipTierOpinions` doc comment). The writer is not a stub and not dead code.
//
//   THE UPSTREAM THAT FEEDS IT IS BRIEF GENERATION. registerCitedSources only records an opinion when
//   `cs.tier_estimate != null` (source-growth.ts:138) — and tier_estimate is populated exactly once in
//   this codebase, by registerBriefSources / growSourcesFromBrief, which are called from inside
//   canonical-pipeline.ts's brief-generation path (generate-brief.ts). tier_estimate is the LLM agent's
//   own guess at a cited source's tier, read off the brief's "New Sources Identified" table
//   (source-growth.ts:24's import comment; the insert itself is stamped `opinion_source:
//   "haiku_brief_classifier"` — tier-opinion-writer.ts:73). There is no non-LLM path anywhere in this
//   repo that produces a tier_estimate to write.
//
//   THEREFORE: NOT RUNNABLE from a $0, no-LLM, service-role-only GitHub Actions runner. Running it
//   would mean generating a brief (a paid Anthropic call) — out of scope for every $0 runtime in this
//   repo (COMMON's standing ruling; finish-plan-2026-09-02.md's own header: "$0 and no LLM on the
//   population path"). The live count is 0 because no brief has been generated since the writer was
//   fixed and wired (2026-09-02), not because anything here is defective.
//
// This step therefore does no DB work at all (needsDb: false below) — there is nothing to dry-run or
// apply. It exists so the dispatch has a named, documented answer instead of a missing `step` choice.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./lib/cli.mjs";

export const FINDING = Object.freeze({
  upstream:
    "src/lib/sources/tier-opinion-writer.ts (recordTierOpinion), called from " +
    "src/lib/sources/source-growth.ts's registerCitedSources (line ~139), itself called only from " +
    "registerBriefSources / growSourcesFromBrief inside brief generation (canonical-pipeline.ts / " +
    "generate-brief.ts).",
  writer_status: "EXISTS, WIRED, correct — one commit (1a4c7cf5, the S2 double-invocation dedup fix). Not dead code.",
  why_not_runnable:
    "tier_estimate (the value recordTierOpinion writes) is produced ONLY by the LLM brief-generation " +
    "agent's own 'New Sources Identified' table (opinion_source stamped 'haiku_brief_classifier'). No " +
    "non-LLM path in this repo produces a tier_estimate. This MAINT runtime is $0/no-LLM per the " +
    "standing build-mode ruling — a service-role key alone cannot run this upstream.",
  live_count_explanation:
    "0 rows because no brief has been generated since the writer was fixed and wired (2026-09-02) — " +
    "brief generation is a separate, paid, dispatch-only path out of this runtime's scope, not because " +
    "the writer is broken or unwired.",
});

/** @param {{ mode?: "dry"|"apply" }} opts */
export async function main({ mode = "dry" } = {}) {
  const apply = mode === "apply";
  return {
    step: "tier-opinions",
    mode,
    runnable: false,
    counts: {},
    applied: 0,
    read_back: {},
    finding: FINDING,
    note: `NOT RUNNABLE: ${FINDING.why_not_runnable}`,
    exitCode: apply ? 2 : 0,
  };
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({ step: "tier-opinions", main, needsDb: false });
}
