import { Button } from '@mantine/core';
import { createEvent, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { matchesAccept } from '../files';
import { notify } from '../notify';
import { FileDropInput } from './FileDropInput';
import { FileDropTarget } from './FileDropTarget';

function file(name: string, type = '') {
  return new File(['x'], name, { type });
}

function dataTransfer(files: File[]) {
  return { files, types: ['Files'], dropEffect: 'none' };
}

function dropOn(target: Element, files: File[]) {
  fireEvent.dragEnter(target, { dataTransfer: dataTransfer(files) });
  fireEvent.dragOver(target, { dataTransfer: dataTransfer(files) });
  fireEvent.drop(target, { dataTransfer: dataTransfer(files) });
}

function fileInput(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>('input[type="file"]')!;
}

beforeEach(() => {
  vi.spyOn(notify, 'warning').mockImplementation(() => '');
});
afterEach(() => vi.restoreAllMocks());

describe('matchesAccept', () => {
  it('matches extensions, mime wildcards and exact types', () => {
    expect(matchesAccept(file('Liste.XLSX'), '.xlsx,.xls')).toBe(true);
    expect(matchesAccept(file('foto.jpg', 'image/jpeg'), 'image/*')).toBe(true);
    expect(matchesAccept(file('rapor.pdf', 'application/pdf'), 'application/pdf')).toBe(true);
    expect(matchesAccept(file('virus.exe'), '.pdf, image/*')).toBe(false);
    expect(matchesAccept(file('her-şey.bin'), undefined)).toBe(true);
    expect(matchesAccept(file('her-şey.bin'), '')).toBe(true);
  });
});

describe('FileDropInput', () => {
  function Multi({ onChange }: { onChange: (files: File[]) => void }) {
    const [files, setFiles] = useState<File[]>([]);
    return (
      <FileDropInput
        label="Dosyalar"
        multiple
        value={files}
        onChange={(next) => {
          setFiles(next);
          onChange(next);
        }}
      />
    );
  }

  it('tells the user files can be dragged in', () => {
    renderWithProviders(<Multi onChange={() => {}} />);
    expect(
      screen.getByText('Dosyaları buraya sürükleyin veya seçmek için tıklayın'),
    ).toBeInTheDocument();
  });

  it('takes dropped files as its value and highlights while they are over it', () => {
    const onChange = vi.fn();
    renderWithProviders(<Multi onChange={onChange} />);
    const target = screen.getByTestId('file-drop-target');

    fireEvent.dragEnter(target, { dataTransfer: dataTransfer([file('a.pdf')]) });
    expect(target).toHaveAttribute('data-over');
    expect(screen.getByText('Dosyaları buraya bırakın')).toBeInTheDocument();

    fireEvent.drop(target, { dataTransfer: dataTransfer([file('a.pdf'), file('b.png')]) });
    expect(target).not.toHaveAttribute('data-over');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].map((f: File) => f.name)).toEqual(['a.pdf', 'b.png']);
    expect(screen.getByText('a.pdf, b.png')).toBeInTheDocument();
  });

  it('stops highlighting when the drag leaves', () => {
    renderWithProviders(<Multi onChange={() => {}} />);
    const target = screen.getByTestId('file-drop-target');
    fireEvent.dragEnter(target, { dataTransfer: dataTransfer([file('a.pdf')]) });
    fireEvent.dragLeave(target, { dataTransfer: dataTransfer([file('a.pdf')]) });
    expect(target).not.toHaveAttribute('data-over');
  });

  it('keeps click-to-pick working', () => {
    const onChange = vi.fn();
    const { container } = renderWithProviders(<Multi onChange={onChange} />);
    fireEvent.change(fileInput(container), { target: { files: [file('secilen.pdf')] } });
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ name: 'secilen.pdf' })]);
  });

  it('honours accept and single-file mode', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <FileDropInput accept=".xlsx,.xls,.csv" value={null} onChange={onChange} />,
    );
    dropOn(screen.getByTestId('file-drop-target'), [
      file('virus.exe'),
      file('liste.xlsx'),
      file('ikinci.csv'),
    ]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].name).toBe('liste.xlsx');
    expect(notify.warning).toHaveBeenCalledWith('Bu dosya türü kabul edilmiyor: virus.exe');
    expect(notify.warning).toHaveBeenCalledWith('Yalnızca bir dosya eklenebilir; ilk dosya alındı');
  });

  it('does nothing when every dropped file is refused', () => {
    const onChange = vi.fn();
    renderWithProviders(<FileDropInput accept="image/*" value={null} onChange={onChange} />);
    dropOn(screen.getByTestId('file-drop-target'), [file('rapor.pdf', 'application/pdf')]);
    expect(onChange).not.toHaveBeenCalled();
    expect(notify.warning).toHaveBeenCalledWith('Bu dosya türü kabul edilmiyor: rapor.pdf');
  });

  it('works uncontrolled too', () => {
    renderWithProviders(<FileDropInput label="Dosya" />);
    dropOn(screen.getByTestId('file-drop-target'), [file('tek.pdf')]);
    expect(screen.getByText('tek.pdf')).toBeInTheDocument();
  });

  it('ignores drops while disabled', () => {
    const onChange = vi.fn();
    renderWithProviders(<FileDropInput disabled value={null} onChange={onChange} />);
    const target = screen.getByTestId('file-drop-target');
    fireEvent.dragEnter(target, { dataTransfer: dataTransfer([file('a.pdf')]) });
    expect(target).not.toHaveAttribute('data-over');
    fireEvent.drop(target, { dataTransfer: dataTransfer([file('a.pdf')]) });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('FileDropTarget', () => {
  it('hands files dropped anywhere on the wrapped area to onFiles', () => {
    const onFiles = vi.fn();
    renderWithProviders(
      <FileDropTarget multiple onFiles={onFiles}>
        <Button>Dosya Seç</Button>
        <p>Henüz dosya eklenmedi</p>
      </FileDropTarget>,
    );
    dropOn(screen.getByText('Henüz dosya eklenmedi'), [file('a.pdf'), file('b.pdf')]);
    expect(onFiles).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'a.pdf' }),
      expect.objectContaining({ name: 'b.pdf' }),
    ]);
  });

  it('ignores drags that carry no files (text, reordering rows)', () => {
    const onFiles = vi.fn();
    renderWithProviders(
      <FileDropTarget onFiles={onFiles}>
        <span>alan</span>
      </FileDropTarget>,
    );
    const target = screen.getByTestId('file-drop-target');
    fireEvent.dragEnter(target, { dataTransfer: { files: [], types: ['text/plain'] } });
    expect(target).not.toHaveAttribute('data-over');
  });

  it('keeps a file dropped beside it from opening in the browser', () => {
    const { unmount } = renderWithProviders(
      <FileDropTarget onFiles={() => {}}>
        <span>alan</span>
      </FileDropTarget>,
    );
    const outside = () => {
      const event = createEvent.drop(document.body, {
        dataTransfer: dataTransfer([file('a.pdf')]),
      });
      fireEvent(document.body, event);
      return event.defaultPrevented;
    };
    expect(outside()).toBe(true);
    unmount();
    expect(outside()).toBe(false);
  });
});
