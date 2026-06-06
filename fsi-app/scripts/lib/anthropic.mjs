/**
 * Canonical Anthropic call site for SCRIPTS — the sanctioned direct-call wrapper.
 *
 * Discipline rule 016 permits direct Anthropic calls ONLY in the canonical wrappers/routes; this is
 * the script-side wrapper (the app side is /api/agent/run et al). exemptions.mjs exempts this file's
 * `model` classification because it IS the sanctioned site. Routing script LLM calls through here
 * keeps spend visibility + a single place to add caps/retries, instead of N ad-hoc createClient calls
 * (the exact bypass that left source_citations unpopulated when generation skipped /api/agent/run).
 *
 * Caller must have loaded env (process.loadEnvFile) with ANTHROPIC_API_KEY first.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const API_VERSION = "2023-06-01";

/**
 * canonicalGenerate — one Messages API call. Returns the parsed JSON response.
 * @param {object} opts
 * @param {Array}  opts.messages    - Anthropic messages array (required)
 * @param {string} [opts.system]    - system prompt
 * @param {string} [opts.model]     - model id (default claude-sonnet-4-6)
 * @param {number} [opts.maxTokens] - max_tokens (default 4096)
 * @param {Array}  [opts.tools]     - tool definitions (e.g. web_search)
 * @param {string[]} [opts.beta]    - anthropic-beta headers
 */
export async function canonicalGenerate({ messages, system, model = DEFAULT_MODEL, maxTokens = 4096, tools, beta } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("anthropic.mjs: load env (ANTHROPIC_API_KEY) before use.");
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("anthropic.mjs canonicalGenerate: messages[] required.");
  }
  const headers = {
    "content-type": "application/json",
    "x-api-key": key,
    "anthropic-version": API_VERSION,
  };
  if (beta && beta.length) headers["anthropic-beta"] = beta.join(",");
  const body = { model, max_tokens: maxTokens, messages };
  if (system) body.system = system;
  if (tools) body.tools = tools;

  const res = await fetch(API_URL, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`anthropic.mjs: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`);
  }
  return res.json();
}

/** Convenience: return the concatenated text of the first text blocks. */
export function textOf(response) {
  return (response?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
}
