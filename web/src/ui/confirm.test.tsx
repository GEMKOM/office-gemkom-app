import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { theme } from '@/theme';
import { confirm } from './confirm';

function renderModals() {
  render(
    <MantineProvider theme={theme}>
      <ModalsProvider>{null}</ModalsProvider>
    </MantineProvider>,
  );
}

describe('confirm', () => {
  it('resolves true when confirmed', async () => {
    renderModals();
    let promise!: Promise<boolean>;
    act(() => {
      promise = confirm({ message: 'Kayıt silinsin mi?', danger: true });
    });
    expect(await screen.findByText('Kayıt silinsin mi?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Evet' }));
    await expect(promise).resolves.toBe(true);
  });

  it('resolves false when cancelled', async () => {
    renderModals();
    let promise!: Promise<boolean>;
    act(() => {
      promise = confirm('Devam edilsin mi?');
    });
    fireEvent.click(await screen.findByRole('button', { name: 'İptal' }));
    await expect(promise).resolves.toBe(false);
  });

  it('resolves false when closed with Escape', async () => {
    renderModals();
    let promise!: Promise<boolean>;
    act(() => {
      promise = confirm({ title: 'Onay', message: 'Kapatılsın mı?' });
    });
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(promise).resolves.toBe(false));
  });
});
