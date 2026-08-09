# Token spend measurement — Cowork session 87df8771, 2026-08-08 → 2026-08-09

**Method (so this is reproducible, not a claim):** counted directly from the session
transcript JSONL at `~/.claude/projects/<project>/<session>.jsonl` plus the 18 subagent
transcripts under `<session>/subagents/`. Cost is EFFECTIVE, not raw: cache reads weighted
0.1x, cache writes 2x, output 5x, regular input 1x. Script inlined at the bottom so any
future session can re-run it on its own transcript.

Status per rule 14: **[CONFIRMED — counted from transcript files by the script below]** for
the distribution. **[HYPOTHESIS]** for any mapping onto the operator's account-level weekly
percentage — that data is not visible from a session and was NOT verified.

## Result — 136.1M effective tokens

| Group | Effective | Share |
|---|---:|---:|
| The code audit (18 subagents) | 65.3M | 48% |
| This conversation itself | 43.0M | 32% |
| Shell commands | 9.9M | 7% |
| Supabase connector | 7.6M | 6% |
| Everything else | 3.5M | 3% |
| File operations | 2.6M | 2% |
| Launching the subagents | 2.0M | 1% |
| Operator's computer (file bridge) | 1.0M | 1% |
| Scheduled tasks connector | 0.8M | 1% |
| Web research | 0.2M | 0.2% |

## The numbers behind it

- **828 turns** in the main transcript. Every turn re-reads everything before it — this is
  rule 11's cost model measured on itself.
- **54,389 tokens of fixed instructions re-read on EVERY turn** (system prompt + tool list).
  That alone is 4.5M effective across the session, before any work.
- **18 subagents**, the audit's 16 readers plus 2 earlier build agents. Largest single agent
  8.2M; top six 36.8M combined. This is the measured price of "read every line."
- **The fleet is under 1% here.** The scheduled workers that dominated the earlier cost
  investigation are a rounding error next to the audit and the conversation. Their own cost
  lives in their own sessions (self-metered into `integrity_flags` run-summary rows).

## Bug check — none found

Looked for and did not find: repeated/looping operations, a runaway agent, subagent count
exceeding what was dispatched (18 dispatched, 18 present), or a scheduled task firing
unexpectedly. The spend is fully explained by the audit's breadth plus session length.

## The lesson worth keeping

Two levers, in order of size:

1. **Breadth of comprehensive sweeps.** One instruction ("audit every line") bought 48% of
   the session. That is not waste — it was asked for and delivered — but it should be a
   priced decision, not an incidental one. A scoped audit (one subsystem, verified) costs a
   fraction and, per rule 14's evidence, produces findings that survive verification better.
2. **Session length.** At 828 turns the per-turn floor is ~54k of instructions plus the
   whole accumulated history. Long sessions get expensive by arithmetic. Durable work
   belongs in the repo/DB (it does), so a fresh session with a handover is strictly cheaper
   for continued work than carrying history forward.

## Re-run it on any session

```js
// node this against a session's own transcript dir
import fs from 'node:fs'; import glob from 'node:fs';
const eff = u => (u.input_tokens||0) + 0.1*(u.cache_read_input_tokens||0)
              + 2*(u.cache_creation_input_tokens||0) + 5*(u.output_tokens||0);
// sum eff(msg.usage) over every JSONL line of the main transcript and each
// subagents/*.jsonl; attribute main-transcript turns by the first tool_use name in the turn
// (mcp__* by connector, Read/Write/Edit/Grep = file ops, Bash = shell, Agent/Task =
// dispatch, none = conversation/reasoning). Baseline instructions = min(cache_read) x turns.
```

Related: standing rule 11 (context is a metered resource), rule 14 (findings carry
verification status), [fleet-cost-control-plan-2026-08-08](../plans/fleet-cost-control-plan-2026-08-08.md).
