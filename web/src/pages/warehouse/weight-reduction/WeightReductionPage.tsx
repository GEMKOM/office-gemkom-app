import { Alert, Button, Group, Modal, SegmentedControl, Stack, Text } from '@mantine/core';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  cncTaskKeys,
  cncTaskQueryOptions,
  cncTasksQueryOptions,
  markCncTaskDeducted,
  type CncTask,
} from '@/api/manufacturing/cncTasks';
import { hasPerm, isAdmin } from '@/auth/authService';
import { formatDateTime } from '@/lib/format';
import {
  confirm,
  DataTable,
  errorMessage,
  FaIcon,
  FilterBar,
  ModalBody,
  ModalHeader,
  ModalSection,
  modalClassNames,
  notify,
  PageHeader,
  StatusBadge,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import {
  kg,
  KgSummary,
  PART_DEDUCT_COLUMNS,
  useFinishPreview,
} from '@/pages/manufacturing/cnc-cutting/cuts/FinishCutModal';
import { pieceText } from '@/pages/manufacturing/cnc-cutting/cuts/PlateSource';
import { plateSource } from '@/pages/manufacturing/cnc-cutting/reports/parts-search/plateSource';
import { deductRows, downloadMikroCsv, partDeductions } from './mikroCsv';

// Ağırlık Düşüşü (port of blue-app warehouse/weight-reduction). The stock is
// booked when a cut is finished: its sheets leave stock, the operator's
// remnants come back, the fire is stored on the cut. Mikro still does the
// accounting, so this page lists the finished cuts, shows what they used and
// exports the kg to deduct per job (the same file blue-app made), then
// records that the deduction was made in Mikro.

const PAGE_SIZE = 20;
const URL_DEFAULTS = {
  view: 'pending',
  key: '',
  name: '',
  nesting_id: '',
  page: '1',
  page_size: '20',
  kesim: '',
};
type FilterKeys = 'key' | 'name' | 'nesting_id';

const FILTERS: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'key', label: 'Kesim No', placeholder: 'örn. CNC-120' },
  { type: 'text', key: 'name', label: 'Kesim Adı' },
  { type: 'text', key: 'nesting_id', label: 'Nesting ID' },
];

export function canMarkDeducted(): boolean {
  return isAdmin() || hasPerm('access_warehouse');
}

function SourceCell({ row }: { row: CncTask }) {
  const source = plateSource(row);
  return (
    <Stack gap={2}>
      <Text size="sm">{source.name || '-'}</Text>
      {source.badge ? (
        <StatusBadge color={source.badge.color}>{source.badge.label}</StatusBadge>
      ) : null}
    </Stack>
  );
}

const columns = (done: boolean): DataTableColumn<CncTask>[] => [
  {
    key: 'key',
    header: 'Kesim No',
    render: (row) => (
      <Text size="sm" fw={600}>
        {row.key}
      </Text>
    ),
  },
  { key: 'name', header: 'Kesim Adı', render: (row) => row.name || '-' },
  { key: 'material', header: 'Sac', render: (row) => <SourceCell row={row} /> },
  { key: 'dimensions', header: 'Ölçü', render: (row) => row.dimensions || '-' },
  { key: 'quantity', header: 'Sac Adedi', align: 'right', render: (row) => row.quantity ?? 1 },
  {
    key: 'completion_date',
    header: 'Tamamlanma',
    render: (row) => (row.completion_date ? formatDateTime(Number(row.completion_date)) : '-'),
  },
  {
    key: 'consumed_kg',
    header: 'Kullanılan',
    align: 'right',
    render: (row) => `${kg(row.consumed_kg)}${row.consumed_estimated ? ' (tahmini)' : ''}`,
  },
  { key: 'remnant_kg', header: 'Fire Sac', align: 'right', render: (row) => kg(row.remnant_kg) },
  { key: 'fire_kg', header: 'Fire', align: 'right', render: (row) => kg(row.fire_kg) },
  done
    ? {
        key: 'processed_warehouse_date',
        header: "Mikro'ya İşlenme",
        render: (row) =>
          `${row.processed_warehouse_date ? formatDateTime(row.processed_warehouse_date) : '-'} · ${row.processed_by_username || '-'}`,
      }
    : {
        key: 'remnants_entered',
        header: 'Fire Sac Girişi',
        render: (row) =>
          row.remnants_entered ? (
            <StatusBadge color="green">Girildi</StatusBadge>
          ) : (
            <StatusBadge color="orange">Girilmedi</StatusBadge>
          ),
      },
];

