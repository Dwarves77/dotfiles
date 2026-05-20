// Result shape for fitness function violations.

export function violation(line, message) {
  if (typeof line !== 'number' || line < 1) throw new Error('violation() requires line number >= 1');
  if (!message) throw new Error('violation() requires a message');
  return { line, message };
}

export const PASS = [];
