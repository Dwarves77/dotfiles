// Proof for the SOURCE half of check-pretooluse-wired.mjs's wrapper verification (lane GATE-2, 2026-10-08).
// The scope shim may delegate to the gate by spawning it (the original shape) or by importing it and
// awaiting runGate at the in-scope call site (one node start instead of two). The importing shape is
// accepted only with the await, because without it the shim's trailing allow() runs before the gate and
// the gate is silently bypassed. Fixtures only.
//
// WIRE-1 (2026-10-08) adds the second half: the repo owns the wrapper text and the matcher. The shim is a
// permanent delegator (pretooluse-user-shim.mjs) rendered with the main checkout's entry path and installed by
// the one installer; the applier (wire-pretooluse-settings.mjs) edits only the one gate entry of settings.json.
// Every WIRE-1 test below works on temp files: the real settings.json is never read or written.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wrapperSourceDelegates } from './check-pretooluse-wired.mjs';
import {
  MATCHER, READ_ONLY_TOOLS, ENTRY_PLACEHOLDER, SHIM_FILE_NAME, TEMPLATE_REL, ENTRY_REL,
  renderShim, canonicalCommand, wireSettings, applyWiring,
} from './wire-pretooluse-settings.mjs';

const GATE = 'C:/fixture/dotfiles/fsi-app/.discipline/governance/pretooluse-skill-gate.mjs';

const SPAWN_SHIM = `
import { spawnSync } from "node:child_process";
const GATE = "${GATE}";
function runGate(input) { const r = spawnSync("node", [GATE], { input, encoding: "utf8" }); process.stdout.write(r.stdout); process.exit(0); }
let inScope = true;
if (inScope) runGate(raw);
allow();
`;

const IMPORT_SHIM_AWAITED = `
import { pathToFileURL } from "node:url";
const GATE = "${GATE}";
async function runGate(input) {
  let out = "";
  try { out = (await import(pathToFileURL(GATE).href)).runGate(input); } catch { /* fail closed */ }
  process.stdout.write(out || "{}");
  process.exit(0);
}
let inScope = true;
if (inScope) await runGate(raw);
allow();
`;

test('a spawning shim that names the gate is accepted (the original shape)', () => {
  assert.equal(wrapperSourceDelegates(SPAWN_SHIM).ok, true);
});

test('an importing shim that awaits runGate at the in-scope call site is accepted', () => {
  const r = wrapperSourceDelegates(IMPORT_SHIM_AWAITED);
  assert.equal(r.ok, true, r.why);
  assert.match(r.why, /imports the gate/);
});

test('ATTACK: an importing shim whose in-scope call is NOT awaited is refused (allow() would run first)', () => {
  const r = wrapperSourceDelegates(IMPORT_SHIM_AWAITED.replace('if (inScope) await runGate(raw);', 'if (inScope) runGate(raw);'));
  assert.equal(r.ok, false);
  assert.match(r.why, /await/);
});

test('ATTACK: a shim that names the gate but neither spawns nor imports it is refused', () => {
  const r = wrapperSourceDelegates(`const GATE = "${GATE}";\nif (inScope) await runGate(raw);\n`);
  assert.equal(r.ok, false);
  assert.match(r.why, /neither spawns/);
});

test('ATTACK: a shim that stopped referencing the gate at all is refused', () => {
  const r = wrapperSourceDelegates('process.stdout.write("{}");\n');
  assert.equal(r.ok, false);
  assert.match(r.why, /stopped wrapping/);
});

test('an importing shim that imports the gate but never calls runGate is refused', () => {
  const r = wrapperSourceDelegates(`const GATE = "${GATE}";\nawait import(GATE);\nif (inScope) await go(raw);\n`);
  assert.equal(r.ok, false);
});

// ── WIRE-1 ───────────────────────────────────────────────────────────────────────────────────────────
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..');
const TEMPLATE_TEXT = readFileSync(join(HERE, 'pretooluse-user-shim.mjs'), 'utf8');
const CREDENTIAL = 'plaintext-credential-\u00e9-do-not-print';
const OLD_GATE_COMMAND = `node "/sandbox/home/.claude/hooks/${SHIM_FILE_NAME}" || printf %s 'old backstop'`;
const SHIM_AT = '/sandbox/home/.claude/hooks/' + SHIM_FILE_NAME;

