import { Button, Group, Modal, Table, Text, Title } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isApiError } from '@/api/client';
import {
  bulkCreateMachiningTasks,
  machiningTaskKeys,
  machiningTasksQueryOptions,
  type MachiningTask,
} from '@/api/manufacturing/machiningTasks';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate } from '@/lib/format';
import {
  DataTable,
  FaIcon,
  FilterBar,
  ModalBody,
  ModalFooter,
  ModalHeader,
  modalClassNames,
  notify,
  PageHeader,
  Panel,
  StatusBadge,
  useUrlFilters,
  type CellEdit,
  type DataTableColumn,
  type FilterConfig,
  type RowAction,
  type SortDir,
} from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import {
  DRAFT_COLUMNS,
  duplicateRow,
  emptyRow,
  FILTER_DEFAULTS,
  taskQuery,
  taskStatus,
  toPayload,
  validateRows,
  type DraftField,
  type DraftRow,
  type TaskFilters,
} from './logic';

const EMPTY: MachiningTask[] = [];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function Placeholder({ children }: { children: string }) {
  return (
    <Text span c="dimmed" size="sm">
      {children}
    </Text>
  );
}

const DRAFT_TYPES: Partial<Record<DraftField, 'number' | 'date'>> = {
  quantity: 'number',
  finish_time: 'date',
};

/** The draft grid's columns (legacy renderBulkCreateTable; `*` marks required). */
const draftColumns: DataTableColumn<DraftRow>[] = DRAFT_COLUMNS.map((col) => {
  const type = DRAFT_TYPES[col.key];
  return {
    key: col.key,
    header: `${col.label}${col.required ? ' *' : ''}`,
    exportHeader: col.label,
    render: (row: DraftRow) => {
      const value = row[col.key];
      if (!value) return <Placeholder>{col.required ? 'Zorunlu' : '-'}</Placeholder>;
      return type === 'date' ? formatDate(value) : value;
    },
    editable: type === 'number' ? { type, min: 1, step: 1 } : type ? { type } : true,
  };
});

/** Legacy "Oluşturduğum Görevler" columns. */
const taskColumns: DataTableColumn<MachiningTask>[] = [
  {
    key: 'key',
    header: 'TI No',
    sortable: true,
    width: '10%',
    render: (r) => <span className={uiClasses.code}>{r.key || '-'}</span>,
  },
  {
    key: 'name',
    header: 'Ad',
    sortable: true,
    width: '12%',
    render: (r) => <strong>{r.name || '-'}</strong>,
  },
  { key: 'description', header: 'Açıklama', sortable: true, width: '15%' },
  { key: 'job_no', header: 'İş No', sortable: true, width: '8%' },
  { key: 'image_no', header: 'Resim No', sortable: true, width: '8%' },
  { key: 'position_no', header: 'Poz No', sortable: true, width: '8%' },
  {
    key: 'quantity',
    header: 'Adet',
    sortable: true,
    width: '6%',
    render: (r) => <>{r.quantity || 0}</>,
  },
  {
    key: 'estimated_hours',
    header: 'Tahmini Saat',
    sortable: true,
    width: '10%',
    render: (r) => <>{r.estimated_hours ? `${r.estimated_hours} saat` : 'Belirtilmemiş'}</>,
  },
  {
    key: 'total_hours_spent',
    header: 'Harcanan Saat',
    sortable: true,
    width: '10%',
    render: (r) => <>{r.total_hours_spent || 0} saat</>,
  },
  {
    key: 'finish_time',
    header: 'Bitmesi Planlanan Tarih',
    sortable: true,
    width: '12%',
    // Legacy showed the planned end, not finish_time (kept).
    accessor: (r) => (r.planned_end_ms ? new Date(r.planned_end_ms) : null),
    render: (r) => (
      <>
        {r.planned_end_ms
          ? new Date(r.planned_end_ms).toLocaleDateString('tr-TR')
          : 'Belirtilmemiş'}
      </>
    ),
  },
  {
    key: 'completion_date',
    header: 'Tamamlanma Tarihi',
    sortable: true,
    width: '12%',
    render: (r) => (
      <>{r.completion_date ? new Date(r.completion_date).toLocaleDateString('tr-TR') : '-'}</>
    ),
  },
  {
    key: 'status',
    header: 'Durum',
    sortable: false,
    width: '8%',
    accessor: (r) => taskStatus(r).label,
    render: (r) => {
      const s = taskStatus(r);
      return <StatusBadge color={s.color}>{s.label}</StatusBadge>;
    },
  },
];

