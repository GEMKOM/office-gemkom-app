import { ActionIcon, Badge, Button, Group, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useCallback, useMemo, useState } from 'react';
import {
  COMPONENT_LABELS,
  PERIOD_COMPONENTS,
  periodCostQueryOptions,
} from '@/api/accounting/periodCost';
import { formatCurrency } from '@/lib/format';
import {
  DataTable,
  errorMessage,
  FaIcon,
  notify,
  PageHeader,
  useUrlFilters,
  type DataTableColumn,
} from '@/ui';
import {
  filterRoots,
  flattenTree,
  lastClosedMonth,
  MONTH_RE,
  monthLabel,
  num,
  type FlatRow,
} from './periodCostRows';
import { ReconcileModal } from './ReconcileModal';

const euro = (value: number) => formatCurrency(value, 'EUR', 2);
const EXCEL_EUR = '#,##0.00 "€"';

function Money({ value, bold }: { value: string | number; bold?: boolean }) {
  const n = typeof value === 'number' ? value : num(value);
  if (!n)
    return (
      <Text span c="dimmed">
        -
      </Text>
    );
  return (
    <Text span fw={bold ? 700 : undefined} style={{ whiteSpace: 'nowrap' }}>
      {euro(n)}
    </Text>
  );
}

function TreeCell({
  row,
  expanded,
  onToggle,
}: {
  row: FlatRow;
  expanded: boolean;
  onToggle: (jobNo: string) => void;
}) {
  return (
    <Group gap={4} wrap="nowrap" style={{ paddingLeft: row.level * 18 }}>
      {row.hasChildren ? (
        <ActionIcon
          size="xs"
          variant="subtle"
          aria-expanded={expanded}
          aria-label={`${row.job_no} ${expanded ? 'daralt' : 'genişlet'}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(row.job_no);
          }}
        >
          <FaIcon icon={expanded ? 'fas fa-minus' : 'fas fa-plus'} />
        </ActionIcon>
      ) : (
        <span style={{ width: 18, display: 'inline-block' }} />
      )}
      <Text span size="sm" fw={row.level === 0 ? 600 : undefined}>
        {row.job_no}
      </Text>
    </Group>
  );
}

const URL_DEFAULTS = { start: '', end: '', search: '' };

/** Dönemsel iş maliyeti: per job, the cost incurred in a month range by component. */
export function PeriodCostPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const fallback = lastClosedMonth();
  const start = MONTH_RE.test(values.start) ? values.start : fallback;
  const end = MONTH_RE.test(values.end) && values.end >= start ? values.end : start;

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [reconcileJob, setReconcileJob] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const query = useQuery(periodCostQueryOptions(start, end));
  const report = query.data;

  const roots = useMemo(
    () => filterRoots(report?.rows ?? [], values.search),
    [report, values.search],
  );
  const rows = useMemo(() => flattenTree(roots, expanded), [roots, expanded]);

  const toggle = useCallback((jobNo: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(jobNo)) next.delete(jobNo);
      else next.add(jobNo);
      return next;
    });
  }, []);

  const columns = useMemo<DataTableColumn<FlatRow>[]>(
    () => [
      {
        key: 'job_no',
        header: 'İş No',
        render: (row) => (
          <TreeCell row={row} expanded={expanded.has(row.job_no)} onToggle={toggle} />
        ),
        exportValue: (row) => row.job_no,
      },
      {
        key: 'level',
        header: 'Seviye',
        exportOnly: true,
        exportValue: (row) => row.level,
      },
      {
        key: 'title',
        header: 'Başlık',
        maxWidth: 'clamp(160px, 18vw, 320px)',
        exportValue: (row) => row.title,
      },
      {
        key: 'customer_name',
        header: 'Müşteri',
        maxWidth: 160,
        hideBelow: 1400,
        exportValue: (row) => row.customer_name ?? '',
      },
      ...PERIOD_COMPONENTS.map((c): DataTableColumn<FlatRow> => ({
        key: c,
        header: COMPONENT_LABELS[c],
        align: 'right',
        render: (row) => <Money value={row.components[c]} />,
        exportValue: (row) => num(row.components[c]),
        exportFormat: EXCEL_EUR,
      })),
      {
        key: 'total',
        header: 'Toplam',
        align: 'right',
        render: (row) => (
          <Group gap={4} justify="flex-end" wrap="nowrap">
            {num(row.estimated) ? (
              <Tooltip
                label={`${euro(num(row.estimated))} tahmini ay: ilerleme kaydı olmayan iş, tamamlanma ayına (yoksa varsayılan aya) yazıldı.`}
                multiline
                w={260}
              >
                <Badge size="xs" variant="light" color="yellow">
                  tahmini
                </Badge>
              </Tooltip>
            ) : null}
            <Money value={row.total} bold />
          </Group>
        ),
        exportValue: (row) => num(row.total),
        exportFormat: EXCEL_EUR,
      },
      {
        key: 'estimated',
        header: 'Tahmini Ay Tutarı',
        exportOnly: true,
        exportValue: (row) => num(row.estimated),
        exportFormat: EXCEL_EUR,
      },
    ],
    [expanded, toggle],
  );

  const exportExcel = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const { exportToExcel } = await import('@/ui/DataTable/exportExcel');
      await exportToExcel(flattenTree(roots, 'all'), columns, {
        fileName: `donemsel-is-maliyeti-${start}_${end}`,
        sheetName: 'Dönemsel İş Maliyeti',
      });
    } catch (error) {
      notify.error(errorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const setRange = (nextStart: string, nextEnd: string) => {
    setExpanded(new Set());
    apply({ start: nextStart, end: nextEnd >= nextStart ? nextEnd : nextStart });
  };
  const thisYear = () => {
    const now = dayjs();
    const lastClosed = lastClosedMonth(now);
    const january = `${now.year()}-01`;
    setRange(january > lastClosed ? lastClosed : january, lastClosed);
  };

  const totals = report?.totals;
  const estimatedTotal = useMemo(
    () => (report?.rows ?? []).reduce((sum, r) => sum + num(r.estimated), 0),
    [report],
  );
  // The footer sums the roots on screen, so a search narrows it too.
  const footerSums = useMemo(() => {
    const sums: Record<string, number> = { total: 0 };
    for (const c of PERIOD_COMPONENTS) sums[c] = 0;
    for (const root of roots) {
      sums.total! += num(root.total);
      for (const c of PERIOD_COMPONENTS) sums[c]! += num(root.components[c]);
    }
    return sums;
  }, [roots]);
  const periodText =
    start === end ? monthLabel(start) : `${monthLabel(start)} – ${monthLabel(end)}`;

  return (
    <>
      <PageHeader
        title="Dönemsel İş Maliyeti"
        subtitle={`${periodText} içinde oluşan maliyet, iş emri ve kalem bazında (EUR)`}
        icon="calendar-alt"
        backTo="/accounting/"
        stats={[
          {
            id: 'period-total',
            label: 'Dönem Toplamı',
            value: totals ? euro(num(totals.total)) : '–',
          },
          {
            id: 'period-jobs',
            label: 'İş Emri',
            value: report ? report.rows.length.toLocaleString('tr-TR') : '–',
          },
          {
            id: 'period-estimated',
            label: 'Tahmini Aya Yazılan',
            value: report ? euro(estimatedTotal) : '–',
          },
        ]}
      />

      <DataTable
        title="İş Emirleri"
        icon="fas fa-table"
        filters={
          <Group gap="xs" wrap="wrap" align="center">
            <MonthPickerInput
              aria-label="Başlangıç ayı"
              size="xs"
              w={150}
              valueFormat="MMMM YYYY"
              value={`${start}-01`}
              onChange={(next) => next && setRange(next.slice(0, 7), end)}
            />
            <Text size="sm" c="dimmed">
              –
            </Text>
            <MonthPickerInput
              aria-label="Bitiş ayı"
              size="xs"
              w={150}
              valueFormat="MMMM YYYY"
              value={`${end}-01`}
              minDate={`${start}-01`}
              onChange={(next) => next && setRange(start, next.slice(0, 7))}
            />
            <Button
              size="xs"
              variant="default"
              onClick={() => setRange(lastClosedMonth(), lastClosedMonth())}
            >
              Geçen Ay
            </Button>
            <Button size="xs" variant="default" onClick={thisYear}>
              Bu Yıl
            </Button>
            <TextInput
              size="xs"
              w={200}
              aria-label="Ara"
              placeholder="İş no / başlık / müşteri"
              leftSection={<FaIcon icon="fas fa-search" />}
              defaultValue={values.search}
              onChange={(e) => apply({ search: e.currentTarget.value })}
            />
          </Group>
        }
        toolbar={
          <Button
            size="xs"
            variant="default"
            onClick={() => void exportExcel()}
            loading={exporting}
            disabled={!report || query.isFetching}
            leftSection={<FaIcon icon="fas fa-file-excel" />}
          >
            Excel
          </Button>
        }
        data={rows}
        columns={columns}
        getRowId={(row) => row.job_no}
        loading={query.isFetching}
        sortable={false}
        stickyHeader
        rowActions={(row) => [
          {
            key: 'reconcile',
            label: 'Mutabakat',
            icon: 'fas fa-balance-scale',
            onClick: () => setReconcileJob(row.job_no),
          },
        ]}
        rowStyle={(row) =>
          row.level > 0 ? { background: 'var(--mantine-color-gray-0)' } : undefined
        }
        emptyMessage={
          query.isError ? errorMessage(query.error) : 'Bu dönemde maliyet oluşan iş emri yok.'
        }
        footer={({ columns: shown }) =>
          !roots.length ? null : (
            <Table.Tr data-testid="period-footer">
              {shown.map((col) => {
                if (col.key === 'job_no') return <Table.Th key={col.key}>Toplam</Table.Th>;
                if (col.key in footerSums)
                  return (
                    <Table.Th key={col.key} style={{ textAlign: 'right' }}>
                      <Money value={footerSums[col.key]!} bold={col.key === 'total'} />
                    </Table.Th>
                  );
                return <Table.Th key={col.key} />;
              })}
              <Table.Th />
            </Table.Tr>
          )
        }
      />

      <ReconcileModal jobNo={reconcileJob} onClose={() => setReconcileJob(null)} />
    </>
  );
}
