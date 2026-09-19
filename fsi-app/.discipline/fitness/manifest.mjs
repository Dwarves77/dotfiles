// Fitness function manifest, DERIVED from the functions/ directory (plan 6.8, Rule A: a registry is a
// directory, never a list). Each function file already exports its own `fitnessFunction` object
// ({ id, name, description, source, enumerate(), check() }); this module reads functions/F*.mjs
// (excluding *.test.mjs), imports each, validates id-vs-filename and id uniqueness, and sorts by numeric
// id. Two lanes adding a function now add two files instead of both appending to one shared array and
// conflicting on the same line.
//
// Post-slim (2026-05-21): F1, F3, F4, F5, F7 deleted per evidence-based audit (zero catches in production
// OR structural issues). Engine cut from 9 to 4.

import { readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS_DIR = resolve(HERE, 'functions');

const FILE_RE = /^(F\d+)-.*\.mjs$/;

// Exported for the test seam only (temp-fixture directories for the duplicate-id and
// id/filename-mismatch refusal cases); production code always calls loadAll() with no argument.
export function listFunctionFiles(dir = FUNCTIONS_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))
    .map((f) => {
      const m = f.match(FILE_RE);
      return m ? { file: f, idFromFile: m[1] } : null;
    })
    .filter(Boolean);
}

// dirUrl lets the test seam point at a temp fixture directory via a file:// URL; production omits it and
// resolves against this module's own functions/ directory.
export async function loadAll(dir = FUNCTIONS_DIR, dirUrl) {
  const base = dirUrl ?? new URL('functions/', import.meta.url);
  const entries = listFunctionFiles(dir);
  const loaded = await Promise.all(
    entries.map(async ({ file, idFromFile }) => {
      const mod = await import(new URL(file, base).href);
      const fn = mod.fitnessFunction;
      if (!fn || typeof fn !== 'object' || typeof fn.id !== 'string') {
        throw new Error(`fitness manifest: ${file} does not export a fitnessFunction object with an id`);
      }
      if (fn.id !== idFromFile) {
        throw new Error(
          `fitness manifest: ${file} exports fitnessFunction.id "${fn.id}", which does not match its ` +
          `filename prefix "${idFromFile}"`,
        );
      }
      return fn;
    }),
  );

  const seen = new Map();
  for (const fn of loaded) {
    if (seen.has(fn.id)) {
      throw new Error(
        `fitness manifest: duplicate fitness function id "${fn.id}" (${seen.get(fn.id)} and a second file ` +
        `both export this id)`,
      );
    }
    seen.set(fn.id, true);
  }

  const numericId = (id) => Number(id.slice(1));
  return [...loaded].sort((a, b) => numericId(a.id) - numericId(b.id));
}

// Top-level await, legal in .mjs. Every current importer (runner.mjs, invariant-coverage.mjs) uses a
// static `import { fitnessFunctions } from './manifest.mjs'`, and the ES module graph awaits this
// transparently, so no importer needs a code change for the switch to an async load.
export const fitnessFunctions = await loadAll();

export function getFunctionById(id) {
  return fitnessFunctions.find((f) => f.id === id);
}
