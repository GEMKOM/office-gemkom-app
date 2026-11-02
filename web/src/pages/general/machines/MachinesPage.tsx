import { Button, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  machineListQueryOptions,
  machineTypesQueryOptions,
  machineUsedInQueryOptions,
  useDeleteMachine,
  type MachineListParams,
  type MachineRecord,
} from '@/api/general/machines';
import { usersQueryOptions } from '@/api/reference/users';
import {
  confirm,
  DataTable,
  DetailModal,
  FaIcon,
  FilterBar,
  fromOrdering,
  notify,
  PageHeader,
  toOrdering,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { MachineFormModal } from './MachineFormModal';
import { assignedUserName } from './machineUsers';

// Filter keys are the backend params legacy collectFilterValues sent.
const URL_DEFAULTS = {
  name: '',
  code: '',
  machine_type: '',
  used_in: '',
  is_active: '',
  page: '1',
  page_size: '20',
  ordering: '',
};

type FilterKeys = 'name' | 'code' | 'machine_type' | 'used_in' | 'is_active';
type FilterState = Record<FilterKeys, string>;
const EMPTY_FILTERS: FilterState = {
  name: '',
  code: '',
  machine_type: '',
  used_in: '',
  is_active: '',
};
const EMPTY_ROWS: MachineRecord[] = [];

// Used until /machines/used_in/ answers (legacy's initial options).
const USED_IN_FALLBACK = [
  { value: 'machining', label: 'Talaşlı İmalat' },
  { value: 'welding', label: 'Kaynak' },
  { value: 'assembly', label: 'Montaj' },
  { value: 'other', label: 'Diğer' },
];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function propertyCount(row: MachineRecord): number {
  return row.properties && typeof row.properties === 'object'
    ? Object.keys(row.properties).length
    : 0;
}

function Bool({ value }: { value: unknown }) {
  return value ? (
    <Text span c="green.7" fw={700} aria-label="Evet">
      ✓
    </Text>
  ) : (
    <Text span c="red.7" fw={700} aria-label="Hayır">
      ✗
    </Text>
  );
}

/** Port of general/machines (machineList.js). */
export function MachinesPage() {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const filters = useMemo<FilterState>(
    () => ({
      name: values.name,
      code: values.code,
      machine_type: values.machine_type,
      used_in: values.used_in,
      is_active: values.is_active,
    }),
    [values.name, values.code, values.machine_type, values.used_in, values.is_active],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering);

  const params: MachineListParams = {
    page,
    page_size: pageSize,
    ...filters,
    ordering: values.ordering || undefined,
  };
  const list = useQuery(machineListQueryOptions(params));
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError) notify.error('Makineler yüklenirken hata oluştu');
  }, [list.isError, list.errorUpdatedAt]);

  const types = useQuery(machineTypesQueryOptions());
  const usedIn = useQuery(machineUsedInQueryOptions());
  const users = useQuery(usersQueryOptions());

  const filterConfig = useMemo<FilterConfig<FilterKeys>[]>(
    () => [
      { type: 'text', key: 'name', label: 'Makine Adı', placeholder: 'Makine adı' },
      { type: 'text', key: 'code', label: 'Makine Kodu', placeholder: 'Makine kodu' },
      {
        type: 'select',
        key: 'machine_type',
        label: 'Makine Tipi',
        placeholder: 'Tüm Tipler',
        options: types.data ?? [],
      },
      {
        type: 'select',
        key: 'used_in',
        label: 'Kullanım Alanı',
        placeholder: 'Tüm Alanlar',
        options: usedIn.data?.length ? usedIn.data : USED_IN_FALLBACK,
      },
      {
        type: 'select',
        key: 'is_active',
        label: 'Durum',
        placeholder: 'Tümü',
        searchable: false,
        options: [
          { value: 'true', label: 'Aktif' },
          { value: 'false', label: 'Pasif' },
        ],
      },
    ],
    [types.data, usedIn.data],
  );

  // Legacy: total from the server, the rest counted on the loaded page.
  const stats = useMemo(
    () => ({
      active: rows.filter((m) => m.is_active === true).length,
      types: new Set(rows.map((m) => m.machine_type_label).filter(Boolean)).size,
      areas: new Set(rows.map((m) => m.used_in).filter(Boolean)).size,
    }),
    [rows],
  );
  const figure = (value: number) => (list.isPending ? '–' : value.toLocaleString('tr-TR'));

  // ---- modals ----
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MachineRecord | null>(null);
  const [showingProps, setShowingProps] = useState<MachineRecord | null>(null);
  const [showingUsers, setShowingUsers] = useState<MachineRecord | null>(null);

  const remove = useDeleteMachine();
  const deleteMachine = async (row: MachineRecord) => {
    const ok = await confirm({
      title: 'Makine Silme Onayı',
      icon: 'fas fa-exclamation-triangle',
      message: 'Bu makineyi silmek istediğinize emin misiniz?',
      details: <Text size="sm">{row.name}</Text>,
      description: 'Bu işlem geri alınamaz ve makine kalıcı olarak silinecektir.',
      confirmLabel: 'Evet, Sil',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(row.id);
      notify.success('Makine silindi');
    } catch (error) {
      notify.error(error, { fallback: 'Makine silinirken hata oluştu' });
    }
  };

  const columns = useMemo<DataTableColumn<MachineRecord>[]>(
    () => [
      { key: 'id', header: 'ID', sortable: true, width: 70 },
      {
        key: 'name',
        header: 'Makine Adı',
        sortable: true,
        render: (row) => <strong>{row.name || '-'}</strong>,
      },
      { key: 'code', header: 'Kod', sortable: true },
      { key: 'used_in_label', header: 'Kullanım Alanı', sortable: true },
      { key: 'machine_type_label', header: 'Makine Tipi', sortable: true },
      {
        key: 'assigned_users',
        header: 'Atanan Kullanıcılar',
        sortable: false,
        render: (row) =>
          row.assigned_users?.length ? (
            <Button
              size="compact-xs"
              variant="light"
              leftSection={<FaIcon icon="fas fa-users" />}
              onClick={(event) => {
                event.stopPropagation();
                setShowingUsers(row);
              }}
            >
              Kullanıcılar ({row.assigned_users.length})
            </Button>
          ) : (
            '-'
          ),
        exportValue: (row) =>
          (row.assigned_users ?? []).map((u) => assignedUserName(u, [])).join(', '),
      },
      {
        key: 'is_active',
        header: 'Aktif',
        sortable: true,
        align: 'center',
        render: (row) => <Bool value={row.is_active} />,
        exportValue: (row) => (row.is_active ? 'Evet' : 'Hayır'),
      },
      {
        key: 'is_under_maintenance',
        header: 'Bakımda',
        sortable: true,
        align: 'center',
        render: (row) => <Bool value={row.is_under_maintenance} />,
        exportValue: (row) => (row.is_under_maintenance ? 'Evet' : 'Hayır'),
      },
      {
        key: 'properties',
        header: 'Özellikler',
        sortable: false,
        render: (row) => {
          const count = propertyCount(row);
          if (count === 0) return 'Yok';
          return (
            <Button
              size="compact-xs"
              variant="light"
              color="cyan"
              leftSection={<FaIcon icon="fas fa-list" />}
              onClick={(event) => {
                event.stopPropagation();
                setShowingProps(row);
              }}
            >
              Özellikler ({count})
            </Button>
          );
        },
        exportValue: (row) => (propertyCount(row) ? JSON.stringify(row.properties) : 'Yok'),
      },
    ],
    [],
  );

  const rowActions = (row: MachineRecord): RowAction<MachineRecord>[] => [
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'primary',
      onClick: () => setEditing(row),
    },
    {
      key: 'delete',
      label: 'Sil',
      icon: 'fas fa-trash',
      color: 'danger',
      onClick: (r) => void deleteMachine(r),
    },
  ];

  const refresh = () => {
    // Legacy refresh goes back to page 1 and reloads.
    if (page === 1) void list.refetch();
    else {
      void queryClient.invalidateQueries({
        queryKey: ['generalMachines', 'list'],
        refetchType: 'none',
      });
      apply({ page: '1' });
    }
  };

  const props =
    showingProps?.properties && typeof showingProps.properties === 'object'
      ? showingProps.properties
      : {};
  const userRows = showingUsers?.assigned_users ?? [];

  return (
    <>
      <PageHeader
        title="Makine Yönetimi"
        subtitle="Şirket makinelerinin yönetimi ve bilgi güncelleme"
        backTo="/general/"
        stats={[
          { id: 'total-machines', label: 'Toplam Makine', value: figure(total) },
          { id: 'active-machines', label: 'Aktif Makine', value: figure(stats.active) },
          { id: 'machine-types', label: 'Makine Tipi', value: figure(stats.types) },
          { id: 'usage-areas', label: 'Kullanım Alanı', value: figure(stats.areas) },
        ]}
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
            Yeni Makine
          </Button>
        }
      />

      <DataTable
        title="Makine Listesi"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => apply({ ...EMPTY_FILTERS, page: '1' })}
          />
        }
        data={rows}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) =>
            apply({ ordering: toOrdering(sortBy, sortDir) ?? '', page: '1' }),
        }}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        rowActions={rowActions}
        exportable={{ fileName: 'makineler', sheetName: 'Makineler' }}
        emptyMessage="Makine bulunamadı"
        onRefresh={refresh}
      />

      {creating ? <MachineFormModal onClose={() => setCreating(false)} /> : null}
      {editing ? (
        <MachineFormModal key={editing.id} machine={editing} onClose={() => setEditing(null)} />
      ) : null}

      <DetailModal
        opened={showingProps !== null}
        onClose={() => setShowingProps(null)}
        title="Makine Özellikleri"
        icon="fas fa-list"
        size="lg"
        onEdit={() => {
          const machine = showingProps;
          setShowingProps(null);
          if (machine) setEditing(machine);
        }}
        sections={[
          {
            title: 'Temel Bilgiler',
            icon: 'fas fa-info-circle',
            fields: [
              { label: 'Makine Adı', value: showingProps?.name || '-' },
              { label: 'Makine Kodu', value: showingProps?.code || '-' },
              { label: 'Makine Tipi', value: showingProps?.machine_type_label || '-' },
              { label: 'Kullanım Alanı', value: showingProps?.used_in_label || '-' },
              { label: 'Durum', type: 'boolean', value: showingProps?.is_active },
              { label: 'Bakımda', type: 'boolean', value: showingProps?.is_under_maintenance },
            ],
          },
          {
            title: 'Özellikler',
            icon: 'fas fa-list',
            hidden: Object.keys(props).length === 0,
            fields: Object.entries(props).map(([key, value]) => ({
              label: key,
              value: typeof value === 'object' && value !== null ? JSON.stringify(value) : value,
            })),
          },
        ]}
      />

      <DetailModal
        opened={showingUsers !== null}
        onClose={() => setShowingUsers(null)}
        title="Atanan Kullanıcılar"
        icon="fas fa-users"
        size="lg"
        sections={[
          {
            title: 'Atanan Kullanıcılar',
            icon: 'fas fa-users',
            fields: userRows.length
              ? userRows.map((user, index) => ({
                  label: `Kullanıcı ${index + 1}`,
                  value: assignedUserName(user, users.data ?? []),
                }))
              : [{ label: 'Bilgi', value: 'Atanmış kullanıcı bulunamadı', span: 12 }],
          },
        ]}
      />
    </>
  );
}