const baseSettings = () => ({
  theme: 'dark',
  env: { SECRET: CREDENTIAL },
  permissions: { allow: ['Bash(git status)'], deny: [] },
  hooks: {
    PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'echo post' }] }],
    PreToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'node other.mjs' }] },
      { matcher: '^(Bash|Edit|Write|MultiEdit|NotebookEdit|Agent|Task|Workflow|mcp__.+)$', hooks: [{ type: 'command', command: OLD_GATE_COMMAND }] },
      { matcher: 'Write', hooks: [{ type: 'command', command: 'node third.mjs' }] },
    ],
  },
  statusLine: { type: 'command', command: 'echo status' },
});

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'wire1-'));
  const mainRoot = join(root, 'main');
  const gov = join(mainRoot, 'fsi-app', '.discipline', 'governance');
  mkdirSync(gov, { recursive: true });
  writeFileSync(join(gov, 'pretooluse-user-shim.mjs'), TEMPLATE_TEXT);
  writeFileSync(join(gov, 'pretooluse-entry.mjs'), '// stub entry\n');
  const settingsPath = join(root, 'home', '.claude', 'settings.json');
  mkdirSync(dirname(settingsPath), { recursive: true });
  const userHooksDir = join(root, 'home', '.claude', 'hooks');
  const write = (obj, indent = 2) => writeFileSync(settingsPath, JSON.stringify(obj, null, indent) + '\n');
  return { root, mainRoot, gov, settingsPath, userHooksDir, write, clean: () => rmSync(root, { recursive: true, force: true }) };
}
const run = (sb, extra = {}) => {
  const lines = [];
  const r = applyWiring({ settingsPath: sb.settingsPath, userHooksDir: sb.userHooksDir, mainRoot: sb.mainRoot, log: (l) => lines.push(String(l)), ...extra });
  return { r, lines };
};

test('MATCHER is a negative form: every tool name is routed except the closed read-only list', () => {
  const re = new RegExp(MATCHER);
  assert.equal(/^[A-Za-z0-9_|]+$/.test(MATCHER), false, 'must be a JS regex, not a plain alternation');
  for (const t of READ_ONLY_TOOLS) assert.equal(re.test(t), false, `${t} is read-only and not routed`);
  assert.deepEqual([...READ_ONLY_TOOLS].sort(), ['AskUserQuestion', 'Glob', 'Grep', 'LS', 'ListAgents', 'ListSkills', 'Read', 'ReadNotifications', 'Skill', 'TodoWrite', 'ToolSearch', 'WebFetch', 'WebSearch']);
  for (const t of ['Bash', 'Edit', 'Write', 'PowerShell', 'Monitor', 'Agent', 'mcp__s__apply_migration', 'SomeNewTool', 'ReadX', 'XRead', 'Reader', 'Skills']) {
    assert.equal(re.test(t), true, `${t} is routed`);
  }
  assert.equal(re.test(''), false);
});

test('renderShim substitutes the entry path (forward slashes) and refuses a template without the placeholder', () => {
  const out = renderShim(TEMPLATE_TEXT, 'C:\\sandbox\\main\\fsi-app\\.discipline\\governance\\pretooluse-entry.mjs');
  assert.ok(TEMPLATE_TEXT.includes(ENTRY_PLACEHOLDER), 'the repo template carries the placeholder');
  assert.equal(out.includes(ENTRY_PLACEHOLDER), false);
  assert.ok(out.includes('"C:/sandbox/main/fsi-app/.discipline/governance/pretooluse-entry.mjs"'));
  assert.throws(() => renderShim('const x = 1;\n', '/a/b'), /placeholder/);
  assert.equal(renderShim(TEMPLATE_TEXT.replaceAll('\n', '\r\n'), '/a/b/entry.mjs'), renderShim(TEMPLATE_TEXT, '/a/b/entry.mjs'), 'a CRLF checkout renders the same bytes');
});

