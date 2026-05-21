#!/usr/bin/env node
// Audit a dispatch by UUID. Reads git log + commit message bodies + diff stats
// to produce a structured report of what the dispatch claimed and what it touched.
//
// Usage:
//   node fsi-app/.discipline/dispatch/audit.mjs <uuid>
//   node fsi-app/.discipline/dispatch/audit.mjs --list-recent [--days=N]
//   node fsi-app/.discipline/dispatch/audit.mjs --aggregate-by-skill

import { execFileSync } from 'node:child_process';
import { getRepoRoot } from '../lib/context.mjs';

function git(args) {
  return execFileSync('git', ['-C', getRepoRoot(), ...args], { encoding: 'utf-8' });
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    if (arg === '--list-recent') out.listRecent = true;
    else if (arg === '--aggregate-by-skill') out.aggregateBySkill = true;
    else if (arg.startsWith('--days=')) out.days = parseInt(arg.slice(7), 10);
    else if (!arg.startsWith('--')) out.uuid = arg;
  }
  return out;
}

// Returns array of { sha, subject, body } for commits matching a Dispatch-UUID line
export function findCommitsByUuid(uuid) {
  const out = git(['log', `--grep=Dispatch-UUID: ${uuid}`, '--format=%H%x00%s%x00%B%x1e']);
  return parseCommitRecords(out);
}

export function findRecentDispatches(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const out = git(['log', `--since=${since}`, '--grep=^Dispatch-UUID:', '--format=%H%x00%s%x00%B%x1e']);
  const records = parseCommitRecords(out);
  const byUuid = new Map();
  for (const rec of records) {
    const uuid = extractTrailerValue(rec.body, 'Dispatch-UUID');
    if (!uuid) continue;
    if (!byUuid.has(uuid)) byUuid.set(uuid, []);
    byUuid.get(uuid).push(rec);
  }
  return byUuid;
}

function parseCommitRecords(rawOutput) {
  if (!rawOutput.trim()) return [];
  return rawOutput
    .split('\x1e')
    .filter((rec) => rec.trim())
    .map((rec) => {
      const [sha, subject, ...bodyParts] = rec.trim().split('\x00');
      const body = bodyParts.join('\x00').trim();
      return { sha, subject, body };
    });
}

function extractTrailerValue(body, trailerName) {
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(new RegExp(`^\\s*${trailerName}:\\s*(.+?)\\s*$`));
    if (m) return m[1];
  }
  return null;
}

function extractAllTrailerValues(body, trailerName) {
  const lines = body.split(/\r?\n/);
  const values = [];
  for (const line of lines) {
    const m = line.match(new RegExp(`^\\s*${trailerName}:\\s*(.+?)\\s*$`));
    if (m) values.push(m[1]);
  }
  return values;
}

