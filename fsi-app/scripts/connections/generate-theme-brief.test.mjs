// generate-theme-brief.test.mjs, proves the --theme bundle (runTheme), the JSON/MD
// payload parser, and the write-time member_hash staleness refusal (validateAgainstLiveMembers).
// Importing this module never invokes main() (IS_MAIN checks process.argv[1] against the test file).
import test from "node:test";
import assert from "node:assert/strict";
import { parseBriefPayload, validateAgainstLiveMembers, isStructuredPayload, runWrite, runTheme } from "./generate-theme-brief.mjs";
import { fixtureDeps } from "../turns/theme-briefs/fixture-deps.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { computeMemberHash } from "../../src/lib/connections/brief-staleness.mjs";

// ── runTheme: the bundle now comes from the one shared builder (scripts/turns/theme-briefs/data.mjs) ──

const readJson = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));
const CORPUS = readJson("../turns/theme-briefs/fixtures/corpus.fixture.json");
const BATCH = readJson("../turns/theme-briefs/fixtures/theme-briefs-000.fixture.json");
const T1 = "11111111-1111-4111-8111-111111111111";
const clone = (x) => JSON.parse(JSON.stringify(x));
const LIVE_T1 = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];

test("runTheme: the bundle carries member_hash from the one recipe, member claims, events, edges and gaps", async () => {
  const r = await runTheme(T1, fixtureDeps(CORPUS));
  assert.equal(r.ok, true);
  assert.equal(r.bundle.member_hash, computeMemberHash(LIVE_T1));
  assert.equal(r.bundle.member_count, 3);
  assert.ok(r.bundle.members.some((m) => m.claims.length > 0 && m.summary));
  assert.equal(r.bundle.members.find((m) => m.id === T1).forward_events.length, 1);
  assert.equal(r.bundle.intra_theme_edges.length, 2);
  assert.equal(r.bundle.gaps.length, 1);
});

test("runTheme: an unknown theme id is refused", async () => {
  const r = await runTheme("99999999-0000-4000-8000-000000000000", fixtureDeps(CORPUS));
  assert.equal(r.ok, false);
  assert.match(r.error, /no connection_themes row/);
});

// ── parseBriefPayload ────────────────────────────────────────────────────────────────────────────

test("parseBriefPayload: valid JSON payload parses all four required fields", () => {
  const content = JSON.stringify({ theme_id: "t1", title: "My Theme", brief_md: "# Brief\nBody", member_hash: "abc123" });
  const r = parseBriefPayload("brief.json", content);
  assert.equal(r.ok, true);
  assert.equal(r.theme_id, "t1");
  assert.equal(r.title, "My Theme");
  assert.equal(r.brief_md, "# Brief\nBody");
  assert.equal(r.member_hash, "abc123");
});

test("parseBriefPayload: invalid JSON -> refused with a parse error", () => {
  const r = parseBriefPayload("brief.json", "{not valid json");
  assert.equal(r.ok, false);
  assert.match(r.error, /invalid JSON/);
});

test("parseBriefPayload: JSON missing a required field -> refused, names the missing field", () => {
  const r = parseBriefPayload("brief.json", JSON.stringify({ theme_id: "t1", title: "X" }));
  assert.equal(r.ok, false);
  assert.match(r.error, /brief_md/);
  assert.match(r.error, /member_hash/);
});

test("parseBriefPayload: Markdown with frontmatter parses theme_id/title/member_hash + body", () => {
  const md = `---\ntheme_id: t1\ntitle: My Theme\nmember_hash: abc123\n---\n# Brief\n\nBody text here.\n`;
  const r = parseBriefPayload("brief.md", md);
  assert.equal(r.ok, true);
  assert.equal(r.theme_id, "t1");
  assert.equal(r.title, "My Theme");
  assert.equal(r.member_hash, "abc123");
  assert.equal(r.brief_md, "# Brief\n\nBody text here.");
});

test("parseBriefPayload: Markdown without a frontmatter block -> refused", () => {
  const r = parseBriefPayload("brief.md", "# Just a brief, no frontmatter\n");
  assert.equal(r.ok, false);
  assert.match(r.error, /frontmatter/);
});

test("parseBriefPayload: unsupported extension -> refused", () => {
  const r = parseBriefPayload("brief.txt", "anything");
  assert.equal(r.ok, false);
  assert.match(r.error, /unsupported payload extension/);
});

test("parseBriefPayload: quoted frontmatter values are unquoted", () => {
  const md = `---\ntheme_id: "t1"\ntitle: 'My Theme'\nmember_hash: abc123\n---\nBody\n`;
  const r = parseBriefPayload("brief.md", md);
  assert.equal(r.ok, true);
  assert.equal(r.theme_id, "t1");
  assert.equal(r.title, "My Theme");
});

// ── validateAgainstLiveMembers ───────────────────────────────────────────────────────────────────

