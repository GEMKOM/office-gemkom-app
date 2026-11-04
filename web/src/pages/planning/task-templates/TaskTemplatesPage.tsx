import { Badge, Button } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteTaskTemplate,
  taskTemplateKeys,
  taskTemplateQueryOptions,
  taskTemplatesQueryOptions,
  type TaskTemplate,
  type TaskTemplatesParams,
} from '@/api/planning/taskTemplates';
import { formatDateTime } from '@/lib/format';
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
import { ManageItemsModal } from './ManageItemsModal';
import { TemplateFormModal } from './TemplateFormModal';

const URL_DEFAULTS = { search: '', is_active: '', is_default: '', page: '1' };

type FilterKeys = 'search' | 'is_active' | 'is_default';
type FilterState = Record<FilterKeys, string>;
const EMPTY_FILTERS: FilterState = { search: '', is_active: '', is_default: '' };

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'search', label: 'Ara', placeholder: 'Şablon adı veya açıklama...' },
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
  {
    type: 'select',
    key: 'is_default',
    label: 'Varsayılan',
    placeholder: 'Tümü',
    searchable: false,
    options: [
      { value: 'true', label: 'Varsayılan' },
      { value: 'false', label: 'Varsayılan Değil' },
    ],
  },
];

/** Legacy loadTemplates: newest first, unset filters left out (no page_size: the backend's page). */
function listParams(filters: FilterState, page: number): TaskTemplatesParams {
  const params: TaskTemplatesParams = { page, ordering: '-created_at' };
  if (filters.search) params.search = filters.search;
  if (filters.is_active) params.is_active = filters.is_active === 'true';
  if (filters.is_default) params.is_default = filters.is_default === 'true';
  return params;
}

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const PAGE_SIZE = 20;
const EMPTY_ROWS: TaskTemplate[] = [];

// Sortable set = legacy; the table sorts the loaded page (legacy had no onSort).
const columns: DataTableColumn<TaskTemplate>[] = [
  {
    key: 'name',
    header: 'Şablon Adı',
    sortable: true,
    render: (row) => (
      <>
        <strong>{row.name}</strong>
        {row.is_default ? (
          <Badge color="blue" ml="xs">
            Varsayılan
          </Badge>
        ) : null}
      </>
    ),
  },
  { key: 'description', header: 'Açıklama', render: (row) => row.description || '-' },
  {
    key: 'items_count',
    header: 'Görev Sayısı',
    accessor: (row) => row.items?.length ?? 0,
    render: (row) => <Badge color="gray">{row.items ? row.items.length : 0}</Badge>,
  },
  {
    key: 'is_active',
    header: 'Durum',
    sortable: true,
    render: (row) =>
      row.is_active ? <StatusBadge color="green">Aktif</StatusBadge> : <StatusBadge color="yellow">Pasif</StatusBadge>,
    exportValue: (row) => (row.is_active ? 'Aktif' : 'Pasif'),
  },
  { key: 'created_at', header: 'Oluşturulma', sortable: true, render: (row) => formatDateTime(row.created_at) },
  { key: 'created_by_name', header: 'Oluşturan', render: (row) => row.created_by_name || '-' },
];

/** Port of planning/task-templates (task-templates.js). */
export function TaskTemplatesPage() {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const filters = useMemo<FilterState>(
    () => ({ search: values.search, is_active: values.is_active, is_default: values.is_default }),
    [values.search, values.is_active, values.is_default],
  );
  const page = positiveInt(values.page, 1);

  const list = useQuery(taskTemplatesQueryOptions(listParams(filters, page)));
  useEffect(() => {
    if (list.isError) notify.error('Şablonlar yüklenirken bir hata oluştu');
  }, [list.isError, list.errorUpdatedAt]);
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TaskTemplate | null>(null);
  const [managingId, setManagingId] = useState<number | null>(null);
  const closeManage = useCallback(() => setManagingId(null), []);

  /** Edit and delete start from a fresh copy of the template, like legacy. */
  const fetchTemplate = async (id: number): Promise<TaskTemplate | null> => {
    try {
      return await queryClient.fetchQuery(taskTemplateQueryOptions(id));
    } catch (error) {
      console.error('Error loading template:', error);
      notify.error('Şablon yüklenirken bir hata oluştu');
      return null;
    }
  };

  const openEdit = async (row: TaskTemplate) => {
    const template = await fetchTemplate(row.id);
    if (template) setEditing(template);
  };

  const remove = async (row: TaskTemplate) => {
    const template = await fetchTemplate(row.id);
    if (!template) return;
    const ok = await confirm({
      title: 'Şablon Silme Onayı',
      icon: 'fas fa-exclamation-triangle',
      message: `"${template.name}" şablonunu silmek istediğinizden emin misiniz?`,
      description: 'Bu işlem geri alınamaz.',
      confirmLabel: 'Sil',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteTaskTemplate(template.id);
      notify.success('Şablon başarıyla silindi');
      void queryClient.invalidateQueries({ queryKey: taskTemplateKeys.all });
    } catch (error) {
      console.error('Error deleting template:', error);
      notify.error('Şablon silinirken bir hata oluştu');
    }
  };

  const rowActions = (): RowAction<TaskTemplate>[] => [
    { key: 'items', label: 'Görevleri Yönet', icon: 'fas fa-tasks', color: 'primary', onClick: (r) => setManagingId(r.id) },
    { key: 'edit', label: 'Düzenle', icon: 'fas fa-edit', color: 'warning', onClick: (r) => void openEdit(r) },
    { key: 'delete', label: 'Sil', icon: 'fas fa-trash', color: 'danger', onClick: (r) => void remove(r) },
  ];

  return (
    <>
      <PageHeader
        title="Görev Şablonları"
        subtitle="Departman görev şablonlarını yönetin ve oluşturun"
        icon="tasks"
        backTo="/planning/"
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
            Yeni Şablon
          </Button>
        }
      />
      <DataTable
        title="Görev Şablonları"
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
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: (next) => apply({ page: String(next) }) }}
        rowActions={rowActions}
        onRefresh={() => void list.refetch()}
      />
      {creating ? <TemplateFormModal onClose={() => setCreating(false)} /> : null}
      {editing ? <TemplateFormModal key={editing.id} template={editing} onClose={() => setEditing(null)} /> : null}
      {managingId !== null ? <ManageItemsModal templateId={managingId} onClose={closeManage} /> : null}
    </>
  );
}
