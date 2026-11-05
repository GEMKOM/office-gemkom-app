import { useLayoutEffect, type RefObject } from 'react';

// A table wider than its modal used to scroll sideways inside a fixed-size
// box (detail modals at "xl" are 780 px). This widens the modal around
// ModalBody until its widest table fits, up to 96 % of the window; a modal
// whose tables already fit keeps the size its caller chose.

const MAX = '96vw';

/** How many pixels the widest table spills out of the box that clips it. */
export function tableOverflow(body: HTMLElement): number {
  let overflow = 0;
  for (const table of body.querySelectorAll('table')) {
    for (let el = table.parentElement; el; el = el.parentElement) {
      overflow = Math.max(overflow, el.scrollWidth - el.clientWidth);
      if (el === body) break;
    }
  }
  return overflow;
}

export function useModalFitsTables(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const body = ref.current;
    const content = body?.closest<HTMLElement>('.mantine-Modal-content');
    if (!body || !content || content.hasAttribute('data-full-screen')) return;

    let frame = 0;
    const fit = () => {
      frame = 0;
      const overflow = Math.max(tableOverflow(body), content.scrollWidth - content.clientWidth);
      if (overflow <= 1) return;
      // offsetWidth ignores the open transition's scale.
      const width = Math.ceil(content.offsetWidth + overflow);
      content.style.setProperty('--modal-size', `min(${width}px, ${MAX})`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(fit);
    };

    fit();
    const mutations = new MutationObserver(schedule);
    mutations.observe(body, { childList: true, subtree: true });
    const resizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    resizes?.observe(body);
    return () => {
      mutations.disconnect();
      resizes?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);
}
