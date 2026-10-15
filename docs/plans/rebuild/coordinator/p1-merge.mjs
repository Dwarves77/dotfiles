// Merge Part 1 register branches into master one by one, resolving the two shared files mechanically:
// data-invariants.md: master's text + the branch's new INV lines renumbered after master's max; count line rewritten.
// BACKLOG: master's rows, with the branch's changed rows (vs merge-base) substituted by ID.
// INDEX.md: master's text + branch-added lines not already present.
// Usage: node p1-merge.mjs <pr> <branch> [<pr> <branch> ...]
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const REPO = "<repo>";
const WT = `${REPO}/.claude/worktrees/p1merge`;
const INV = "docs/plans/rebuild/data-invariants.md";
const BL = "docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md";
const IDX = "docs/INDEX.md";
const sh = (cmd, opts = {}) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: "C:/Program Files/Git/bin/bash.exe", ...opts });
const show = (ref, path) => sh(`git -C ${REPO} show ${ref}:${path}`);

function resolveInv(master, base, branch, lane) {
  const baseSet = new Set(base.split("\n"));
  const newLines = branch.split("\n").filter((l) => /^INV-\d{3} \|/.test(l) && !baseSet.has(l));
  const mLines = master.split("\n");
  let max = 0, lastIdx = -1;
  mLines.forEach((l, i) => { const m = /^INV-(\d{3}) \|/.exec(l); if (m) { max = Math.max(max, +m[1]); lastIdx = i; } });
  const first = max + 1;
  const map = new Map();
  const renum = newLines.map((l, i) => { const old = l.slice(0, 7); const nu = `INV-${String(max + 1 + i).padStart(3, "0")}`; map.set(old, nu); return nu + l.slice(7); });
  globalThis.__invMap = map;
  mLines.splice(lastIdx + 1, 0, ...renum);
  const newMax = max + renum.length;
  const ci = mLines.findIndex((l) => l.startsWith("Count: "));
  const regLine = (renum[0] || "").split("|").pop() || "";
  const reg = /([a-z0-9-]+\.md)/.exec(regLine) ? [null, `docs/plans/rebuild/part1/${/([a-z0-9-]+\.md)/.exec(regLine)[1]}`] : /(docs\/plans\/rebuild\/part1\/[a-z0-9-]+\.md)/.exec(branch.split("\n")[ci] ?? "");
  const cnt = mLines[ci].replace(/Count: \d+ invariant lines \(INV-001 to INV-\d+\)/, `Count: ${newMax} invariant lines (INV-001 to INV-${String(newMax).padStart(3, "0")})`)
    .replace(/; their last column cites that register's section\./, `; INV-${String(first).padStart(3, "0")} to INV-${String(newMax).padStart(3, "0")} by lane ${lane} (2026-10-12) from the whole read of its module (${reg ? reg[1] : "see register"}); their last column cites that register's section.`);
  mLines[ci] = renum.length ? cnt : mLines[ci];
  return { text: mLines.join("\n"), added: renum.length, first, newMax };
}

function resolveBacklog(master, base, branch) {
  const key = (l) => (/^\| (B-\d+) \|/.exec(l) || [])[1];
  const map = (t) => { const m = new Map(); for (const l of t.split("\n")) { const k = key(l); if (k) m.set(k, l); } return m; };
  const bm = map(base), rm = map(branch), mm = map(master);
  let subst = 0, clash = 0;
  const out = master.split("\n").map((l) => {
    const k = key(l); if (!k) return l;
    const b = bm.get(k), r = rm.get(k);
    if (r !== undefined && r !== b) { if (mm.get(k) !== b) clash++; subst++; return r; }
    return l;
  });
  return { text: out.join("\n"), subst, clash };
}

function resolveIndex(master, base, branch) {
  const baseSet = new Set(base.split("\n")), mSet = new Set(master.split("\n"));
  const added = branch.split("\n").filter((l) => !baseSet.has(l) && !mSet.has(l) && l.trim());
  return master.trimEnd() + (added.length ? "\n" + added.join("\n") : "") + "\n";
}

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  const pr = args[i], branch = args[i + 1];
  const lane = (/part1-(.+)$/.exec(branch) || [])[1];
  const laneId = (sh(`gh pr view ${pr} -R Dwarves77/dotfiles --json title --jq .title`).trim().match(/^P1-\d{2}/) || ["P1-??"])[0];
  sh(`git -C ${REPO} fetch origin --quiet`);
  if (existsSync(WT)) sh(`git -C ${REPO} worktree remove --force ${WT}`);
  sh(`git -C ${REPO} worktree add ${WT} origin/${branch} --detach --quiet`);
  const mb = sh(`git -C ${REPO} merge-base origin/master origin/${branch}`).trim();
  let conflicted = "";
  try { sh(`git -C ${WT} merge origin/master --no-edit`); } catch (e) { conflicted = sh(`git -C ${WT} diff --name-only --diff-filter=U`); }
  const files = conflicted.split("\n").filter(Boolean);
  let note = [];
  // Another lane's session log or register conflicting here means this branch carried a stale copy: master wins.
  const foreign = files.filter((f) => /^docs\/(ops\/session-log\.d\/|plans\/rebuild\/part1\/)/.test(f) && !f.includes(`part1-${lane}.md`) && !f.endsWith(`/${lane}.md`));
  for (const f of foreign) { sh(`git -C ${WT} checkout --theirs -- "${f}" && git -C ${WT} add "${f}"`); }
  if (foreign.length) note.push(`foreign files taken from master: ${foreign.map((f) => f.split("/").pop()).join(", ")}`);
  const unknown = files.filter((f) => ![INV, BL, IDX].includes(f) && !foreign.includes(f));
  if (unknown.length) { console.log(`${pr} ${branch}: STOP, unexpected conflicts: ${unknown.join(", ")}`); sh(`git -C ${WT} merge --abort`); continue; }
  if (files.includes(INV)) {
    const r = resolveInv(show("origin/master", INV), show(mb, INV), show(`origin/${branch}`, INV), laneId); writeFileSync(`${WT}/${INV}`, r.text); note.push(`INV +${r.added} as ${r.first}-${r.newMax}`);
    // Rewrite the lane's own citations of its renumbered invariants (register + session log on the branch).
    const m = globalThis.__invMap || new Map();
    const changed = [...m].filter(([a, b]) => a !== b);
    if (changed.length) {
      const own = sh(`git -C ${REPO} diff --name-only ${mb} origin/${branch}`).split("\n").filter((f) => /^docs\/(plans\/rebuild\/part1\/|ops\/session-log\.d\/)/.test(f));
      for (const f of own) {
        let t = readFileSync(`${WT}/${f}`, "utf8"); let n = 0;
        // Two-phase to avoid chained replacement: old -> placeholder -> new.
        for (const [a] of changed) t = t.replace(new RegExp(a + "(?!\\d)", "g"), () => { n++; return `@@${a}@@`; });
        for (const [a, b] of changed) t = t.split(`@@${a}@@`).join(b);
        writeFileSync(`${WT}/${f}`, t); if (n) { sh(`git -C ${WT} add "${f}"`); note.push(`${f.split("/").pop()}: ${n} citations renumbered`); }
      }
    }
  }
  if (files.includes(BL)) { const r = resolveBacklog(show("origin/master", BL), show(mb, BL), show(`origin/${branch}`, BL)); writeFileSync(`${WT}/${BL}`, r.text); note.push(`backlog rows ${r.subst} (clash ${r.clash})`); }
  if (files.includes(IDX)) { writeFileSync(`${WT}/${IDX}`, resolveIndex(show("origin/master", IDX), show(mb, IDX), show(`origin/${branch}`, IDX))); note.push("index union"); }
  if (files.length) {
    sh(`git -C ${WT} add ${files.join(" ")}`);
    sh(`git -C ${WT} commit --no-edit --quiet -m "Merge origin/master into ${branch}: invariants renumbered, backlog cells unioned"`);
    sh(`git -C ${WT} push origin HEAD:refs/heads/${branch} --quiet`);
  }
  // Wait for the `ci` check on the current head (it may not have registered yet).
  let concl = "";
  for (let t = 0; t < 60; t++) {
    const head = sh(`gh pr view ${pr} -R Dwarves77/dotfiles --json headRefOid --jq .headRefOid`).trim();
    concl = sh(`gh api repos/Dwarves77/dotfiles/commits/${head}/check-runs --jq '[.check_runs[] | select(.name=="ci")] | map(.conclusion // .status) | join(",")'`).trim();
    if (/success/.test(concl)) break;
    if (/failure|cancelled|timed_out/.test(concl)) break;
    await new Promise((r) => setTimeout(r, 20000));
  }
  if (!/success/.test(concl)) { console.log(`${pr} ${branch}: ci = "${concl || "absent"}" after waiting; left open (never re-fired).`); continue; }
  const title = sh(`gh pr view ${pr} -R Dwarves77/dotfiles --json title --jq .title`).trim();
  let merged = false, lastErr = "";
  for (let t = 0; t < 8 && !merged; t++) {
    try { sh(`gh pr merge ${pr} -R Dwarves77/dotfiles --squash --subject "${title}" --body "Register docs/plans/rebuild/part1/${lane}.md; ${note.join("; ")}.\n\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`); merged = true; }
    catch (e) { lastErr = String(e.stderr || e.message).trim(); await new Promise((r) => setTimeout(r, 20000)); }
  }
  if (!merged) { console.log(`${pr} ${branch}: merge refused 8 times: ${lastErr.slice(0, 200)}`); continue; }
  const state = sh(`gh pr view ${pr} -R Dwarves77/dotfiles --json state,mergeCommit --jq '"\\(.state) \\(.mergeCommit.oid)"'`).trim();
  console.log(`${pr} ${branch}: ${state}; ${note.join("; ") || "clean merge"}`);
}
if (existsSync(WT)) sh(`git -C ${REPO} worktree remove --force ${WT}`);
