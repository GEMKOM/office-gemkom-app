import { Button } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_STALE_TIME } from '@/api';
import {
  subcontractorsQueryOptions,
  useDeleteSubcontractor,
  type Subcontractor,
  type SubcontractorsParams,
} from '@/api/subcontracting/subcontractors';
import {
  confirm,
  DataTable,
  FaIcon,
  FilterBar,
  fromOrdering,
  notify,
  PageHeader,
  toOrdering,
  useUrlFilters,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { subcontractorColumns } from './columns';
import { exportSubcontractors } from './exportSubcontractors';
import { SubcontractorFormModal } from './SubcontractorFormModal';

// Every piece of list state lives in the URL (legacy kept it in module state).
const URL_DEFAULTS = {
  search: '',
  is_active: '',
  page: '1',
  page_size: '20',
  ordering: 'name',
};

type FilterKeys = 'search' | 'is_active';
type FilterState = { search: string; is_active: string };

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'search', label: 'Firma Adı', placeholder: 'Firma adı ara...', span: 4 },
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
];

const EMPTY_FILTERS: FilterState = { search: '', is_active: '' };
const EMPTY_ROWS: Subcontractor[] = [];

/** Filter params as legacy loadSubcontractors built them (unset ones are left out). */
function filterParams(values: FilterState): Pick<SubcontractorsParams, 'search' | 'is_active'> {
  const params: Pick<SubcontractorsParams, 'search' | 'is_active'> = {};
  if (values.search) params.search = values.search;
  if (values.is_active) params.is_active = values.is_active === 'true';
  return params;
}

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Port of manufacturing/subcontracting/subcontractors (subcontractors.js). */
export function SubcontractorsPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);

  const filters = useMemo<FilterState>(
    () => ({ search: values.search, is_active: values.is_active }),
    [values.search, values.is_active],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering || 'name');
  const ordering = toOrdering(sort.sortBy, sort.sortDir);

  const params: SubcontractorsParams = {
    page,
    page_size: pageSize,
    ...filterParams(filters),
    ordering,
  };
  const list = useQuery({
    ...subcontractorsQueryOptions(params),
    staleTime: DEFAULT_STALE_TIME,
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError) notify.error(list.error, { fallback: 'Taşeronlar yüklenirken hata oluştu' });
  }, [list.isError, list.error, list.errorUpdatedAt]);

  // Legacy counts active ones on the loaded page; the total is the server count.
  const activeCount = useMemo(() => rows.filter((s) => s.is_active === true).length, [rows]);

  // ---- create / edit (legacy edits the loaded row, no detail fetch) ----
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Subcontractor | null>(null);

  // ---- delete ----
  const remove = useDeleteSubcontractor();
  const deleteSubcontractor = async (row: Subcontractor) => {
    const ok = await confirm({
      title: 'Taşeron Silme Onayı',
      icon: 'fas fa-trash',
      message: `"${row.name}" adlı taşeronu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      cancelLabel: 'Kapat',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(row.id);
      notify.success('Taşeron başarıyla silindi');
    } catch (error) {
      notify.error(error, { fallback: 'Taşeron silinirken hata oluştu' });
    }
  };

  const rowActions = (row: Subcontractor): RowAction<Subcontractor>[] => [
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
      onClick: (r) => void deleteSubcontractor(r),
    },
  ];

  // ---- export ----
  const [exporting, setExporting] = useState(false);
  const runExport = async () => {
    setExporting(true);
    try {
      await exportSubcontractors(filterParams(filters));
      notify.success('Dışa aktarma başarılı');
    } catch (error) {
      console.error('Error exporting subcontractors:', error);
      notify.error('Dışa aktarma sırasında hata oluştu');
    } finally {
      setExporting(false);
    }
  };

  const refresh = () => {
    // Legacy refresh goes back to page 1 and reloads.
    if (page === 1) void list.refetch();
    else apply({ page: '1' });
  };

  const figure = (value: number) => (list.isPending ? '–' : value.toLocaleString('tr-TR'));

  return (
    <>
      <PageHeader
        title="Taşeron Yönetimi"
        subtitle="Taşeron listesi ve yönetimi"
        icon="users"
        backTo="/manufacturing/"
        stats={[
          { id: 'total-subcontractors-count', label: 'Toplam Taşeron', value: figure(total) },
          { id: 'active-subcontractors-count', label: 'Aktif Taşeron', value: figure(activeCount) },
        ]}
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
            Yeni Taşeron
          </Button>
        }
      />

      <DataTable
        title="Taşeron Listesi"
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
        columns={subcontractorColumns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) =>
            apply({ ordering: toOrdering(sortBy, sortDir) ?? 'name', page: '1' }),
        }}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        rowActions={rowActions}
        emptyMessage="Taşeron bulunamadı"
        onRefresh={refresh}
        toolbar={
          <Button
            size="xs"
            variant="default"
            onClick={() => void runExport()}
            loading={exporting}
            leftSection={<FaIcon icon="fas fa-download" />}
          >
            Dışa Aktar
          </Button>
        }
      />

      {creating ? <SubcontractorFormModal onClose={() => setCreating(false)} /> : null}
      {editing ? (
        <SubcontractorFormModal
          key={editing.id}
          subcontractor={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