/** The created-tasks Excel (legacy exportCreatedTasks). */
const createdExportColumns: DataTableColumn<MachiningTask>[] = [
  { key: 'key', header: 'TI No', exportValue: (t) => t.key || '' },
  { key: 'name', header: 'Görev Adı', exportValue: (t) => t.name || '' },
  { key: 'job_no', header: 'İş No', exportValue: (t) => t.job_no || '' },
  { key: 'image_no', header: 'Resim No', exportValue: (t) => t.image_no || '' },
  { key: 'position_no', header: 'Pozisyon No', exportValue: (t) => t.position_no || '' },
  { key: 'quantity', header: 'Adet', exportValue: (t) => t.quantity || '' },
  { key: 'estimated_hours', header: 'Tahmini Saat', exportValue: (t) => t.estimated_hours || '' },
  { key: 'description', header: 'Açıklama', exportValue: (t) => t.description || '' },
  {
    key: 'created_at',
    header: 'Oluşturulma Tarihi',
    exportValue: (t) => (t.created_at ? new Date(t.created_at).toLocaleDateString('tr-TR') : ''),
  },
];

const filterConfig: FilterConfig<keyof TaskFilters>[] = [
  { key: 'key', type: 'text', label: 'TI No', placeholder: 'TI-001' },
  { key: 'name', type: 'text', label: 'Görev Adı', placeholder: 'Görev adı' },
  { key: 'job_no', type: 'text', label: 'İş No', placeholder: 'İş numarası' },
  { key: 'image_no', type: 'text', label: 'Resim No', placeholder: 'Resim numarası' },
  { key: 'position_no', type: 'text', label: 'Pozisyon No', placeholder: 'Pozisyon numarası' },
  { key: 'finish_time', type: 'date', label: 'Bitiş Tarihi' },
  { key: 'finish_time__gte', type: 'date', label: 'Bitiş Tarihi (Başlangıç)' },
  { key: 'finish_time__lte', type: 'date', label: 'Bitiş Tarihi (Bitiş)' },
  { key: 'has_timer', type: 'checkbox', label: 'Zamanlayıcı Var' },
  { key: 'exceeded_estimated_hours', type: 'checkbox', label: 'Tahmini Saati Aşan' },
];

function MessageList({ title, messages }: { title: string; messages: string[] }) {
  return (
    <>
      {title}
      {messages.map((m) => (
        <div key={m}>{m}</div>
      ))}
    </>
  );
}

