import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { AttentionPanel, BreakdownPanel, RecordsPanel, type AttentionItem } from './HubPanels';

const settled = <T,>(data: T) => ({ data, isPending: false, isError: false });

describe('RecordsPanel', () => {
  it('links each row and the Tümü button', () => {
    renderWithProviders(
      <RecordsPanel
        title="Son Talepler"
        icon="fas fa-list"
        more="/x/list?status=open"
        noun="Talepler"
        empty="Talep yok."
        query={settled([
          {
            key: 1,
            code: 'DT-1',
            title: 'Boya',
            subtitle: 'Ali',
            status: { label: 'Bekliyor', color: 'yellow' as const },
            meta: '3 Kas',
            link: '/x/list?id=1',
            alert: true,
          },
        ])}
      />,
    );
    const panel = screen.getByRole('heading', { name: 'Son Talepler' }).closest('section')!;
    expect(within(panel).getByRole('link', { name: /DT-1/ })).toHaveAttribute(
      'href',
      '/x/list?id=1',
    );
    expect(within(panel).getByRole('link', { name: /Tümü/ })).toHaveAttribute(
      'href',
      '/x/list?status=open',
    );
    expect(within(panel).getByText('3 Kas')).toHaveAttribute('data-alert', 'true');
  });

  it('says when there is nothing, and offers a retry on failure', () => {
    const refetch = vi.fn();
    const { rerender } = renderWithProviders(
      <RecordsPanel
        title="Son"
        icon="fas fa-list"
        noun="Talepler"
        empty="Talep yok."
        query={settled([])}
      />,
    );
    expect(screen.getByText('Talep yok.')).toBeInTheDocument();

    rerender(
      <RecordsPanel
        title="Son"
        icon="fas fa-list"
        noun="Talepler"
        empty="Talep yok."
        query={{ data: undefined, isPending: false, isError: true, refetch }}
      />,
    );
    expect(screen.getByText(/Talepler yüklenemedi/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yeniden Dene' }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('AttentionPanel', () => {
  const item = (id: string, data: number | undefined, isError = false): AttentionItem => ({
    id,
    label: `Satır ${id}`,
    icon: 'fas fa-clock',
    color: 'yellow',
    link: `/list/${id}`,
    count: { data, isError },
  });

  it('greys rows with nothing waiting and keeps them in place', () => {
    renderWithProviders(
      <AttentionPanel items={[item('a', 3), item('b', 0), item('c', undefined, true)]} />,
    );
    const a = screen.getByRole('link', { name: /Satır a/ });
    expect(a).toHaveAttribute('href', '/list/a');
    expect(a).toHaveAttribute('data-family', 'yellow');
    expect(a).toHaveTextContent('3');
    expect(screen.getByRole('link', { name: /Satır b/ })).toHaveAttribute('data-idle', 'true');
    expect(screen.getByRole('link', { name: /Satır c/ })).toHaveTextContent('-');
    expect(screen.queryByText('Bekleyen bir iş yok')).not.toBeInTheDocument();
  });

  it('says so once every count is in and none is waiting', () => {
    renderWithProviders(<AttentionPanel items={[item('a', 0), item('b', 0)]} />);
    expect(screen.getByText('Bekleyen bir iş yok')).toBeInTheDocument();
  });

  it('draws nothing without items', () => {
    renderWithProviders(<AttentionPanel items={[]} />);
    expect(screen.queryByRole('heading')).toBeNull();
  });
});

describe('BreakdownPanel', () => {
  it('draws each row against the total and links it', () => {
    renderWithProviders(
      <BreakdownPanel
        title="Durum"
        icon="fas fa-filter"
        rows={[
          { key: 'a', label: 'Bekliyor', color: 'yellow', count: 3, link: '/l?status=a' },
          { key: 'b', label: 'Devam', color: 'blue', count: 1 },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: /Bekliyor/ })).toHaveAttribute('href', '/l?status=a');
    const bars = document.querySelectorAll('[data-family] > span');
    expect((bars[0] as HTMLElement).style.width).toBe('75%');
    expect((bars[1] as HTMLElement).style.width).toBe('25%');
  });
});
