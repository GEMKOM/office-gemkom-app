import { Button, Group, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  fetchProcurementLines,
  fetchProcurementLinesPreview,
  useSubmitProcurementLines,
} from '@/api/planning/procurementLines';
import {
  DataTable,
  FaIcon,
  FileDropInput,
  FormModal,
  notify,
  type CellEdit,
  type CellValue,
  type DataTableColumn,
  type RowAction,
} from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import {
  applyExcelToLine,
  compareStats,
  emptyLine,
  excelDiff,
  excelMatchFor,
  formatCompareNumber,
  formatPriceDate,
  formatPriceSource,
  fromPreviewLines,
  fromSavedLines,
  isFieldChanged,
  isLineChanged,
  lineAmount,
  linesForSubmit,
  numberText,
  readExcelCompare,
  restoreLine,
  withSnapshots,
  type EditLine,
  type ExcelCompare,
} from './lines';

export interface ProcurementLinesModalProps {
  jobNo: string;
  /** Önizle: start from the preview even when lines are saved. */
  usePreview?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** Saved lines, or the preview when there are none (or when asked for it). */
async function loadLines(jobNo: string, usePreview: boolean): Promise<EditLine[]> {
  if (!usePreview) {
    const saved = await fetchProcurementLines(jobNo);
    if (saved.length > 0) return withSnapshots(fromSavedLines(saved));
  }
  return withSnapshots(fromPreviewLines(await fetchProcurementLinesPreview(jobNo)));
}

const muted = (text: string) => (
  <Text span size="sm" c="dimmed">
    {text}
  </Text>
);

const danger = { color: 'var(--gk-danger)', fontWeight: 600 } as const;

/** '12.5' as 12,5; junk stays as typed. */
function showNumber(value: string): string {
  if (value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('tr-TR', { maximumFractionDigits: 6 }) : value;
}

/**
 * Port of the procurement lines modal in procurement-lines.js: every line of a
 * job order, edited in place (DataTable inline editing), compared with a
 * purchasing Excel export and saved in one submit (the backend replaces them).
 */
export function ProcurementLinesModal({
  jobNo,
  usePreview = false,
  onClose,
  onSaved,
}: ProcurementLinesModalProps) {
  const query = useQuery({
    // Outside the procurementLines key: a save's invalidation must not reload the editor.
    queryKey: ['procurementLinesEditor', jobNo, usePreview],
    queryFn: () => loadLines(jobNo, usePreview),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const submit = useSubmitProcurementLines();

  // What the user changed; until then the editor shows what was loaded.
  const [edited, setEdited] = useState<EditLine[] | null>(null);
  const initial = query.isSuccess ? query.data : query.isError ? [] : null;
  const lines = edited ?? initial;
  const loading = lines === null;
  const rows = useMemo(() => lines ?? [], [lines]);

  useEffect(() => {
    if (!query.isError) return;
    console.error(query.error);
    notify.error(query.error, { fallback: 'Satırlar yüklenemedi' });
  }, [query.isError, query.error]);

  const change = (fn: (current: EditLine[]) => EditLine[]) =>
    setEdited((prev) => fn(prev ?? initial ?? []));

  // ---- Excel compare ----
  const [file, setFile] = useState<File | null>(null);
  const [compare, setCompare] = useState<ExcelCompare | null>(null);
  const stats = useMemo(() => compareStats(compare, rows), [compare, rows]);

  const runCompare = async () => {
    if (!file) {
      notify.warning('Lütfen önce bir Excel dosyası seçin.');
      return;
    }
    try {
      const next = await readExcelCompare(file);
      if (next.rows.length === 0) {
        notify.warning('Excel dosyasında karşılaştırılacak satır bulunamadı.');
        return;
      }
      setCompare(next);
    } catch (error) {
      console.error(error);
      notify.error(error, { fallback: 'Excel dosyası okunamadı.' });
    }
  };
  const clearCompare = () => {
    setCompare(null);
    setFile(null);
  };

  const applyExcel = (key: string) => {
    const line = rows.find((l) => l.key === key);
    const match = line ? excelMatchFor(compare, line) : null;
    if (!line || !match) return;
    const next = applyExcelToLine(line, match);
    if (!next) {
      notify.warning('Excel değerleri uygulanamadı (miktar 0).');
      return;
    }
    change((current) => current.map((l) => (l.key === key ? next : l)));
  };
  const applyExcelAll = () => {
    if (!compare) return;
    let applied = 0;
    const next = rows.map((line) => {
      const match = excelMatchFor(compare, line);
      const updated = match ? applyExcelToLine(line, match) : null;
      if (updated) applied++;
      return updated ?? line;
    });
    change(() => next);
    if (applied > 0) notify.success(`${applied} satıra Excel değerleri uygulandı.`);
    else notify.info('Uygulanacak fark bulunamadı.');
  };

  // ---- rows ----
  const addLine = () => change((current) => [...current, emptyLine(current.length)]);
  const removeLine = (key: string) =>
    change((current) =>
      current.filter((l) => l.key !== key).map((line, i) => ({ ...line, order: i })),
    );
  const revertLine = (key: string) =>
    change((current) => current.map((l) => (l.key === key ? restoreLine(l) : l)));
  const revertAll = () => {
    const reverted = rows.filter(isLineChanged).length;
    change((current) => current.map((l) => (isLineChanged(l) ? restoreLine(l) : l)));
    if (reverted > 0) notify.success(`${reverted} satır ilk haline döndürüldü.`);
  };

  const onCellEdit = ({ rowId, columnKey, value }: CellEdit<EditLine>) => {
    const text =
      columnKey === 'item_description' ? String(value ?? '') : numberText(value as number | null);
    change((current) =>
      current.map((line) => (line.key === rowId ? { ...line, [columnKey]: text } : line)),
    );
  };

  const anyChanged = rows.some(isLineChanged);
  const total = rows.reduce((sum, line) => sum + lineAmount(line), 0);

  // The columns only change with the compare; Uygula reaches the latest rows through context.
  const columns = useMemo(() => buildColumns(compare), [compare]);

  const rowActions = (line: EditLine): RowAction<EditLine>[] => [
    {
      key: 'revert',
      label: 'Satırı ilk haline döndür',
      icon: 'fas fa-undo',
      color: 'warning',
      hidden: !isLineChanged(line),
      onClick: (row) => revertLine(row.key),
    },
    {
      key: 'remove',
      label: 'Satırı sil',
      icon: 'fas fa-trash',
      color: 'danger',
      onClick: (row) => removeLine(row.key),
    },
  ];

  const save = async () => {
    if (loading) return;
    try {
      await submit.mutateAsync({ jobNo, lines: linesForSubmit(rows) });
      notify.success('Satırlar kaydedildi.');
      // Legacy re-reads the persisted lines (never the preview); they become the revert baseline.
      const refreshed = await fetchProcurementLines(jobNo);
      setEdited(withSnapshots(fromSavedLines(refreshed)));
      onSaved();
    } catch (error) {
      console.error(error);
      notify.error(error, { fallback: 'Kaydetme başarısız' });
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={`Malzeme Maliyeti Satırları — ${jobNo}`}
      icon="fas fa-list"
      size={1140}
      cancelLabel="Kapat"
      submitting={submit.isPending}
      submitDisabled={loading}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Stack gap="xs">
        <Group justify="space-between" gap="xs" wrap="wrap">
          <Group gap="xs">
            <Button
              size="xs"
              leftSection={<FaIcon icon="fas fa-plus" />}
              disabled={loading}
              onClick={addLine}
            >
              Satır Ekle
            </Button>
            {anyChanged ? (
              <Button
                size="xs"
                variant="outline"
                color="orange"
                leftSection={<FaIcon icon="fas fa-undo" />}
                onClick={revertAll}
              >
                Değişiklikleri Geri Al
              </Button>
            ) : null}
          </Group>
          <Group gap="xs" wrap="wrap">
            <FileDropInput
              size="xs"
              w={240}
              accept=".xls,.xlsx"
              placeholder="Excel dosyası seçin"
              aria-label="Excel dosyası"
              clearable
              value={file}
              onChange={setFile}
            />
            <Button
              size="xs"
              variant="outline"
              leftSection={<FaIcon icon="fas fa-file-excel" />}
              disabled={loading}
              onClick={() => void runCompare()}
            >
              Excel ile Karşılaştır
            </Button>
            {compare && stats.mismatched > 0 ? (
              <Button
                size="xs"
                color="red"
                leftSection={<FaIcon icon="fas fa-check-double" />}
                onClick={applyExcelAll}
              >
                Tümünü Uygula
              </Button>
            ) : null}
            {compare ? (
              <Button
                size="xs"
                variant="default"
                leftSection={<FaIcon icon="fas fa-times" />}
                onClick={clearCompare}
              >
                Karşılaştırmayı Kaldır
              </Button>
            ) : null}
          </Group>
          {loading ? null : (
            <Text size="sm" c="dimmed" data-testid="lines-summary">
              {`Toplam: ${rows.length} satır, Toplam tutar: ${total.toFixed(2)} EUR`}
            </Text>
          )}
        </Group>

        {compare ? (
          <Group gap="md" data-testid="compare-info">
            <Text size="sm">
              <FaIcon icon="fas fa-file-excel" color="var(--mantine-color-green-7)" />{' '}
              {compare.fileName}
            </Text>
            <Text size="sm" c="green.8">{`${stats.matched} satır eşleşti`}</Text>
            {stats.mismatched > 0 ? (
              <Text size="sm" c="red.8" fw={600}>
                {`${stats.mismatched} satırda tutar farkı`}
              </Text>
            ) : null}
            {stats.unmatchedLines > 0 ? (
              <Text size="sm" c="yellow.9">
                {`${stats.unmatchedLines} satır Excel'de bulunamadı`}
              </Text>
            ) : null}
            {stats.unmatchedExcelRows.length > 0 ? (
              <Text size="sm" c="dimmed" w="100%">
                {`Excel'de olup tabloda eşleşmeyen ${stats.unmatchedExcelRows.length} satır: ${stats.unmatchedExcelRows
                  .map((r) => r.rawCode || r.code)
                  .join(', ')}`}
              </Text>
            ) : null}
          </Group>
        ) : null}

        <ApplyExcelContext.Provider value={applyExcel}>
          <DataTable
            data={rows}
            columns={columns}
            getRowId={(row) => row.key}
            loading={loading}
            onCellEdit={onCellEdit}
            isCellDirty={isFieldChanged}
            rowActions={rowActions}
            actionsHeader=""
            rowStyle={(line) => {
              const match = excelMatchFor(compare, line);
              if (!match) return undefined;
              return {
                backgroundColor: excelDiff(line, match).amountMismatch
                  ? 'var(--mantine-color-red-light)'
                  : 'var(--mantine-color-green-light)',
              };
            }}
            extraData={compare}
            withColumnBorders
            emptyMessage={loading ? 'Yükleniyor...' : 'Satır yok'}
          />
        </ApplyExcelContext.Provider>
      </Stack>
    </FormModal>
  );
}

const ApplyExcelContext = createContext<(key: string) => void>(() => {});

/** Uygula: take the differing values of one line from Excel. */
function ApplyExcelButton({ lineKey }: { lineKey: string }) {
  const applyExcel = useContext(ApplyExcelContext);
  return (
    <Button
      size="compact-xs"
      variant="outline"
      color="red"
      title="Farklı olan değerleri Excel'den al"
      onClick={(event) => {
        event.stopPropagation();
        applyExcel(lineKey);
      }}
    >
      Uygula
    </Button>
  );
}

function buildColumns(compare: ExcelCompare | null): DataTableColumn<EditLine>[] {
  const diffOf = (line: EditLine) => {
    const match = excelMatchFor(compare, line);
    return match ? { match, diff: excelDiff(line, match) } : null;
  };
  const numberEditor = (field: 'quantity' | 'unit_price') => ({
    type: 'number' as const,
    placeholder: '0',
    apply: (row: EditLine, value: CellValue) => ({
      ...row,
      [field]: numberText(value as number | null),
    }),
  });

  const columns: DataTableColumn<EditLine>[] = [
    {
      key: 'item_code',
      header: 'Malzeme Kodu',
      render: (line) => <span className={uiClasses.code}>{line.item_code || '–'}</span>,
    },
    { key: 'item_name', header: 'Malzeme Adı', render: (line) => muted(line.item_name || '–') },
    {
      key: 'item_description',
      header: 'Açıklama',
      editable: { type: 'text', placeholder: 'Açıklama' },
      render: (line) => line.item_description || muted('Açıklama'),
    },
    {
      key: 'quantity',
      header: 'Miktar',
      width: 130,
      editable: numberEditor('quantity'),
      render: (line) => {
        const bad = diffOf(line)?.diff.qtyDiffers;
        return (
          <>
            <span style={bad ? danger : undefined}>{showNumber(line.quantity) || '0'}</span>{' '}
            {muted(line.item_unit || '–')}
          </>
        );
      },
    },
    {
      key: 'unit_price',
      header: 'Birim Fiyat (EUR)',
      width: 120,
      align: 'right',
      editable: numberEditor('unit_price'),
      render: (line) => {
        const found = diffOf(line);
        const bad =
          found &&
          (found.diff.unitDiffers || (found.diff.amountMismatch && found.match.unitPrice == null));
        return <span style={bad ? danger : undefined}>{showNumber(line.unit_price) || '0'}</span>;
      },
    },
    {
      key: 'amount',
      header: 'Tutar (EUR)',
      width: 110,
      align: 'right',
      accessor: (line) => lineAmount(line),
      render: (line) => lineAmount(line).toFixed(2),
    },
  ];

  if (compare) {
    columns.push(
      {
        key: 'excel_qty',
        header: 'Excel Miktar',
        width: 100,
        align: 'right',
        render: (line) => {
          const found = diffOf(line);
          if (!found) {
            return (
              <Text span size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                <FaIcon icon="fas fa-question-circle" /> Excel&apos;de bulunamadı
              </Text>
            );
          }
          return (
            <span style={found.diff.qtyDiffers ? danger : undefined}>
              {formatCompareNumber(found.match.qty)}
            </span>
          );
        },
      },
      {
        key: 'excel_unit',
        header: 'Excel Birim Fiyat',
        width: 110,
        align: 'right',
        render: (line) => {
          const found = diffOf(line);
          if (!found) return null;
          const bad =
            found.diff.unitDiffers || (found.diff.amountMismatch && found.match.unitPrice == null);
          return (
            <span style={bad ? danger : undefined}>
              {formatCompareNumber(found.match.unitPrice, 4)}
            </span>
          );
        },
      },
      {
        key: 'excel_amount',
        header: 'Excel Tutar (EUR)',
        width: 150,
        align: 'right',
        render: (line) => {
          const found = diffOf(line);
          if (!found) return null;
          const { amountMismatch } = found.diff;
          return (
            <Group gap={4} justify="flex-end" wrap="nowrap">
              <span style={amountMismatch ? danger : undefined}>
                {formatCompareNumber(found.match.amountEur)}
              </span>
              {amountMismatch ? <ApplyExcelButton lineKey={line.key} /> : null}
            </Group>
          );
        },
      },
    );
  }

  columns.push(
    {
      key: 'price_source',
      header: 'Fiyat Kaynağı',
      render: (line) => muted(formatPriceSource(line.price_source)),
    },
    {
      key: 'price_date',
      header: 'Fiyat Tarihi',
      render: (line) => muted(formatPriceDate(line.price_date)),
    },
  );
  return columns;
}
