// RED-THEN-GREEN proof for the acting-agent transcript resolver (agent-transcript.mjs).
// Plants the exact defect this module fixes (a sub-agent call judged against the PARENT transcript,
// where its own Skill tool_use never appears) and proves the resolver escapes it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, sep } from "node:path";
import { resolveActingTranscriptPath } from "./agent-transcript.mjs";

const PARENT = "D:/claude-projects/proj-dotfiles/0348ec3e-bec7-4a33-bfb8-02d02b67b731.jsonl";
const POSIX_PARENT = "/opt/claude-projects/proj-abc/0348ec3e.jsonl";

test("no agentId (main-session call) -> unchanged parent path", () => {
  assert.equal(resolveActingTranscriptPath(PARENT, ""), PARENT);
  assert.equal(resolveActingTranscriptPath(PARENT, undefined), PARENT);
});

test("agentId present -> derives the sub-agent's own sibling transcript (Windows-style input)", () => {
  const got = resolveActingTranscriptPath(PARENT, "a784e9129465c0b17");
  const expected = join(
    "D:/claude-projects/proj-dotfiles",
    "0348ec3e-bec7-4a33-bfb8-02d02b67b731",
    "subagents",
    "agent-a784e9129465c0b17.jsonl"
  );
  assert.equal(got, expected);
});

test("agentId present -> derives the sub-agent's own sibling transcript (POSIX-style input)", () => {
  const got = resolveActingTranscriptPath(POSIX_PARENT, "a6206d8e416f42775");
  const suffix = ["subagents", "agent-a6206d8e416f42775.jsonl"].join(sep);
  assert.ok(got.endsWith(suffix), `expected suffix ${suffix}, got ${got}`);
  assert.ok(got.includes("0348ec3e"), `expected the stripped-extension dir name in ${got}`);
});

test("ATTACK: the resolver must not fall back to the unmodified parent path once an agentId is given", () => {
  const got = resolveActingTranscriptPath(PARENT, "a784e9129465c0b17");
  const failMsg = "resolver returned the parent transcript unchanged; that is the exact defect from lane M3, 2026-09-20 00:55 UTC, where a sub-agent's own Skill load is invisible in the parent file";
  assert.notEqual(got, PARENT, failMsg);
});

test("no transcriptPath at all -> empty string regardless of agentId", () => {
  assert.equal(resolveActingTranscriptPath("", "someagent"), "");
  assert.equal(resolveActingTranscriptPath(undefined, "someagent"), "");
});