function commitFiles(sha) {
  try {
    return git(['show', '--format=', '--name-only', sha])
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function reportSingleDispatch(uuid) {
  const commits = findCommitsByUuid(uuid);
  if (commits.length === 0) {
    console.log(`No commits found with Dispatch-UUID: ${uuid}`);
    return 1;
  }

  console.log(`Dispatch ${uuid}`);
  console.log(`  Commits: ${commits.length}`);
  console.log('');

  // Per-commit summary
  for (const c of commits) {
    console.log(`  ${c.sha.slice(0, 10)} ${c.subject}`);
  }
  console.log('');

  // Aggregate skills loaded
  const skills = new Set();
  for (const c of commits) {
    for (const v of extractAllTrailerValues(c.body, 'Skill-loaded')) {
      skills.add(v);
    }
  }
  if (skills.size > 0) {
    console.log('  Skills loaded:');
    for (const s of skills) console.log(`    - ${s}`);
    console.log('');
  }

  // Aggregate loop-closure outcomes
  const loopClosures = [];
  for (const c of commits) {
    for (const v of extractAllTrailerValues(c.body, 'Loop-closure')) {
      loopClosures.push({ sha: c.sha.slice(0, 10), value: v });
    }
  }
  if (loopClosures.length > 0) {
    console.log('  Loop-closure lines:');
    for (const l of loopClosures) console.log(`    [${l.sha}] ${l.value}`);
    console.log('');
  }

  // Aggregate inventory emissions
  const inventoryLines = [];
  for (const c of commits) {
    for (const v of extractAllTrailerValues(c.body, 'Inventory-emission')) {
      inventoryLines.push({ sha: c.sha.slice(0, 10), value: v });
    }
  }
  if (inventoryLines.length > 0) {
    console.log('  Inventory emissions:');
    for (const l of inventoryLines) console.log(`    [${l.sha}] ${l.value}`);
    console.log('');
  }

  // Aggregate ADR references and overrides
  const adrRefs = [];
  for (const c of commits) {
    for (const v of extractAllTrailerValues(c.body, 'ADR-Reference')) {
      adrRefs.push({ sha: c.sha.slice(0, 10), value: v });
    }
  }
  if (adrRefs.length > 0) {
    console.log('  ADR references:');
    for (const l of adrRefs) console.log(`    [${l.sha}] ${l.value}`);
    console.log('');
  }
  const adrOverrides = [];
  for (const c of commits) {
    for (const v of extractAllTrailerValues(c.body, 'ADR-Override')) {
      adrOverrides.push({ sha: c.sha.slice(0, 10), value: v });
    }
  }
  if (adrOverrides.length > 0) {
    console.log('  ADR OVERRIDES (explicit contradictions of accepted decisions):');
    for (const l of adrOverrides) console.log(`    [${l.sha}] ${l.value}`);
    console.log('');
  }

  // Files touched across all commits
  const allFiles = new Set();
  for (const c of commits) {
    for (const f of commitFiles(c.sha)) allFiles.add(f);
  }
  console.log(`  Files touched: ${allFiles.size}`);
  for (const f of Array.from(allFiles).sort().slice(0, 50)) {
    console.log(`    ${f}`);
  }
  if (allFiles.size > 50) {
    console.log(`    ... and ${allFiles.size - 50} more`);
  }

  return 0;
}

function reportRecentDispatches(days) {
  const byUuid = findRecentDispatches(days);
  if (byUuid.size === 0) {
    console.log(`No dispatches in the last ${days} days.`);
    return 0;
  }
  console.log(`Dispatches in the last ${days} days: ${byUuid.size}\n`);
  for (const [uuid, commits] of byUuid) {
    console.log(`  ${uuid}  (${commits.length} commit${commits.length === 1 ? '' : 's'})`);
    for (const c of commits) {
      console.log(`    ${c.sha.slice(0, 10)} ${c.subject}`);
    }
    console.log('');
  }
  return 0;
}

function reportAggregateBySkill() {
  const byUuid = findRecentDispatches(365);
  const bySkill = new Map();
  for (const [uuid, commits] of byUuid) {
    for (const c of commits) {
      for (const skill of extractAllTrailerValues(c.body, 'Skill-loaded')) {
        if (!bySkill.has(skill)) bySkill.set(skill, new Set());
        bySkill.get(skill).add(uuid);
      }
    }
  }
  if (bySkill.size === 0) {
    console.log('No skill-attestation data found.');
    return 0;
  }
  console.log('Skills aggregated by dispatch (last 365 days):\n');
  const sorted = Array.from(bySkill.entries()).sort((a, b) => b[1].size - a[1].size);
  for (const [skill, dispatches] of sorted) {
    console.log(`  ${skill}  (${dispatches.size} dispatch${dispatches.size === 1 ? '' : 'es'})`);
  }
  return 0;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.listRecent) return reportRecentDispatches(args.days || 30);
  if (args.aggregateBySkill) return reportAggregateBySkill();
  if (args.uuid) return reportSingleDispatch(args.uuid);
  console.error('Usage: node fsi-app/.discipline/dispatch/audit.mjs <uuid>');
  console.error('  OR: --list-recent [--days=N]');
  console.error('  OR: --aggregate-by-skill');
  return 2;
}

const invokedDirectly = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
                        process.argv[1].endsWith('audit.mjs');
if (invokedDirectly) main().then((code) => process.exit(code));
