import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE_DIR = (() => {
  try {
    return resolve(fileURLToPath(import.meta.url), "..");
  } catch {
    return process.cwd();
  }
})();

// src/app/admin/parts/, the directory holding one subfolder per part route.
export const PARTS_DIR = resolve(HERE_DIR, "..", "..", "app", "admin", "parts");

const REQUIRED_KEYS = Object.freeze(["slug", "name", "summary"]);
const ALLOWED_KEYS = new Set(REQUIRED_KEYS);

/** Thrown for any invalid part.json descriptor. Named so a caller can distinguish this from a plain
 * filesystem/parse error and so a violation message always names the offending file. */
export class PartDescriptorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PartDescriptorError";
  }
}

export interface PartEntry {
  slug: string;
  name: string;
  summary: string;
}

/**
 * Validate one parsed part.json object against the shape this registry requires. Pure, no I/O.
 * @param dirName the directory the descriptor was read from (slug must equal this)
 * @param descriptor the parsed JSON
 * @returns errors, empty if valid
 */
export function validatePartDescriptor(dirName: string, descriptor: unknown): string[] {
  const errors: string[] = [];
  if (descriptor === null || typeof descriptor !== "object" || Array.isArray(descriptor)) {
    return [`${dirName}/part.json must be a plain JSON object`];
  }
  const obj = descriptor as Record<string, unknown>;

  for (const key of REQUIRED_KEYS) {
    if (!(key in obj)) errors.push(`${dirName}/part.json is missing required field: ${key}`);
  }
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_KEYS.has(key)) errors.push(`${dirName}/part.json has unknown field: ${key}`);
  }
  if (errors.length) return errors; // type checks below assume presence

  if (obj.slug !== dirName) {
    errors.push(
      `${dirName}/part.json's "slug" field ("${String(obj.slug)}") must equal its own directory name ("${dirName}")`,
    );
  }
  if (typeof obj.name !== "string" || obj.name.trim().length === 0) {
    errors.push(`${dirName}/part.json's "name" must be a non-empty string`);
  }
  if (typeof obj.summary !== "string" || obj.summary.trim().length === 0) {
    errors.push(`${dirName}/part.json's "summary" must be a non-empty string`);
  }

  return errors;
}

/**
 * Read every immediate subdirectory of `partsDir` that contains a part.json, validate each, and return
 * them as an array of entries sorted by slug (deterministic; no shared counter or insertion point for
 * two new parts to collide on). A subdirectory with no part.json is skipped -- not every directory under
 * admin/parts/ is a part (there is none today, but this mirrors family-registry.mjs's own tolerance for
 * non-family directories). Throws PartDescriptorError, named, on the FIRST invalid descriptor found,
 * fail-closed, matching family-registry.mjs's loadFamilies.
 * @param partsDir defaults to this module's own directory (src/app/admin/parts/)
 * @returns validated entries, sorted by slug
 */
export function loadPartEntries(partsDir: string = PARTS_DIR): PartEntry[] {
  const resolved = resolve(partsDir);
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = readdirSync(resolved, { withFileTypes: true });
  } catch (err) {
    throw new PartDescriptorError(`parts-registry: cannot read ${resolved}: ${(err as Error).message}`);
  }

  const out: PartEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const descriptorPath = join(resolved, entry.name, "part.json");
    if (!existsSync(descriptorPath)) continue; // not every subdirectory is a part

    let raw: string;
    try {
      raw = readFileSync(descriptorPath, "utf8");
    } catch (err) {
      throw new PartDescriptorError(`parts-registry: cannot read ${descriptorPath}: ${(err as Error).message}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new PartDescriptorError(`parts-registry: ${descriptorPath} is not valid JSON: ${(err as Error).message}`);
    }
    const errors = validatePartDescriptor(entry.name, parsed);
    if (errors.length) {
      throw new PartDescriptorError(`parts-registry: invalid descriptor ${descriptorPath}: ${errors.join("; ")}`);
    }
    const d = parsed as PartEntry;
    out.push({ slug: d.slug, name: d.name, summary: d.summary });
  }

  out.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return out;
}
