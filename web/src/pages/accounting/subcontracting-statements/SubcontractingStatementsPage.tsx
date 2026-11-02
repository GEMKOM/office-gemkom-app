import { Button, Group, Select, Table, Text, TextInput } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { isApiError } from '@/api/client';
import { accountingExportQueryOptions } from '@/api/accounting/subcontractingStatements';
import { DataTable, FaIcon, PageHeader, useUrlFilters, type DataTableColumn } from '@/ui';
import {
  cellFormatters,
  COLUMN_SCHEMA,
  columnSums,
  formatTrNumber,
  mapRowToSchema,
  pad2,
  parseLocaleNumber,
  TURKISH_MONTHS,
  type StatementRow,
} from './statementRows';

const MONTH_OPTIONS = TURKISH_MONTHS.map((label, i) => ({ value: String(i + 1), label }));
const EMPTY_ROWS: StatementRow[] = [];

// The loaded year/month live in the URL, so a reload shows the same month.
// Without them nothing loads until Yükle, as on the legacy page.
const URL_DEFAULTS = { year: '', month: '' };

function cellValueForExport(
  field: string,
  numeric: boolean | undefined,
  row: StatementRow,
): unknown {
  if (numeric) return parseLocaleNumber(row[field]);
  const v = row[field];
  return v === null || v === undefined ? '' : v;
}

/** Export layout: the schema labels as headers, numbers kept numeric for Excel SUM. */
const exportColumns: DataTableColumn<StatementRow>[] = COLUMN_SCHEMA.map((col) => ({
  key: col.field,
  header: col.label,
  exportValue: (row) => cellValueForExport(col.field, col.numeric, row),
  exportFormat: col.numeric ? '#,##0.00' : undefined,
}));

