import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQueries } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { statementCountQueryOptions } from '@/api/finance/hubs';
import { formatDate } from '@/lib/format';
import { MenuCards, type MenuCard, type PageFigure } from '@/ui';
import { countFigure, countValue } from '../hubCount';

const STATEMENTS = '/accounting/subcontracting-statements';
const STATEMENT_LIST = '/manufacturing/subcontracting/statements';

export function AccountingHubPage() {
  // Statements are drawn up for the month just closed; that is the one
  // accounting exports next.
  const month = dayjs().subtract(1, 'month');
  const period = { year: month.year(), month: month.month() + 1 };
  const monthName = formatDate(month.toDate(), { month: 'long', year: 'numeric' });
  const canExport = hasRouteAccess(STATEMENTS);
  const [approved, paid, submitted] = useQueries({
    queries: ['approved', 'paid', 'submitted'].map((status) => ({
      ...statementCountQueryOptions({ ...period, status }),
      enabled: canExport,
    })),
  });
  // The export takes approved and paid statements.
  const exportable = {
    data:
      approved!.data === undefined || paid!.data === undefined
        ? undefined
        : approved!.data + paid!.data,
    isError: approved!.isError || paid!.isError,
  };
  const exportLink = `${STATEMENTS}?year=${period.year}&month=${period.month}`;

  // Ported from accounting/accounting.js.
  const cards: MenuCard[] = [
    {
      title: 'Hakedişler',
      description: 'Seçilen yıl/ay için hakediş muhasebe çıktısını tablo olarak görüntüle.',
      icon: 'fas fa-file-invoice-dollar',
      iconColor: 'primary',
      link: exportLink,
      stat: { value: countValue(exportable), label: `hakediş (${monthName}) aktarıma hazır` },
    },
  ];

  const stats: PageFigure[] = canExport
    ? [
        countFigure(
          {
            id: 'statements-ready',
            label: `${monthName} · Aktarıma Hazır`,
            icon: 'fas fa-file-export',
            link: exportLink,
          },
          exportable,
        ),
        countFigure(
          {
            id: 'statements-submitted',
            label: `${monthName} · Onay Bekleyen`,
            icon: 'fas fa-hourglass-half',
            link: hasRouteAccess(STATEMENT_LIST)
              ? `${STATEMENT_LIST}?year=${period.year}&month=${period.month}&status=submitted`
              : exportLink,
          },
          submitted!,
        ),
      ]
    : [];

  return (
    <MenuCards
      title="Muhasebe Modülü"
      subtitle="Dışa aktarımlar ve muhasebe entegrasyonları"
      stats={stats}
      cards={cards}
    />
  );
}
