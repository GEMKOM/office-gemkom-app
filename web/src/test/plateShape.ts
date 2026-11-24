import { fireEvent, waitFor, within } from '@testing-library/react';

/**
 * Picks a plate shape ("Daire") in the Şekil select of that accessible name, inside scope.
 * The option is looked for in that select's own list (closed lists stay in the DOM).
 */
export async function pickShape(scope: HTMLElement, name: string, shape: string) {
  // Mantine's combobox scrolls the active option into view; jsdom has no scrollIntoView.
  Element.prototype.scrollIntoView ??= () => {};
  const input = within(scope).getByRole('combobox', { name });
  fireEvent.click(input);
  const list = await waitFor(() => {
    const id = input.getAttribute('aria-controls');
    const el = id ? document.getElementById(id) : null;
    if (!el) throw new Error(`no list for ${name}`);
    return el;
  });
  fireEvent.click(within(list).getByRole('option', { name: shape, hidden: true }));
}
