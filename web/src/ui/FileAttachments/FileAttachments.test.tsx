import { ModalsProvider } from '@mantine/modals';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import type { AttachmentFile } from '../files';
import { FileViewer } from '../FileViewer/FileViewer';
import { FileAttachments } from './FileAttachments';
import type { UploadFn } from './useUploadQueue';

const FILES: AttachmentFile[] = [
  {
    id: 1,
    url: 'https://files.test/bulgu.jpg',
    name: 'bulgu.jpg',
    size: 245_000,
    uploadedBy: 'Ayşe Yılmaz',
    uploadedAt: '2026-11-01T09:30:00+03:00',
    typeLabel: 'Fotoğraf',
  },
  { id: 2, url: 'https://files.test/rapor.pdf', name: 'rapor.pdf', size: 1_200_000 },
  { id: 3, url: 'https://files.test/liste.xlsx', name: 'liste.xlsx' },
];

function picked(...names: string[]) {
  return names.map(
    (name) => new File(['x'.repeat(10)], name, { type: 'application/octet-stream' }),
  );
}

function renderList(ui: React.ReactElement) {
  return renderWithProviders(<ModalsProvider>{ui}</ModalsProvider>);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('FileAttachments', () => {
  it('lists each file with its type, uploader, date and size', () => {
    renderList(<FileAttachments title="Dosyalar" files={FILES} />);
    const list = screen.getByRole('list', { name: 'Dosyalar' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('bulgu.jpg');
    expect(rows[0]).toHaveTextContent('Tür: Fotoğraf');
    expect(rows[0]).toHaveTextContent('Ayşe Yılmaz');
    expect(rows[0]).toHaveTextContent('239.3 KB');
    expect(screen.getByRole('heading', { name: /Dosyalar\s*3/ })).toBeInTheDocument();
  });

  it('shows the empty, loading and error states', () => {
    const { rerender } = renderList(<FileAttachments files={[]} />);
    expect(screen.getByText('Henüz dosya yok.')).toBeInTheDocument();
    rerender(
      <ModalsProvider>
        <FileAttachments files={[]} loading />
      </ModalsProvider>,
    );
    expect(screen.getByText('Dosyalar yükleniyor…')).toBeInTheDocument();
    rerender(
      <ModalsProvider>
        <FileAttachments files={[]} error={new Error('x')} />
      </ModalsProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Dosyalar yüklenemedi.');
  });

  it('read-only hides upload and delete', () => {
    renderList(<FileAttachments files={FILES} readOnly onUpload={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Dosya seçin' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sil' })).not.toBeInTheDocument();
  });

  it('uploads picked files one by one with progress, then reports the batch', async () => {
    let finish: (() => void) | null = null;
    const upload = vi.fn<UploadFn>(
      (_file, { onProgress }) =>
        new Promise<void>((resolve) => {
          onProgress(0.4);
          finish = () => resolve();
        }),
    );
    const onUploaded = vi.fn();
    renderList(<FileAttachments files={[]} onUpload={upload} onUploaded={onUploaded} />);

    fireEvent.change(screen.getByTestId('file-input'), {
      target: { files: picked('a.png', 'b.pdf') },
    });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    const queue = screen.getByRole('list', { name: 'Yüklenen dosyalar' });
    expect(within(queue).getAllByRole('listitem')).toHaveLength(2);
    expect(queue).toHaveTextContent('%40');
    expect(queue).toHaveTextContent('Sırada');

    await act(async () => finish?.());
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    expect(upload.mock.calls[1]![0].name).toBe('b.pdf');
    await act(async () => finish?.());

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith({ uploaded: 2, failed: 0 }));
    expect(screen.queryByRole('list', { name: 'Yüklenen dosyalar' })).not.toBeInTheDocument();
  });

  it('accepts dropped files', async () => {
    const upload = vi.fn<UploadFn>(() => Promise.resolve());
    renderList(<FileAttachments files={[]} onUpload={upload} />);
    const zone = screen.getByText('Dosyaları buraya sürükleyin veya').parentElement!;
    fireEvent.drop(zone, { dataTransfer: { files: picked('foto.jpg'), types: ['Files'] } });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0]![0].name).toBe('foto.jpg');
  });

  it('keeps a failed file with its error, and retries it', async () => {
    const upload = vi
      .fn<UploadFn>()
      .mockRejectedValueOnce(new Error('Dosya türü desteklenmiyor'))
      .mockResolvedValueOnce(undefined);
    const onUploaded = vi.fn();
    renderList(<FileAttachments files={[]} onUpload={upload} onUploaded={onUploaded} />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: picked('virus.exe') } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Dosya türü desteklenmiyor');
    expect(onUploaded).toHaveBeenLastCalledWith({ uploaded: 0, failed: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
    await waitFor(() => expect(onUploaded).toHaveBeenLastCalledWith({ uploaded: 1, failed: 0 }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refuses a file over the size limit without uploading it', async () => {
    const upload = vi.fn<UploadFn>(() => Promise.resolve());
    renderList(<FileAttachments files={[]} onUpload={upload} maxSize={5} />);
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: picked('büyük.pdf') } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Dosya çok büyük (en fazla 5 B)');
    expect(upload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Kaldır' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('deletes only after the confirm', async () => {
    const onDelete = vi.fn(() => Promise.resolve());
    renderList(
      <FileAttachments files={FILES} onDelete={onDelete} canDelete={(file) => file.id !== 3} />,
    );
    expect(screen.getAllByRole('button', { name: 'Sil' })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Dosya Sil' });
    expect(dialog).toHaveTextContent('bulgu.jpg');
    fireEvent.click(within(dialog).getByRole('button', { name: 'İptal' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[0]!);
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: 'Dosya Sil' })).getByRole('button', {
        name: 'Sil',
      }),
    );
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(FILES[0]));
  });

  it('opens the viewer on the clicked file', async () => {
    renderList(<FileAttachments files={FILES} />);
    fireEvent.click(screen.getByRole('button', { name: 'rapor.pdf' }));
    const viewer = await screen.findByRole('dialog', { name: 'rapor.pdf' });
    expect(within(viewer).getByTitle('rapor.pdf')).toHaveAttribute(
      'src',
      'https://files.test/rapor.pdf',
    );
  });
});

describe('FileViewer', () => {
  function Harness({ start = 0 }: { start?: number }) {
    const [index, setIndex] = useState<number | null>(start);
    return (
      <FileViewer
        files={FILES}
        index={index}
        onIndexChange={setIndex}
        onClose={() => setIndex(null)}
      />
    );
  }

  beforeEach(() => {
    vi.spyOn(window, 'fetch').mockResolvedValue(new Response('x'));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows an image with zoom, and steps between files', async () => {
    renderWithProviders(<Harness />);
    const dialog = await screen.findByRole('dialog', { name: 'bulgu.jpg' });
    expect(dialog).toHaveTextContent('1 / 3 · resim · 239.3 KB');
    const image = within(dialog).getByRole('img', { name: 'bulgu.jpg' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Yakınlaştır' }));
    expect(image.style.transform).toBe('scale(1.25)');
    fireEvent.keyDown(window, { key: '-' });
    fireEvent.keyDown(window, { key: '-' });
    expect(image.style.transform).toBe('scale(0.75)');
    fireEvent.keyDown(window, { key: '0' });
    expect(image.style.transform).toBe('scale(1)');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Sonraki dosya' }));
    expect(await screen.findByRole('dialog', { name: 'rapor.pdf' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(await screen.findByRole('dialog', { name: 'liste.xlsx' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(await screen.findByRole('dialog', { name: 'bulgu.jpg' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(await screen.findByRole('dialog', { name: 'liste.xlsx' })).toBeInTheDocument();
  });

  it('offers a download card for a type it cannot show', async () => {
    renderWithProviders(<Harness start={2} />);
    const dialog = await screen.findByRole('dialog', { name: 'liste.xlsx' });
    expect(dialog).toHaveTextContent('Bu dosya türü için önizleme yok.');
    expect(within(dialog).queryByRole('button', { name: 'Yakınlaştır' })).not.toBeInTheDocument();
    const [cardButton] = within(dialog).getAllByRole('button', { name: 'İndir' });
    fireEvent.click(cardButton!);
    await waitFor(() => expect(window.fetch).toHaveBeenCalledWith('https://files.test/liste.xlsx'));
  });

  it('Escape closes it', async () => {
    renderWithProviders(<Harness />);
    const dialog = await screen.findByRole('dialog', { name: 'bulgu.jpg' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
