// The node:assert/strict calls the ported legacy *.test.mjs files make, on
// Vitest's expect, so their bodies could move over unchanged.

export const assert = {
  equal(actual: unknown, expected: unknown, message?: string) {
    expect(actual, message).toBe(expected);
  },
  notEqual(actual: unknown, expected: unknown, message?: string) {
    expect(actual, message).not.toBe(expected);
  },
  deepEqual(actual: unknown, expected: unknown, message?: string) {
    expect(actual, message).toStrictEqual(expected);
  },
  ok(value: unknown, message?: string) {
    expect(value, message).toBeTruthy();
  },
};
