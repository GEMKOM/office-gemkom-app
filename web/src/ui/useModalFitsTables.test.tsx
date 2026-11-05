import { render } from '@testing-library/react';
import { useRef } from 'react';
import { expect, it } from 'vitest';
import { tableOverflow, useModalFitsTables } from './useModalFitsTables';

// jsdom has no layout: give elements the widths a browser would report.
function size(el: Element, scrollWidth: number, clientWidth: number, offsetWidth = clientWidth) {
  Object.defineProperties(el, {
    scrollWidth: { configurable: true, get: () => scrollWidth },
    clientWidth: { configurable: true, get: () => clientWidth },
    offsetWidth: { configurable: true, get: () => offsetWidth },
  });
}

it('measures how far the widest table spills out of the box that clips it', () => {
  document.body.innerHTML =
    '<div id="body"><div id="wrap"><table id="a"></table></div><div id="wrap2"><table></table></div></div>';
  const body = document.getElementById('body')!;
  size(body, 700, 700);
  size(document.getElementById('wrap')!, 1460, 700);
  size(document.getElementById('wrap2')!, 600, 700);
  expect(tableOverflow(body)).toBe(760);
});

function Body({ wide }: { wide: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalFitsTables(ref);
  return (
    <div ref={ref} data-testid="body">
      <div data-testid="wrap" data-wide={wide}>
        <table />
      </div>
    </div>
  );
}

function mount(wide: boolean) {
  const content = document.createElement('div');
  content.className = 'mantine-Modal-content';
  document.body.replaceChildren(content);
  // Sizes must exist before the layout effect runs, so patch the prototype for the render.
  const proto = HTMLElement.prototype;
  const original = {
    scrollWidth: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth'),
    clientWidth: Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth'),
    offsetWidth: Object.getOwnPropertyDescriptor(proto, 'offsetWidth'),
  };
  Object.defineProperty(proto, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset.wide === 'true' ? 1460 : 700;
    },
  });
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get: () => 700 });
  Object.defineProperty(proto, 'offsetWidth', { configurable: true, get: () => 780 });
  try {
    render(<Body wide={wide} />, { container: content });
  } finally {
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor)
        Object.defineProperty(key === 'offsetWidth' ? proto : Element.prototype, key, descriptor);
      else delete (proto as unknown as Record<string, unknown>)[key];
    }
  }
  return content;
}

it('widens the modal to fit a wide table, up to 96vw', () => {
  expect(mount(true).style.getPropertyValue('--modal-size')).toBe('min(1540px, 96vw)');
});

it('leaves a modal whose tables fit at its own size', () => {
  expect(mount(false).style.getPropertyValue('--modal-size')).toBe('');
});