test('the shim template is a delegator: no decision logic of its own', () => {
  assert.doesNotMatch(TEMPLATE_TEXT, /inScope|runGate|"allow"/);
  assert.match(TEMPLATE_TEXT, /await entry\.runEntry\(\)/);
  assert.match(TEMPLATE_TEXT, /"ask"/, 'fail-closed ask when the entry cannot be loaded');
});

test('wireSettings edits only the one gate entry and keeps every other key and entry', () => {
  const before = baseSettings();
  const { settings, changed } = wireSettings(structuredClone(before), SHIM_AT);
  assert.equal(changed, true);
  const { hooks: _h, ...restAfter } = settings;
  const { hooks: _b, ...restBefore } = before;
  assert.deepEqual(restAfter, restBefore, 'top-level keys outside hooks untouched');
  assert.deepEqual(settings.hooks.PostToolUse, before.hooks.PostToolUse);
  const pre = settings.hooks.PreToolUse;
  assert.equal(pre.length, 3);
  assert.deepEqual(pre[0], before.hooks.PreToolUse[0]);
  assert.deepEqual(pre[2], before.hooks.PreToolUse[2]);
  assert.equal(pre[1].matcher, MATCHER);
  assert.equal(pre[1].hooks[0].command, canonicalCommand(SHIM_AT));
  assert.match(pre[1].hooks[0].command, /\|\| printf %s '/, 'the fail-closed backstop is kept');
});

test('wireSettings replaces a legacy DIRECT gate hook (unscoped) with the scoped shim, one entry', () => {
  const s = baseSettings();
  s.hooks.PreToolUse[1].hooks[0].command = 'node "/sandbox/dotfiles/fsi-app/.discipline/governance/pretooluse-skill-gate.mjs" || printf %s x';
  const { settings } = wireSettings(s, SHIM_AT);
  const gate = settings.hooks.PreToolUse.filter((e) => e.hooks.some((h) => /pretooluse-/.test(h.command)));
  assert.equal(gate.length, 1);
  assert.match(gate[0].hooks[0].command, /pretooluse-fsi-app-scope\.mjs/);
  assert.doesNotMatch(JSON.stringify(settings), /pretooluse-skill-gate/);
});

test('wireSettings keeps a non-gate hook that shares an entry with the gate hook, under its own matcher', () => {
  const s = baseSettings();
  s.hooks.PreToolUse[1] = { matcher: 'Bash|Edit', hooks: [{ type: 'command', command: 'node keep.mjs' }, { type: 'command', command: OLD_GATE_COMMAND }] };
  const { settings } = wireSettings(s, SHIM_AT);
  const keep = settings.hooks.PreToolUse.find((e) => e.hooks.some((h) => h.command === 'node keep.mjs'));
  assert.equal(keep.matcher, 'Bash|Edit');
  assert.equal(keep.hooks.length, 1);
  assert.equal(settings.hooks.PreToolUse.filter((e) => e.matcher === MATCHER).length, 1);
});

test('wireSettings adds the entry when none exists, and reports unchanged when already canonical', () => {
  const empty = wireSettings({ theme: 'dark' }, SHIM_AT);
  assert.equal(empty.changed, true);
  assert.equal(empty.settings.hooks.PreToolUse.length, 1);
  assert.equal(wireSettings(structuredClone(empty.settings), SHIM_AT).changed, false);
});

test('applyWiring --apply: shim and settings written, backup first, other keys byte-identical, nothing printed', () => {
  const sb = sandbox();
  try {
    const original = baseSettings();
    sb.write(original);
    const originalBytes = readFileSync(sb.settingsPath);
    const { r, lines } = run(sb, { apply: true });
    assert.equal(r.status, 'applied');
    const shimPath = join(sb.userHooksDir, SHIM_FILE_NAME);
    const entryPath = join(sb.mainRoot, ENTRY_REL).replaceAll('\\', '/');
    assert.equal(readFileSync(shimPath, 'utf8'), renderShim(TEMPLATE_TEXT, entryPath));
    const after = JSON.parse(readFileSync(sb.settingsPath, 'utf8'));
    const { hooks: _a, ...restA } = after;
    const { hooks: _o, ...restO } = original;
    assert.deepEqual(restA, restO);
    assert.deepEqual(after.hooks.PostToolUse, original.hooks.PostToolUse);
    assert.deepEqual(after.hooks.PreToolUse[0], original.hooks.PreToolUse[0]);
    assert.deepEqual(after.hooks.PreToolUse[2], original.hooks.PreToolUse[2]);
    assert.equal(after.hooks.PreToolUse[1].matcher, MATCHER);
    // The file is the original text with only the one entry replaced.
    const expectedText = JSON.stringify({ ...original, hooks: { ...original.hooks, PreToolUse: after.hooks.PreToolUse } }, null, 2) + '\n';
    assert.equal(readFileSync(sb.settingsPath, 'utf8'), expectedText);
    const backups = readdirSync(dirname(sb.settingsPath)).filter((f) => f.startsWith('settings.json.bak-'));
    assert.equal(backups.length, 1);
    assert.ok(readFileSync(join(dirname(sb.settingsPath), backups[0])).equals(originalBytes), 'backup holds the original bytes');
    assert.equal(lines.join('\n').includes(CREDENTIAL), false, 'no settings content is printed');
    assert.equal(lines.join('\n').includes('printf'), false, 'no command text is printed');
  } finally { sb.clean(); }
});

test('applyWiring is idempotent: the second run writes nothing and makes no backup', () => {
  const sb = sandbox();
  try {
    sb.write(baseSettings());
    run(sb, { apply: true });
    const settingsBytes = readFileSync(sb.settingsPath);
    const shimBytes = readFileSync(join(sb.userHooksDir, SHIM_FILE_NAME));
    const filesBefore = [...readdirSync(dirname(sb.settingsPath)), ...readdirSync(sb.userHooksDir)].sort();
    const { r } = run(sb, { apply: true });
    assert.equal(r.status, 'unchanged');
    assert.ok(readFileSync(sb.settingsPath).equals(settingsBytes));
    assert.ok(readFileSync(join(sb.userHooksDir, SHIM_FILE_NAME)).equals(shimBytes));
    assert.deepEqual([...readdirSync(dirname(sb.settingsPath)), ...readdirSync(sb.userHooksDir)].sort(), filesBefore);
  } finally { sb.clean(); }
});

test('applyWiring backs up a different installed shim before replacing it', () => {
  const sb = sandbox();
  try {
    sb.write(baseSettings());
    mkdirSync(sb.userHooksDir, { recursive: true });
    const shimPath = join(sb.userHooksDir, SHIM_FILE_NAME);
    writeFileSync(shimPath, '// the hand-edited wrapper\n');
    run(sb, { apply: true });
    const baks = readdirSync(sb.userHooksDir).filter((f) => f.startsWith(SHIM_FILE_NAME + '.bak-'));
    assert.equal(baks.length, 1);
    assert.equal(readFileSync(join(sb.userHooksDir, baks[0]), 'utf8'), '// the hand-edited wrapper\n');
    assert.notEqual(readFileSync(shimPath, 'utf8'), '// the hand-edited wrapper\n');
  } finally { sb.clean(); }
});

test('applyWiring dry run (the default) writes nothing and says so', () => {
  const sb = sandbox();
  try {
    sb.write(baseSettings());
    const bytes = readFileSync(sb.settingsPath);
    const { r, lines } = run(sb);
    assert.equal(r.status, 'dry-run');
    assert.equal(r.settingsChange, true);
    assert.equal(r.shimChange, true);
    assert.ok(readFileSync(sb.settingsPath).equals(bytes));
    assert.equal(existsSync(sb.userHooksDir), false);
    assert.match(lines.join('\n'), /DRY-RUN/);
  } finally { sb.clean(); }
});

test('applyWiring skips when settings.json is absent (CI), creating nothing', () => {
  const sb = sandbox();
  try {
    const { r, lines } = run(sb, { apply: true });
    assert.equal(r.status, 'skip');
    assert.match(lines.join('\n'), /skip/i);
    assert.equal(existsSync(sb.userHooksDir), false);
    assert.equal(existsSync(sb.settingsPath), false);
  } finally { sb.clean(); }
});

test('applyWiring refuses to write when the main checkout has no entry or template (nothing half installed)', () => {
  const sb = sandbox();
  try {
    sb.write(baseSettings());
    const bytes = readFileSync(sb.settingsPath);
    rmSync(join(sb.gov, 'pretooluse-entry.mjs'));
    let res = run(sb, { apply: true });
    assert.equal(res.r.status, 'error');
    assert.match(res.r.why, /entry/);
    writeFileSync(join(sb.gov, 'pretooluse-entry.mjs'), '// stub\n');
    rmSync(join(sb.gov, 'pretooluse-user-shim.mjs'));
    res = run(sb, { apply: true });
    assert.equal(res.r.status, 'error');
    assert.match(res.r.why, /template/);
    assert.ok(readFileSync(sb.settingsPath).equals(bytes));
    assert.equal(existsSync(sb.userHooksDir), false);
  } finally { sb.clean(); }
});

test('applyWiring keeps the file indentation (a tab-indented settings.json round-trips)', () => {
  const sb = sandbox();
  try {
    sb.write(baseSettings(), '\t');
    run(sb, { apply: true });
    assert.match(readFileSync(sb.settingsPath, 'utf8'), /^\{\n\t"theme"/);
  } finally { sb.clean(); }
});

test('applyWiring reports an unparseable settings.json as an error and writes nothing', () => {
  const sb = sandbox();
  try {
    writeFileSync(sb.settingsPath, '{ not json');
    const { r } = run(sb, { apply: true });
    assert.equal(r.status, 'error');
    assert.equal(readFileSync(sb.settingsPath, 'utf8'), '{ not json');
    assert.equal(existsSync(sb.userHooksDir), false);
  } finally { sb.clean(); }
});

test('TEMPLATE_REL and ENTRY_REL name real files in this repository', () => {
  assert.ok(existsSync(join(REPO_ROOT, TEMPLATE_REL)));
  assert.ok(existsSync(join(REPO_ROOT, ENTRY_REL)));
});

// The entry-delegating shim shape is accepted by the source proof only with the awaited entry call and the fail-closed ask.
const ENTRY_PATH = 'C:/fixture/dotfiles/fsi-app/.discipline/governance/pretooluse-entry.mjs';
const rendered = () => renderShim(TEMPLATE_TEXT, ENTRY_PATH);

test('the rendered installed shim passes the source delegation proof', () => {
  const r = wrapperSourceDelegates(rendered());
  assert.equal(r.ok, true, r.why);
});

test('ATTACK: an entry shim whose runEntry call is not awaited is refused', () => {
  const r = wrapperSourceDelegates(rendered().replace('await entry.runEntry()', 'entry.runEntry()'));
  assert.equal(r.ok, false);
  assert.match(r.why, /await/);
});

test('ATTACK: an entry shim that never imports the entry is refused', () => {
  const r = wrapperSourceDelegates(rendered().replace(/await import\([^)]*\)/, '{}'));
  assert.equal(r.ok, false);
});

test('ATTACK: an entry shim with no fail-closed ask is refused', () => {
  const r = wrapperSourceDelegates(rendered().replaceAll('"ask"', '"allow"'));
  assert.equal(r.ok, false);
  assert.match(r.why, /fail/);
});

test('the entry-source proof accepts "if (inScope) return await ..." and still refuses an un-awaited call', () => {
  const ok = 'const GATE = "./pretooluse-skill-gate.mjs";\nconst { runGate } = await import(GATE);\nif (inScope) return await gate(raw);\n';
  assert.equal(wrapperSourceDelegates(ok).ok, true);
  assert.equal(wrapperSourceDelegates(ok.replace('return await', 'return')).ok, false);
});
