/** Rotation verify-then-clear: mechanically confirm the CURRENT service-role key was NEVER committed to
 *  git history. Reads the key ONLY from .env.local (process env); NEVER prints it. Uses git pickaxe
 *  (-S) + -G regex over ALL history, plus a path-history check on .env.local. Prints booleans only. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");      // fsi-app
const REPO = resolve(ROOT, "..");                                              // dotfiles (git root)
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch (e) { console.log("ENV LOAD FAILED:", e.message); process.exit(2); }
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key || key.length < 40) { console.log("KEY ABSENT/short in .env.local — cannot verify"); process.exit(2); }

function git(args) { try { return execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8", maxBuffer: 1 << 26 }); } catch (e) { return (e.stdout || "") + ""; } }

// 1. pickaxe: any commit that ADDED or REMOVED the exact key value
const pick = git(["log", "--all", "--oneline", "-S", key]).trim();
// 2. regex pickaxe (-G): any diff line matching the key (catches moves the -S pickaxe misses)
const greg = git(["log", "--all", "--oneline", "-G", key.slice(0, 60)]).trim();
// 3. path history: was fsi-app/.env.local EVER committed?
const envPath = git(["log", "--all", "--oneline", "--", "fsi-app/.env.local"]).trim();
// 4. is .env.local currently ignored?
let ignored = "?"; try { execFileSync("git", ["-C", REPO, "check-ignore", "-q", "fsi-app/.env.local"]); ignored = "yes"; } catch { ignored = "NO"; }

console.log("=== rotation verify-then-clear (key value never printed) ===");
console.log(`commits adding/removing the key value (-S):   ${pick ? "FOUND -> " + pick.split("\n").length : "NONE"}`);
console.log(`commits with key in any diff line (-G):       ${greg ? "FOUND -> " + greg.split("\n").length : "NONE"}`);
console.log(`fsi-app/.env.local ever committed:            ${envPath ? "YES -> " + envPath.split("\n").length + " commits" : "NEVER"}`);
console.log(`fsi-app/.env.local currently gitignored:      ${ignored}`);
const clean = !pick && !greg && !envPath;
console.log(`\nVERDICT: ${clean ? "CLEAN ✓ — current key NEVER committed; rotation flag may be cleared" : "DIRTY ✗ — investigate"}`);
process.exit(clean ? 0 : 1);