/** Per-part deductions: from the cut's booked fire, or (cut finished before booking) a preview. */
function useDeductions(task: CncTask | undefined) {
  const booked = Boolean(task && task.consumed_kg !== null && task.consumed_kg !== undefined);
  // Cuts finished before the stock was booked at finish have no kg yet: show
  // the estimate from their own size, as blue-app did (without its 10% guess).
  const preview = useFinishPreview(
    task?.key ?? '',
    { consumed: [], remnants: [] },
    Boolean(task) && !booked,
  );
  if (!task) return { parts: [], figures: null, estimated: false, loading: true };
  if (booked) {
    const fire = task.fire_kg === null || task.fire_kg === undefined ? null : Number(task.fire_kg);
    return {
      parts: partDeductions(task.parts ?? [], task.quantity ?? 1, fire),
      figures: task,
      estimated: false,
      loading: false,
    };
  }
  return {
    parts: preview.data?.parts ?? [],
    figures: preview.data ?? null,
    estimated: true,
    loading: preview.isFetching,
  };
}

function ReportModal({ cutKey, onClose }: { cutKey: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const task = useQuery(cncTaskQueryOptions(cutKey));
  const t = task.data;
  const { parts, figures, estimated, loading } = useDeductions(t);
  const mark = useMutation({
    mutationFn: () => markCncTaskDeducted(cutKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cncTaskKeys.all }),
  });

  const save = async () => {
    const ok = await confirm({
      title: "Mikro'ya İşlendi",
      icon: 'fas fa-check',
      message: `${cutKey} Mikro'da düşüldü olarak işaretlenecek.`,
      description: 'Stok kesim bitirilirken işlendi; bu yalnızca Mikro düşümünü kaydeder.',
      confirmLabel: 'Evet, İşaretle',
      cancelLabel: 'İptal',
    });
    if (!ok) return;
    try {
      await mark.mutateAsync();
      notify.success(`${cutKey} Mikro'ya işlendi olarak işaretlendi`);
      onClose();
    } catch (error) {
      notify.error(errorMessage(error, 'İşaretlenemedi'));
    }
  };

  const issued = t?.piece_issues ?? [];
  const remnants = t?.remnant_pieces ?? [];

  return (
    <Modal opened onClose={onClose} size="90%" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader title="Ağırlık Düşüşü" subtitle={cutKey} icon="fas fa-weight-hanging" />
      <ModalBody>
        {!t ? (
          <Text c="dimmed">Yükleniyor…</Text>
        ) : (
          <Stack gap="md">
            <ModalSection title="Kesim" icon="fas fa-info-circle">
              <Text size="sm">
                {t.name || '-'} · Nesting {t.nesting_id || '-'} · {t.material || '-'} ·{' '}
                {t.dimensions || '-'} · {t.quantity ?? 1} sac
              </Text>
              <Text size="sm" c="dimmed">
                {issued.length
                  ? `Stoktan düşülen: ${issued.map((i) => `${pieceText(i.piece_details)} × ${i.quantity}`).join(', ')}`
                  : 'Stoktan sac partisi düşülmedi; ağırlık kesimin ölçüsünden.'}
              </Text>
              <Text size="sm" c="dimmed">
                {remnants.length
                  ? `Stoğa dönen fire sac: ${remnants.map((r) => `${pieceText(r)} × ${r.quantity ?? 1}`).join(', ')}`
                  : t.remnants_entered
                    ? 'Operatör kullanılabilir fire sac kalmadığını bildirdi.'
                    : 'Operatör fire sac girmedi.'}
              </Text>
            </ModalSection>

            {estimated ? (
              <Alert color="yellow" icon={<FaIcon icon="fas fa-info-circle" />}>
                Bu kesim, stok kesim bitirilirken işlenmeye başlamadan önce tamamlandı; ağırlıklar
                kesimin ölçüsünden tahmindir ve fire sac içermez.
              </Alert>
            ) : null}
            {figures ? <KgSummary figures={figures} task={t} /> : null}

            <DataTable
              title="Parçalar ve Düşülecek Ağırlık"
              icon="fas fa-puzzle-piece"
              data={parts}
              columns={PART_DEDUCT_COLUMNS}
              getRowId={(p) => String(p.id)}
              loading={loading}
              striped
              verticalSpacing="xs"
              emptyMessage="Parça bulunamadı"
            />

            <Group justify="flex-end">
              <Button
                variant="default"
                onClick={onClose}
                leftSection={<FaIcon icon="fas fa-times" />}
              >
                Kapat
              </Button>
              <Button
                variant="outline"
                color="green"
                leftSection={<FaIcon icon="fas fa-file-csv" />}
                disabled={!parts.length}
                onClick={() => downloadMikroCsv(deductRows(parts))}
              >
                Mikro CSV
              </Button>
              {canMarkDeducted() && !t.processed_by_warehouse ? (
                <Button
                  leftSection={<FaIcon icon="fas fa-check" />}
                  loading={mark.isPending}
                  onClick={() => void save()}
                >
                  Mikro&apos;ya İşlendi
                </Button>
              ) : null}
            </Group>
          </Stack>
        )}
      </ModalBody>
    </Modal>
  );
}

