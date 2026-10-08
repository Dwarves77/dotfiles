// scripts/proof/steps/prepare.mjs -- PROOF-3 (lane proof3-chain-steps, 2026-10-07): the two step preparations that
// need code rather than SQL. Each takes a context of injected seams (no file or database is touched directly) and
// returns { env, params, notes }: environment for the step's script, named SQL parameters for the step's setup and
// snapshot statements, and one-line notes for the report.
//
//   ledger-verdicts  the verdict fixture for Ledger consume: five real candidate rows from the local ledger (read by
//                    the manifest's var query), the LIVE prompt version, written through the verdict contract
//                    (verdict-fixture.mjs). Env: CP_VERDICTS_FILE.
//   brief-batch      the record-briefs batch for Brief apply. The committed batches name production item ids; the
//                    local database holds a subset, so the hook keeps only the entries whose item exists locally
//                    (the same entry objects, unchanged, in a copy of the file) and picks the batch with the most
//                    such entries, at most MAX_TARGETS of them. When no committed batch names a locally held item the
//                    hook throws NO TARGET: the step cannot be proven on this subset, which is a finding, not a pass.
//                    Env: CP_BRIEFS_FILE. Params: brief_target_ids (the uuids, for the reset and the snapshot).
//
// Neither hook mutates anything itself: the reset of the brief targets to their pre-brief state is the manifest's
// own `setup` statement, so the SQL stays in the reviewed data file next to the assertions that read it back.

import { join } from "node:path";
import { buildVerdictBatch, FIXTURE_SIZE, USABLE_ENTRIES } from "./verdict-fixture.mjs";

export const MAX_TARGETS = 3;
const BATCH_FILE_RE = /^record-briefs-.+\.json$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** @param {{vars: object, livePromptVersion: () => Promise<string>, stepTmp: string, now?: () => Date, writeFile: Function}} ctx */
export async function ledgerVerdicts(ctx) {
  let rows;
  try { rows = JSON.parse(ctx.vars.verdict_candidates || "[]"); } catch { throw new Error("the verdict_candidates query did not return JSON"); }
  const promptVersion = await ctx.livePromptVersion();
  const batch = buildVerdictBatch({ rows, promptVersion, now: ctx.now });
  const file = join(ctx.stepTmp, "ledger-verdicts-chain-proof.json");
  ctx.writeFile(file, JSON.stringify(batch, null, 1) + "\n");
  return {
    env: { CP_VERDICTS_FILE: file },
    params: {},
    notes: [`verdict fixture: ${USABLE_ENTRIES} usable entries and ${FIXTURE_SIZE - USABLE_ENTRIES} stale entry, live prompt version ${promptVersion}`],
  };
}

/**
 * Choose the batch and the entries. PURE. `batches` is [{ file, bytes, batch }] where batch is the parsed file;
 * `present` is the set of item ids that exist locally. Returns { file, entries } or null when nothing applies.
 */
export function chooseBriefTargets(batches, present) {
  const candidates = batches
    .map((b) => ({
      file: b.file,
      bytes: b.bytes,
      batch: b.batch,
      entries: (Array.isArray(b.batch?.entries) ? b.batch.entries : []).filter((e) => typeof e?.item_id === "string" && present.has(e.item_id)).slice(0, MAX_TARGETS),
    }))
    .filter((c) => c.entries.length > 0);
  // most targets first, then the smaller file, then the name: one answer for one database
  candidates.sort((a, b) => b.entries.length - a.entries.length || a.bytes - b.bytes || a.file.localeCompare(b.file));
  const best = candidates[0];
  return best ? { file: best.file, batch: best.batch, entries: best.entries } : null;
}

/** @param {{fsiRoot: string, stepTmp: string, query: Function, listDir: Function, readFile: Function, writeFile: Function}} ctx */
export async function briefBatch(ctx) {
  const dir = join(ctx.fsiRoot, "scripts", "turns", "record-briefs", "batches");
  const files = ctx.listDir(dir).filter((n) => BATCH_FILE_RE.test(n)).sort();
  const batches = files.map((f) => {
    const text = ctx.readFile(join(dir, f));
    return { file: f, bytes: text.length, batch: JSON.parse(text) };
  });
  const ids = [...new Set(batches.flatMap((b) => (b.batch.entries ?? []).map((e) => e?.item_id)).filter((id) => typeof id === "string" && UUID_RE.test(id)))];
  if (ids.length === 0) throw new Error("no committed record-briefs batch lists an item id");
  const rows = await ctx.query("SELECT id::text AS id FROM public.intelligence_items WHERE id = ANY($1::uuid[]) AND is_archived = false", [ids]);
  const present = new Set(rows.map((r) => r.id));
  const chosen = chooseBriefTargets(batches, present);
  if (!chosen) {
    throw new Error(
      `NO TARGET: none of the ${ids.length} item ids named by the ${files.length} committed record-briefs batches exists in the local database ` +
      "(the production subset holds other items). The Brief apply step cannot be proven on this subset until the subset export pins the ids of a committed batch."
    );
  }
  const out = join(ctx.stepTmp, "record-briefs-chain-proof.json");
  ctx.writeFile(out, JSON.stringify({ ...chosen.batch, batch: `${chosen.batch.batch ?? "record-briefs"}-chain-proof`, entries: chosen.entries }) + "\n");
  const targetIds = chosen.entries.map((e) => e.item_id);
  return {
    env: { CP_BRIEFS_FILE: out },
    params: { brief_target_ids: targetIds },
    notes: [`brief batch ${chosen.file}: ${targetIds.length} of ${chosen.batch.entries.length} entries target an item held locally (${present.size} of ${ids.length} committed ids present)`],
  };
}

export const HOOKS = Object.freeze({ "ledger-verdicts": ledgerVerdicts, "brief-batch": briefBatch });
