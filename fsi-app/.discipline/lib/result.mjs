// Result shape returned by every rule's trigger and check function.
// Three statuses: PASS (rule satisfied), FAIL (rule violated), SKIP (rule not applicable to this commit).

export function pass() {
  return { status: 'PASS' };
}

export function fail({ message, remediation }) {
  if (!message) throw new Error('fail() requires a message');
  if (!remediation) throw new Error('fail() requires a remediation hint');
  return { status: 'FAIL', message, remediation };
}

export function skip(reason) {
  if (!reason) throw new Error('skip() requires a reason');
  return { status: 'SKIP', reason };
}

export const STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  SKIP: 'SKIP',
});
