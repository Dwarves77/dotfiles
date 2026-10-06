#!/usr/bin/env node
// resolve-push-batch.mjs: which committed batch file did this merge add (lane G6-DRAIN, 2026-10-06).
//
// Each judgement apply workflow (brief-apply, theme-briefs, question-answers, ledger-consume, source-resolution)
// has a `push:` trigger on master limited to its own batch directory (kinds.mjs is the one list of those
// directories and name patterns). On a push the workflow has no `inputs.*`, so its first step calls this to find
// the batch the merge added:
//   node scripts/drain/resolve-push-batch.mjs --kind <kind id> [--before <sha>] [--sha <sha>]
// It prints ONLY `KEY=VALUE` lines on stdout (redirect straight into $GITHUB_ENV), diagnostics on stderr:
//   PUSH_BATCH_FILE=<fsi-app relative path>     (kinds that name their file; empty otherwise)
//   PUSH_BATCH_COUNT=<n>
// Exit 0 with a count of 0 when the push touched nothing that matches (a README edit under the directory, a
// fixture): the workflow's later steps skip on an empty file. Exit 1 when a kind that names its file finds more
// than one: the drain lands exactly one batch per kind per PR, and silently applying the first of two would drop
// the second. Mode is NEVER decided here: the workflow runs chained-dry-guard.mjs with --ref, which forces dry
// while scrape_cadence='off' (the guard, not this trigger, holds the population ruling).
//
// Zero npm dependency (node builtins and git only), so it runs before `npm ci`.

import { parseArgs as nodeParseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { isMainModule } from "../lib/is-main.mjs";
import { kindById, toAppRelative } from "./kinds.mjs";

/**
 * Pure. The batch files of a kind among a list of changed paths (repo relative or fsi-app relative), sorted.
 * @param {import("./kinds.mjs").DrainKind} kind
 * @param {string[]} changedPaths
 */
export function selectBatchFiles(kind, changedPaths) {
  const out = [];
  for (const raw of changedPaths ?? []) {
    const p = toAppRelative(raw.trim());
    if (!p.startsWith(`${kind.batchDir}/`)) continue;
    const name = p.slice(kind.batchDir.length + 1);
    if (!name.includes("/") && kind.batchRe.test(name)) out.push(p);
  }
  return [...new Set(out)].sort();
}

/**
 * Pure. Turn the selection into the resolver's decision.
 * @returns {{ok: true, file: string, count: number} | {ok: false, error: string, count: number}}
 */
export function decideBatch(kind, files) {
  if (files.length === 0) return { ok: true, file: "", count: 0 };
  if (kind.namesFile && files.length > 1) {
    return { ok: false, count: files.length, error: `${kind.id}: this push added ${files.length} batch files (${files.join(", ")}); the drain lands exactly one per merge, and applying the first would drop the rest` };
  }
  return { ok: true, file: kind.namesFile ? files[0] : "", count: files.length };
}

/** The changed paths of a push. Tries before..sha, then falls back to the commit against its first parent (a shallow checkout lacks `before`). */
export function changedPaths({ before, sha, run = spawnSync }) {
  const git = (args) => run("git", args, { encoding: "utf8" });
  const zero = !before || /^0+$/.test(before);
  if (!zero) {
    const r = git(["diff", "--name-only", "--diff-filter=AM", before, sha]);
    if (r.status === 0) return r.stdout.split("\n").filter(Boolean);
  }
  const r = git(["diff", "--name-only", "--diff-filter=AM", `${sha}^`, sha]);
  if (r.status === 0) return r.stdout.split("\n").filter(Boolean);
  const root = git(["diff-tree", "--no-commit-id", "--name-only", "-r", "--diff-filter=AM", sha]);
  return root.status === 0 ? root.stdout.split("\n").filter(Boolean) : [];
}

/** Pure CLI parse. @param {string[]} argv */
export function parseArgs(argv) {
  let values;
  try {
    ({ values } = nodeParseArgs({ args: Array.isArray(argv) ? argv : [], options: { kind: { type: "string" }, before: { type: "string" }, sha: { type: "string" } }, allowPositionals: false, strict: true }));
  } catch (err) { return { ok: false, error: err.message }; }
  const kind = values.kind ? kindById(values.kind) : null;
  if (!kind) return { ok: false, error: `--kind must be a drain kind id, got ${JSON.stringify(values.kind ?? null)}` };
  return { ok: true, kind, before: values.before ?? "", sha: values.sha ?? "HEAD" };
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) { console.error(`resolve-push-batch: ${parsed.error}`); process.exit(1); }
  const files = selectBatchFiles(parsed.kind, changedPaths({ before: parsed.before, sha: parsed.sha }));
  const d = decideBatch(parsed.kind, files);
  if (!d.ok) { console.error(`resolve-push-batch: ${d.error}`); process.exit(1); }
  console.error(`resolve-push-batch: ${parsed.kind.id}: ${d.count} batch file(s) added${d.file ? `, applying ${d.file}` : ""}`);
  console.log(`PUSH_BATCH_FILE=${d.file}`);
  console.log(`PUSH_BATCH_COUNT=${d.count}`);
  process.exit(0);
}

if (isMainModule(import.meta.url)) main();
