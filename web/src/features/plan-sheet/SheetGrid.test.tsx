import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { theme } from '@/theme';
import { SHEET } from './fixtures.test-data';
import { SheetGrid, type SheetGridProps } from './SheetGrid';

type Props = Partial<SheetGridProps>;

function Harness(props: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  return (
    <SheetGrid
      sheet={SHEET}
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
      zoom="week"
      hostWidth={1800}
      today={new Date(2026, 8, 1)}
      {...props}
    />
  );
}

function renderGrid(props: Props = {}) {
  const view = render(
    <MantineProvider theme={theme}>
      <Harness {...props} />
    </MantineProvider>,
  );
  const row = (key: string) => view.container.querySelector<HTMLElement>(`[data-row="${key}"]`);
  const cell = (key: string, field: string) => row(key)!.querySelector<HTMLElement>(`[data-field="${field}"]`)!;
  return { ...view, row, cell };
}

describe('SheetGrid', () => {
  it('draws the jobs, their tasks and every column', () => {
    const { row, cell } = renderGrid();
    expect(screen.getAllByText(/^(Görev|Plan başl\.|Plan bitiş|Süre|İlerleme|Durum|Sapma|Öngörülen|Neden)$/)).toHaveLength(9);
    expect(row('job-009-37')).toHaveAttribute('data-kind', 'group');
    expect(cell('task:1', 'title')).toHaveTextContent('Dizayn · KAZAN');
    expect(cell('task:1', 'deviation')).toHaveTextContent('+5');
    expect(cell('task:2', 'deviation')).toHaveTextContent('+13 zincir');
    expect(cell('task:1', 'progress')).toHaveTextContent('%20 / %60');
    expect(cell('task:1', 'status')).toHaveTextContent('Devam Ediyor');
    expect(cell('task:2', 'title')).toHaveTextContent('varsayılan süre');
    expect(row('task:2')).toHaveAttribute('data-chain', 'true');
    expect(row('task:4')).toHaveAttribute('data-dead', 'true');
    expect(cell('task:4', 'progress')).toHaveTextContent('—');
    // The termin pill after the job's projected end.
    expect(row('job-009-37')).toHaveTextContent('+25g');
  });

  it('shows only the chosen columns, Görev always', () => {
    const { row } = renderGrid({ columns: ['cause'] });
    expect(row('task:1')!.querySelectorAll('[data-field]')).toHaveLength(2);
  });

  it('folds a job with its sub-jobs, and folds or opens every job from the header', () => {
    const { row } = renderGrid();
    fireEvent.click(row('job-009-37')!.querySelector('button')!);
    expect(row('task:1')).toBeNull();
    expect(row('job-009-37-01')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tümünü kapat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tümünü aç' }));
    expect(row('task:1')).not.toBeNull();
    expect(row('job-009-37-01')).not.toBeNull();
  });

  it('is read-only without onEdit', () => {
    const { cell } = renderGrid();
    fireEvent.click(cell('task:1', 'progress'));
    expect(cell('task:1', 'progress').querySelector('input')).toBeNull();
  });

  it('edits a cell on an editable link and hands over the override field', async () => {
    const onEdit = vi.fn();
    const { cell } = renderGrid({ onEdit, overrides: {} });
    fireEvent.click(cell('task:1', 'progress'));
    const input = cell('task:1', 'progress').querySelector('input')!;
    expect(input).toHaveValue(20);
    fireEvent.change(input, { target: { value: '55' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ key: 'task:1' }), 'progress', '55');

    // A job row's Görev cell edits the job's name, not its number.
    fireEvent.click(cell('job-009-37', 'title'));
    const name = cell('job-009-37', 'title').querySelector('input')!;
    expect(name).toHaveValue('Kazan Gövdesi');
    fireEvent.change(name, { target: { value: 'Yeni ad' } });
    fireEvent.blur(name);
    expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'job-009-37' }), 'job_title', 'Yeni ad');
  });

  it('cancels on Escape and refuses a date that does not exist', () => {
    const onEdit = vi.fn();
    const onEditError = vi.fn();
    const { cell } = renderGrid({ onEdit, onEditError, overrides: {} });
    fireEvent.click(cell('task:1', 'plan_end'));
    let input = cell('task:1', 'plan_end').querySelector('input')!;
    expect(input).toHaveValue('15.07.2026');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(cell('task:1', 'plan_end').querySelector('input')).toBeNull();

    fireEvent.click(cell('task:1', 'plan_end'));
    input = cell('task:1', 'plan_end').querySelector('input')!;
    fireEvent.change(input, { target: { value: '31.04.2026' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onEdit).not.toHaveBeenCalled();
    expect(onEditError).toHaveBeenCalledWith(new Error('Geçerli bir tarih girin (gg.aa.yyyy).'));

    fireEvent.click(cell('task:1', 'plan_end'));
    input = cell('task:1', 'plan_end').querySelector('input')!;
    fireEvent.change(input, { target: { value: '20072026' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onEdit).toHaveBeenCalledWith(expect.anything(), 'plan_end', '2026-07-20');
  });

  it('marks an edited cell and shows the edited value', () => {
    const { cell } = renderGrid({ onEdit: vi.fn(), overrides: { 'task:1': { deviation: -2 } } });
    expect(cell('task:1', 'deviation')).toHaveTextContent('−2');
    expect(cell('task:1', 'deviation').querySelector('[title="Bu bağlantıda değiştirildi"]')).not.toBeNull();
    expect(cell('task:1', 'progress').querySelector('[title="Bu bağlantıda değiştirildi"]')).toBeNull();
  });

  it('picks a status from the list and keeps an unlisted current one', () => {
    const onEdit = vi.fn();
    const { cell } = renderGrid({ onEdit, overrides: {} });
    fireEvent.click(cell('job-009-37', 'status'));
    const select = cell('job-009-37', 'status').querySelector('select')!;
    expect(select).toHaveValue('active');
    fireEvent.change(select, { target: { value: 'completed' } });
    expect(onEdit).toHaveBeenCalledWith(expect.anything(), 'status', 'completed');
  });
});
