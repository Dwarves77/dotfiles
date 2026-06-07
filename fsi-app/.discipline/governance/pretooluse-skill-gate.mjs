#!/usr/bin/env node
// ACTION-TIME SKILL GATE (PreToolUse hook). The missing link: skills/rules were enforced at
// commit-time + CI + the invariant meta-gate, but the work that kept going wrong (direct
// `node scripts/x.mjs --apply` prod-writes: the 27-dup incident, the erase batch) bypasses ALL of
// those — nothing is committed, so nothing gates it. The prior Bash guard greps for specific table
// names and missed `--apply` on new script names. This gate fires on ANY data-write / destructive /
// --apply op, NAMES the governing skill (via skill-map), and returns permissionDecision=ask so the
// skill is in context at the decision point and the write cannot proceed un-acknowledged.
//
// Wired from ~/.claude/settings.json PreToolUse (Bash matcher) as a thin pointer to this in-repo file.
// Reads the PreToolUse JSON payload on stdin; writes a hookSpecificOutput decision on stdout.
// FAIL-CLOSED: any error -> ask.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function out(permissionDecision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision, ...(reason ? { permissionDecisionReason: reason } : {}) },
  }));
  process.exit(0);
}

let raw = "";
try { raw = readFileSync(0, "utf8"); } catch { out("ask", "skill-gate backstop: could not read payload — failing closed."); }
if (!raw.trim()) out("ask", "skill-gate backstop: empty payload — failing closed.");

let payload;
try { payload = JSON.parse(raw); } catch { out("ask", "skill-gate backstop: unparseable payload — failing closed."); }

const tool = payload?.tool_name || "";
const input = payload?.tool_input || {};

let skillsForOp = () => [], skillsForFile = () => [], mapLoaded = false;
try {
  // pathToFileURL is REQUIRED: on Windows a raw `C:\...` path throws ERR_UNSUPPORTED_ESM_URL_SCHEME.
  const mapPath = resolve(dirname(fileURLToPath(import.meta.url)), "skill-map.mjs");
  const m = await import(pathToFileURL(mapPath).href);
  skillsForOp = m.skillsForOp; skillsForFile = m.skillsForFile; mapLoaded = true;
} catch { /* skill-map unavailable — fail closed below (cannot prove a file is ungoverned) */ }

// ── Bash: gate data-writes / destructive / scaled runs. The write signal is the --apply/--execute/
// --write FLAG (our scripts are dry-run by default) + inherently-destructive ops + named runners.
// Read-only / dry-run runs pass — only actual writes gate. ──
if (tool === "Bash") {
  const cmd = input.command || "";
  const DANGER = new RegExp([
    "--apply\\b", "--execute\\b", "--write\\b",
    "b2-runner", "git\\s+push", "rm\\s+-rf", "drop\\s+(table|column)", "truncate", "delete\\s+from",
    "set\\s+not\\s+null", "add\\s+constraint", "update\\s+intelligence_items", "update\\s+sources",
    "set\\s+provenance_status", "supabase\\s+db\\s+(reset|push)", "run-migration", "exec_sql", "seed/apply-",
  ].join("|"), "i");
  if (!DANGER.test(cmd)) out("allow");
  const sk = (skillsForOp(cmd).map((s) => s.skill).join(", ")) || "remediation-discipline + environmental-policy-and-innovation (data write)";
  out("ask",
    `DATA-WRITE / destructive op. GOVERNING SKILL(S): ${sk}. The approach MUST follow them: ` +
    `classify-before-delete (diagnose first); omit-with-note / gap-label — NEVER delete/null real content for a gap; ` +
    `verify-before-completion (dry-run + read-back, paginated reads). Approve only if skill-grounded, not improvised.`,
  );
}

// ── Edit / Write / MultiEdit / NotebookEdit: if the target file is on the GOVERNED surface, fire the
// governing skill at the edit point so it cannot be edited without the skill in context. ──
if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) {
  const path = input.file_path || input.notebook_path || "";
  if (!mapLoaded) out("ask", "skill-gate backstop: skill-map failed to load — cannot prove this file is ungoverned; failing closed.");
  const skills = skillsForFile(path).map((s) => s.skill);
  if (!skills.length) out("allow");                              // not a governed file
  out("ask",
    `Editing a GOVERNED file. GOVERNING SKILL(S): ${skills.join(", ")}. Apply that skill's rules to this edit ` +
    `(format/grounding/surface/credibility per the skill). Approve only if the change conforms to the skill.`,
  );
}

out("allow"); // any other tool