test("validateAgainstLiveMembers: matching hash -> ok, row assembled with fresh generated_at/generated_by", () => {
  const liveMembers = ["a", "b", "c"];
  const payload = { theme_id: "t1", title: "T", brief_md: "B", member_hash: computeMemberHash(liveMembers) };
  const r = validateAgainstLiveMembers(payload, liveMembers);
  assert.equal(r.ok, true);
  assert.equal(r.row.theme_id, "t1");
  assert.equal(r.row.member_hash, computeMemberHash(liveMembers));
  assert.equal(r.row.member_count, 3);
  assert.equal(r.row.title, "T");
  assert.equal(r.row.brief_md, "B");
  assert.equal(r.row.generated_by, "session-executor");
  assert.ok(r.row.generated_at);
});

test("validateAgainstLiveMembers: mismatched hash (membership drifted) -> refused, names both hashes", () => {
  const payload = { theme_id: "t1", title: "T", brief_md: "B", member_hash: "stale-hash" };
  const r = validateAgainstLiveMembers(payload, ["a", "b"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /member_hash mismatch/);
  assert.match(r.error, /stale-hash/);
  assert.match(r.error, /Re-run --theme t1/);
});

test("validateAgainstLiveMembers: member re-ordering alone does not cause a mismatch (hash is order-independent)", () => {
  const payload = { theme_id: "t1", title: "T", brief_md: "B", member_hash: computeMemberHash(["b", "a", "c"]) };
  const r = validateAgainstLiveMembers(payload, ["c", "a", "b"]); // same set, different order
  assert.equal(r.ok, true);
});

test("validateAgainstLiveMembers: one member added since authoring -> mismatch, refused", () => {
  const payload = { theme_id: "t1", title: "T", brief_md: "B", member_hash: computeMemberHash(["a", "b"]) };
  const r = validateAgainstLiveMembers(payload, ["a", "b", "c"]);
  assert.equal(r.ok, false);
});

// ── --write routes through the same validator and writer as the batch apply ──────────────────────────────────────────────

test("isStructuredPayload: a .json payload carrying sections is the new form; brief_md only is legacy", () => {
  assert.equal(isStructuredPayload("p.json", JSON.stringify({ theme_id: "t", sections: {} })), true);
  assert.equal(isStructuredPayload("p.json", JSON.stringify({ theme_id: "t", brief_md: "x" })), false);
  assert.equal(isStructuredPayload("p.md", "---\n---\nx"), false);
  assert.equal(isStructuredPayload("p.json", "{bad"), false);
});

test("runWrite: a structured payload runs the FULL validator (a bad hash is refused with the batch validator's reason)", async () => {
  const entry = clone(BATCH.entries[0]);
  entry.member_hash = "0".repeat(32);
  const deps = fixtureDeps(CORPUS);
  const r = await runWrite({ filePath: "p.json", content: JSON.stringify(entry), execute: true, deps });
  assert.equal(r.ok, false);
  assert.match(r.error, /member_hash does not match the live membership/);
  assert.equal(deps.tables.theme_briefs.find((b) => b.theme_id === T1), undefined);
});

test("runWrite: a valid structured payload writes through the shared writer, structured columns included", async () => {
  const deps = fixtureDeps(CORPUS);
  const r = await runWrite({ filePath: "p.json", content: JSON.stringify(clone(BATCH.entries[0])), execute: true, deps });
  assert.equal(r.ok, true, r.error);
  const row = deps.tables.theme_briefs.find((b) => b.theme_id === T1);
  assert.ok(row.sections && row.claims && row.member_ids);
  assert.match(row.generated_by, /^theme-briefs-/);
});

test("runWrite: a legacy brief_md payload still works, through the same writer, and keeps generated_by session-executor", async () => {
  const deps = fixtureDeps(CORPUS);
  const content = JSON.stringify({ theme_id: T1, title: "Legacy", brief_md: "# Legacy\nBody", member_hash: computeMemberHash(LIVE_T1) });
  const r = await runWrite({ filePath: "p.json", content, execute: true, deps });
  assert.equal(r.ok, true, r.error);
  const row = deps.tables.theme_briefs.find((b) => b.theme_id === T1);
  assert.equal(row.generated_by, "session-executor");
  assert.equal(row.title, "Legacy");
});

test("runWrite: a legacy payload with a drifted hash is still refused", async () => {
  const deps = fixtureDeps(CORPUS);
  const content = JSON.stringify({ theme_id: T1, title: "L", brief_md: "B", member_hash: "stale" });
  const r = await runWrite({ filePath: "p.json", content, execute: true, deps });
  assert.equal(r.ok, false);
  assert.match(r.error, /member_hash mismatch/);
});

test("runWrite: dry (execute false) writes nothing", async () => {
  const deps = fixtureDeps(CORPUS);
  const r = await runWrite({ filePath: "p.json", content: JSON.stringify(clone(BATCH.entries[0])), execute: false, deps });
  assert.equal(r.ok, true);
  assert.equal(deps.tables.theme_briefs.find((b) => b.theme_id === T1), undefined);
});

test("runWrite: a write tolerates migration 351's columns being absent", async () => {
  const deps = fixtureDeps({ ...CORPUS, missing_columns: { theme_briefs: ["sections", "claims", "member_ids"] } });
  const r = await runWrite({ filePath: "p.json", content: JSON.stringify(clone(BATCH.entries[0])), execute: true, deps });
  assert.equal(r.ok, true, r.error);
  assert.equal(deps.tables.theme_briefs.find((b) => b.theme_id === T1).sections, undefined);
});
