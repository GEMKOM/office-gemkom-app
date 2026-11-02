/** `ids` with `id` moved next to `targetId` (legacy onReorder semantics). */
export function moveId(
  ids: readonly string[],
  id: string,
  targetId: string,
  position: 'before' | 'after',
): string[] {
  if (id === targetId) return [...ids];
  const rest = ids.filter((x) => x !== id);
  const at = rest.indexOf(targetId);
  if (at < 0) return [...ids];
  rest.splice(position === 'before' ? at : at + 1, 0, id);
  return rest;
}

export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