const EMPTY: CncTask[] = [];

export function WeightReductionPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const page = Math.max(1, Number.parseInt(values.page, 10) || 1);
  const pageSize = Math.max(1, Number.parseInt(values.page_size, 10) || PAGE_SIZE);
  const done = values.view === 'done';
  const list = useQuery({
    ...cncTasksQueryOptions({
      page,
      page_size: pageSize,
      ordering: '-completion_date',
      completion_date__isnull: 'false',
      processed_by_warehouse: done ? 'true' : 'false',
      key: values.key.trim() || undefined,
      name: values.name.trim() || undefined,
      nesting_id: values.nesting_id.trim() || undefined,
    }),
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (list.isError) notify.error(errorMessage(list.error, 'Kesimler yüklenemedi'));
  }, [list.isError, list.error]);

  const rowActions = (): RowAction<CncTask>[] => [
    {
      key: 'open',
      label: done ? 'Detay' : 'Aç',
      icon: done ? 'fas fa-eye' : 'fas fa-weight-hanging',
      color: 'success',
      onClick: (row) => apply({ kesim: row.key }),
    },
  ];

  return (
    <>
      <PageHeader
        title="Ağırlık Düşüşü"
        subtitle="Biten CNC kesimleri: kullanılan sac, fire sac ve fire; Mikro'da düşülecek ağırlık"
        icon="weight-hanging"
        backTo="/warehouse"
      />
      <SegmentedControl
        mb="sm"
        value={done ? 'done' : 'pending'}
        onChange={(view) => apply({ view, page: '1' })}
        data={[
          { value: 'pending', label: "Mikro'ya İşlenecek" },
          { value: 'done', label: "Mikro'ya İşlenen" },
        ]}
      />
      <DataTable
        columnsKey="weight-reduction"
        title={done ? "Mikro'ya işlenen kesimler" : "Mikro'ya işlenmeyi bekleyen kesimler"}
        filters={
          <FilterBar
            inline
            filters={FILTERS}
            values={{ key: values.key, name: values.name, nesting_id: values.nesting_id }}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => apply({ key: '', name: '', nesting_id: '', page: '1' })}
          />
        }
        data={list.data?.results ?? EMPTY}
        columns={columns(done)}
        getRowId={(row) => row.key}
        loading={list.isFetching}
        onRowClick={(row) => apply({ kesim: row.key })}
        pagination={{
          page,
          pageSize,
          total: list.data?.count ?? 0,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        rowActions={rowActions}
        emptyMessage={done ? "Mikro'ya işlenen kesim yok" : "Mikro'ya işlenmeyi bekleyen kesim yok"}
      />
      {values.kesim ? (
        <ReportModal
          key={values.kesim}
          cutKey={values.kesim}
          onClose={() => apply({ kesim: '' })}
        />
      ) : null}
    </>
  );
}
