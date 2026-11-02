/** jsdom has no layout: every element gets a box, so the virtualizer renders a window. */
export function mockBoxSize(height: number, rowHeight = 40) {
  const keys = ['clientHeight', 'clientWidth', 'offsetHeight', 'offsetWidth'] as const;
  const saved = keys.map((key) => Object.getOwnPropertyDescriptor(HTMLElement.prototype, key));
  const values = {
    clientHeight: height,
    clientWidth: 800,
    offsetHeight: rowHeight,
    offsetWidth: 800,
  };
  for (const key of keys) {
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get: () => values[key],
    });
  }
  return () =>
    keys.forEach((key, i) => {
      const d = saved[i];
      if (d) Object.defineProperty(HTMLElement.prototype, key, d);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
    });
}