/** Legacy fetchAsJson error text: `HTTP <status> - <detail>`. */
function loadErrorText(error: unknown): string {
  if (isApiError(error)) {
    const data = error.data;
    let detail: string;
    if (data && typeof data === 'object') {
      const body = data as Record<string, unknown>;
      detail = String(body.detail || body.message || JSON.stringify(data));
    } else {
      detail = data === undefined ? '' : String(data);
    }
    return `HTTP ${error.status} - ${detail}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function validYear(year: number) {
  return Number.isFinite(year) && year >= 2000 && year <= 2100;
}
function validMonth(month: number) {
  return Number.isFinite(month) && month >= 1 && month <= 12;
}

/** Port of accounting/subcontracting-statements (subcontracting-statements.js). */
export function SubcontractingStatementsPage() {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const loadedYear = Number(values.year);
  const loadedMonth = Number(values.month);
  const hasLoad =
    values.year !== '' && values.month !== '' && validYear(loadedYear) && validMonth(loadedMonth);

  const now = new Date();
  const [yearInput, setYearInput] = useState(() => values.year || String(now.getFullYear()));
  const [monthInput, setMonthInput] = useState(() => values.month || String(now.getMonth() + 1));
  // Validation and download messages; otherwise the status follows the load.
  const [message, setMessage] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const query = useQuery({
    ...accountingExportQueryOptions(loadedYear, loadedMonth),
    enabled: hasLoad,
  });
  const rows = useMemo(
    () => (hasLoad && query.data && !query.isError ? query.data.map(mapRowToSchema) : EMPTY_ROWS),
    [hasLoad, query.data, query.isError],
  );

  const columns = useMemo<DataTableColumn<StatementRow>[]>(() => {
    const formatters = cellFormatters(rows);
    return COLUMN_SCHEMA.map((col) => ({
      key: col.field,
      header: col.label,
      sortable: true,
      align: col.numeric ? 'right' : undefined,
      accessor: col.numeric ? (row: StatementRow) => parseLocaleNumber(row[col.field]) : col.field,
      render: (row: StatementRow) => formatters[col.field]!(row[col.field]),
    }));
  }, [rows]);

  const loading = hasLoad && query.isFetching;
  const loadStatus = !hasLoad
    ? ''
    : query.isFetching
      ? 'Yükleniyor...'
      : query.isError
        ? loadErrorText(query.error)
        : query.isSuccess
          ? `Yüklendi (${rows.length} satır)`
          : '';
  const status = message ?? loadStatus;

  const load = () => {
    const year = Number(yearInput);
    const month = Number(monthInput);
    if (!validYear(year)) {
      setMessage('Geçersiz yıl');
      return;
    }
    if (!validMonth(month)) {
      setMessage('Geçersiz ay');
      return;
    }
    setMessage(null);
    if (year === loadedYear && month === loadedMonth && hasLoad) void query.refetch();
    else apply({ year: String(year), month: String(month) });
  };

  const download = async () => {
    const year = Number(yearInput);
    const month = Number(monthInput);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return;
    setMessage('İndiriliyor...');
    setDownloading(true);
    try {
      // The rows of the chosen month (cached when that month is on screen).
      const payload = await queryClient.fetchQuery(accountingExportQueryOptions(year, month));
      const mapped = payload.map(mapRowToSchema);
      const { exportToExcel } = await import('@/ui/DataTable/exportExcel');
      await exportToExcel(mapped, exportColumns, {
        fileName: `subcontracting-statements-${year}-${pad2(month)}`,
        sheetName: 'Hakedişler',
      });
      setMessage('İndirme başlatıldı');
    } catch (error) {
      setMessage(loadErrorText(error));
    } finally {
      setDownloading(false);
    }
  };

  const sums = useMemo(() => columnSums(rows), [rows]);
  const figure = (value: string) => (hasLoad && query.isSuccess ? value : '–');

  return (
    <>
      <PageHeader
        title="Hakedişler"
        subtitle="Yıl/Ay seçip sonucu tablo olarak görüntüleyin"
        icon="file-invoice-dollar"
        backTo="/accounting/"
        stats={[
          { id: 'rows-count', label: 'Satır', value: figure(rows.length.toLocaleString('tr-TR')) },
          { id: 'amount-total', label: 'Tutar', value: figure(formatTrNumber(sums.amount ?? 0)) },
        ]}
      />

      <DataTable
        title="Sonuç"
        icon="fas fa-table"
        filters={
          <Group gap="xs" wrap="wrap" align="center">
            <Text size="sm" c="dimmed" component="label" htmlFor="year-input">
              Yıl
            </Text>
            <TextInput
              id="year-input"
              size="xs"
              w={90}
              type="number"
              min={2000}
              max={2100}
              step={1}
              value={yearInput}
              onChange={(e) => setYearInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') load();
              }}
            />
            <Select
              size="xs"
              w={120}
              aria-label="Ay"
              data={MONTH_OPTIONS}
              value={monthInput}
              onChange={(next) => setMonthInput(next ?? '')}
              allowDeselect={false}
              searchable={false}
            />
            <Button
              size="xs"
              onClick={load}
              disabled={loading || downloading}
              leftSection={<FaIcon icon="fas fa-sync-alt" />}
            >
              Yükle
            </Button>
            {status ? (
              <Text size="xs" c="dimmed" data-testid="status-text">
                {status}
              </Text>
            ) : null}
          </Group>
        }
        toolbar={
          <Button
            size="xs"
            variant="default"
            onClick={() => void download()}
            loading={downloading}
            disabled={loading}
            leftSection={<FaIcon icon="fas fa-download" />}
          >
            Dosya Olarak İndir
          </Button>
        }
        data={rows}
        columns={columns}
        getRowId={(_row, index) => String(index)}
        loading={loading}
        emptyMessage='Henüz veri yok. Yıl/Ay seçip "Yükle" tıklayın.'
        footer={({ allRows }) =>
          allRows.length === 0 ? null : (
            <Table.Tr>
              {COLUMN_SCHEMA.map((col) =>
                col.field === 's' ? (
                  <Table.Th key={col.field}>Toplam</Table.Th>
                ) : col.footerSum ? (
                  <Table.Th key={col.field} style={{ textAlign: 'right' }}>
                    {formatTrNumber(columnSums(allRows)[col.field] ?? 0)}
                  </Table.Th>
                ) : (
                  <Table.Th key={col.field} />
                ),
              )}
            </Table.Tr>
          )
        }
      />
    </>
  );
}
