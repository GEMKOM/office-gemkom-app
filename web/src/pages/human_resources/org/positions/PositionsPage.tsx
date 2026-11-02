import { Button } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useUsers } from '@/api';
import {
  DEPARTMENT_CODES,
  departmentLabel,
  POSITION_LEVELS,
  positionsQueryOptions,
  usePositions,
  useSavePosition,
  type Position,
  type PositionsParams,
} from '@/api/human_resources/organization';
import {
  confirm,
  DataTable,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  StatusBadge,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { PositionDetailPanel } from './PositionDetailPanel';
import { PositionFormModal } from './PositionFormModal';
import classes from './positions.module.css';

type FilterKeys = 'department' | 'level';
type FilterState = Record<FilterKeys, string>;

// URL keys as legacy read them (?department=…&level=…).
const URL_DEFAULTS: FilterState = { department: '', level: '' };

const filterConfig: FilterConfig<FilterKeys>[] = [
  {
    type: 'select',
    key: 'department',
    label: 'Departman',
    placeholder: 'Tüm departmanlar',
    searchable: true,
    options: DEPARTMENT_CODES.map(({ value, label }) => ({ value, label })),
  },
  {
    type: 'select',
    key: 'level',
    label: 'Seviye',
    placeholder: 'Tüm seviyeler',
    searchable: false,
    options: POSITION_LEVELS.map((l) => ({ value: String(l), label: `Seviye ${l}` })),
  },
];

const columns: DataTableColumn<Position>[] = [
  {
    key: 'title',
    header: 'Başlık',
    sortable: true,
    render: (row) => <strong>{row.title || '-'}</strong>,
  },
  {
    key: 'level',
    header: 'Seviye',
    sortable: true,
    render: (row) =>
      row.level ? (
        <span className={classes.level} data-family="blue">
          L{row.level}
        </span>
      ) : (
        '-'
      ),
  },
  {
    key: 'parent_title',
    header: 'Bağlı Olduğu',
    sortable: true,
    render: (row) => row.parent_title || '-',
  },
  {
    key: 'department_code',
    header: 'Departman',
    sortable: true,
    accessor: (row) => departmentLabel(row.department_code),
    render: (row) => departmentLabel(row.department_code),
  },
  {
    key: 'holder_count',
    header: 'Kişi',
    sortable: true,
    accessor: (row) => Number(row.holder_count || 0),
  },
  {
    key: 'permission_count',
    header: 'Yetki',
    sortable: true,
    accessor: (row) => Number(row.permission_count || 0),
  },
  {
    key: 'is_active',
    header: 'Durum',
    sortable: true,
    render: (row) =>
      row.is_active ? (
        <StatusBadge color="green">Aktif</StatusBadge>
      ) : (
        <StatusBadge color="grey">Pasif</StatusBadge>
      ),
    exportValue: (row) => (row.is_active ? 'Aktif' : 'Pasif'),
  },
];

const EMPTY_POSITIONS: Position[] = [];

/** Port of human_resources/org/positions (positions.js). */
export function PositionsPage() {
  const { values, apply, reset } = useUrlFilters(URL_DEFAULTS);
  const params: PositionsParams = {};
  if (values.department) params.department_code = values.department;
  if (values.level) params.level = values.level;

  const list = useQuery({ ...positionsQueryOptions(params), placeholderData: keepPreviousData });
  const rows = list.data ?? EMPTY_POSITIONS;
  // Every position, for the parent picker; the same cache entry as the list when unfiltered.
  const allPositions = usePositions();
  const users = useUsers({ is_active: true });

  useEffect(() => {
    if (list.isError) notify.error(list.error, { fallback: 'Pozisyonlar yüklenemedi.' });
  }, [list.isError, list.error, list.errorUpdatedAt]);
  useEffect(() => {
    if (users.isError) notify.error(users.error, { fallback: 'Kullanıcılar yüklenemedi.' });
  }, [users.isError, users.error]);

  const stats = useMemo(() => {
    const active = rows.filter((p) => p.is_active !== false);
    return {
      total: rows.length,
      active: active.length,
      holders: rows.reduce((sum, p) => sum + Number(p.holder_count || 0), 0),
      vacant: active.filter((p) => Number(p.holder_count || 0) === 0).length,
    };
  }, [rows]);

  const [detailId, setDetailId] = useState<number | null>(null);
  // A position the filters hide closes the panel, as legacy loadPositions did.
  const shownDetailId = detailId !== null && rows.some((p) => p.id === detailId) ? detailId : null;

  // undefined = closed, null = create.
  const [editing, setEditing] = useState<Position | null | undefined>(undefined);

  const save = useSavePosition();
  const confirmToggle = async (row: Position) => {
    const active = Boolean(row.is_active);
    const ok = await confirm({
      title: active ? 'Pozisyonu Pasifleştir' : 'Pozisyonu Aktifleştir',
      icon: 'fas fa-power-off',
      message: `"${row.title}" pozisyonu ${active ? 'pasifleştirilecek' : 'aktifleştirilecek'}.`,
      description: 'Devam etmek istediğinize emin misiniz?',
      confirmLabel: active ? 'Pasifleştir' : 'Aktifleştir',
    });
    if (!ok) return;
    try {
      await save.mutateAsync({ id: row.id, data: { is_active: !active } });
      notify.success('Pozisyon durumu güncellendi.');
    } catch (error) {
      notify.error(error, { fallback: 'Pozisyon güncellenemedi.' });
    }
  };

  const rowActions = (row: Position): RowAction<Position>[] => [
    { key: 'detail', label: 'Detay', icon: 'fas fa-eye', onClick: (r) => setDetailId(r.id) },
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'primary',
      onClick: (r) => setEditing(r),
    },
    {
      key: 'toggle',
      label: 'Durumu Değiştir',
      icon: 'fas fa-power-off',
      color: row.is_active ? 'danger' : 'primary',
      onClick: (r) => void confirmToggle(r),
    },
  ];

  const figure = (value: number) => (list.isPending ? '–' : value.toLocaleString('tr-TR'));

  return (
    <>
      <PageHeader
        title="Pozisyon Yönetimi"
        subtitle="Pozisyonları filtreleyin, hiyerarşiyi ve yetki setlerini yönetin"
        backTo="/human_resources/org"
        stats={[
          { id: 'stat-total', label: 'Toplam Pozisyon', value: figure(stats.total) },
          { id: 'stat-active', label: 'Aktif', value: figure(stats.active) },
          { id: 'stat-holders', label: 'Atanmış Kişi', value: figure(stats.holders) },
          { id: 'stat-vacant', label: 'Boş Pozisyon', value: figure(stats.vacant) },
        ]}
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setEditing(null)}>
            Yeni Pozisyon
          </Button>
        }
      />

      <div className={classes.layout}>
        <div className={classes.main}>
          <DataTable
            title="Pozisyon Listesi"
            filters={
              <FilterBar
                inline
                filters={filterConfig}
                values={values}
                onApply={apply}
                onClear={reset}
              />
            }
            data={rows}
            columns={columns}
            getRowId={(row) => String(row.id)}
            loading={list.isFetching}
            rowActions={rowActions}
            onRowClick={(row) => setDetailId(row.id)}
            emptyMessage="Pozisyon bulunamadı."
            onRefresh={() => void list.refetch()}
          />
        </div>
        <PositionDetailPanel positionId={shownDetailId} users={users.data ?? []} />
      </div>

      {editing !== undefined ? (
        <PositionFormModal
          key={editing?.id ?? 'new'}
          position={editing}
          positions={allPositions.data ?? rows}
          onClose={() => setEditing(undefined)}
          onSaved={setDetailId}
        />
      ) : null}
    </>
  );
}