/** Port of manufacturing/machining/create-task (createTask.js). */
export function CreateTaskPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { values, apply, reset } = useUrlFilters(FILTER_DEFAULTS);
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const [sort, setSort] = useState<{ sortBy: string; sortDir: SortDir }>({
    sortBy: 'key',
    sortDir: 'asc',
  });

  // ---- the draft rows ----
  const [rows, setRows] = useState<DraftRow[]>(() => [emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<MachiningTask[] | null>(null);

  const onCellEdit = useCallback(({ rowId, columnKey, value }: CellEdit<DraftRow>) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId ? { ...r, [columnKey]: value === null ? '' : String(value) } : r,
      ),
    );
  }, []);

  const draftActions = useCallback(
    (): RowAction<DraftRow>[] => [
      {
        key: 'duplicate',
        label: 'Kopyala',
        icon: 'fas fa-copy',
        color: 'secondary',
        onClick: (r) =>
          setRows((prev) => {
            const index = prev.findIndex((x) => x.id === r.id);
            const next = [...prev];
            next.splice(index + 1, 0, duplicateRow(r));
            return next;
          }),
      },
      {
        key: 'remove',
        label: 'Sil',
        icon: 'fas fa-trash',
        color: 'danger',
        disabled: rows.length === 1,
        onClick: (r) =>
          setRows((prev) => (prev.length > 1 ? prev.filter((x) => x.id !== r.id) : prev)),
      },
    ],
    [rows.length],
  );

  const save = async () => {
    const problem = validateRows(rows);
    if (problem) {
      notify.error(<MessageList {...problem} />);
      return;
    }
    const payload = toPayload(rows);
    setSaving(true);
    try {
      const response = await bulkCreateMachiningTasks(payload);
      if (Array.isArray(response)) setCreated(response as MachiningTask[]);
      else notify.success(`${payload.length} görev başarıyla oluşturuldu!`);
      setRows([emptyRow()]);
      // Legacy reloaded page 1 of the list.
      await queryClient.invalidateQueries({ queryKey: machiningTaskKeys.all });
      if (page !== 1) apply({ page: '1' });
    } catch (error) {
      notify.error(
        `Hata: ${isApiError(error) ? 'Görevler oluşturulamadı' : (error as Error).message}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const exportCreated = async () => {
    if (!created || created.length === 0) {
      notify.warning('Dışa aktarılacak görev bulunamadı');
      return;
    }
    try {
      const { exportToExcel } = await import('@/ui/DataTable/exportExcel');
      await exportToExcel(created, createdExportColumns, {
        fileName: `olusturulan_gorevler_${new Date().toISOString().split('T')[0]}`,
        sheetName: 'Oluşturulan Görevler',
      });
      notify.success(`${created.length} görev başarıyla Excel dosyası olarak dışa aktarıldı`);
    } catch {
      notify.error('Dışa aktarma sırasında hata oluştu');
    }
  };

  // ---- the creator's tasks ----
  const params = useMemo(() => taskQuery(values, user.id, sort), [values, user.id, sort]);
  const list = useQuery({
    ...machiningTasksQueryOptions(params),
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (list.isError) notify.error('Görevler yüklenirken hata oluştu');
  }, [list.isError, list.errorUpdatedAt]);

  return (
    <>
      <PageHeader
        title="Görev Oluştur"
        subtitle="Yeni görev oluştur ve oluşturduğun görevleri görüntüle"
        icon="plus-circle"
        backTo="/manufacturing/machining/"
      />

      <Panel
        title="Yeni Görev Oluştur"
        icon="fas fa-plus-circle"
        footer={
          <Group justify="space-between">
            <Group gap="xs">
              <Button
                size="xs"
                variant="outline"
                leftSection={<FaIcon icon="fas fa-plus" />}
                onClick={() => setRows((r) => [...r, emptyRow()])}
              >
                Satır Ekle
              </Button>
              <Button
                size="xs"
                loading={saving}
                leftSection={<FaIcon icon="fas fa-save" />}
                onClick={() => void save()}
              >
                Görevleri Oluştur
              </Button>
              <Button
                size="xs"
                variant="default"
                leftSection={<FaIcon icon="fas fa-times" />}
                onClick={() => {
                  setRows([emptyRow()]);
                  notify.info('Form temizlendi');
                }}
              >
                Temizle
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              Toplam satır sayısı: {rows.length}
            </Text>
          </Group>
        }
      >
        <DataTable
          data={rows}
          columns={draftColumns}
          getRowId={(r) => r.id}
          onCellEdit={onCellEdit}
          rowActions={draftActions}
          actionsHeader="İşlem"
          extraData={rows.length}
        />
      </Panel>

      <DataTable
        title="Oluşturduğum Görevler"
        icon="fas fa-table"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={values}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => {
              reset();
              notify.info('Filtreler temizlendi');
            }}
          />
        }
        data={list.data?.results ?? EMPTY}
        columns={taskColumns}
        getRowId={(r) => r.key}
        loading={list.isFetching}
        sortable
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) => {
            setSort({ sortBy, sortDir });
            if (page !== 1) apply({ page: '1' });
          },
        }}
        pagination={{
          page,
          pageSize,
          total: list.data?.count ?? 0,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        exportable={{ fileName: `tasks-table-container_${new Date().toISOString().split('T')[0]}` }}
        onRefresh={() => void list.refetch()}
        emptyMessage="Görev bulunamadı"
      />

      <Modal
        opened={created !== null}
        onClose={() => setCreated(null)}
        size="lg"
        withCloseButton={false}
        classNames={modalClassNames}
      >
        <ModalHeader title="Görevler Başarıyla Oluşturuldu" icon="fas fa-check-circle" />
        <ModalBody>
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <FaIcon icon="fas fa-tasks" size="2.5rem" color="var(--mantine-color-green-6)" />
            <Title order={5} mt="xs">
              Oluşturulan Görevler
            </Title>
            <Text c="dimmed" size="sm">
              Aşağıda oluşturulan görevlerin anahtarları listelenmiştir.
            </Text>
          </div>
          <Table withTableBorder fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Görev Adı</Table.Th>
                <Table.Th>TI No</Table.Th>
                <Table.Th>İş No</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(created ?? []).map((task, i) => (
                <Table.Tr key={task.key || i}>
                  <Table.Td>{task.name || 'N/A'}</Table.Td>
                  <Table.Td>
                    <strong className={uiClasses.code}>{task.key || 'N/A'}</strong>
                  </Table.Td>
                  <Table.Td>{task.job_no || 'N/A'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-times" />}
            onClick={() => setCreated(null)}
          >
            Kapat
          </Button>
          <Button
            color="green"
            leftSection={<FaIcon icon="fas fa-download" />}
            onClick={() => void exportCreated()}
          >
            Excel&apos;e Aktar
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
