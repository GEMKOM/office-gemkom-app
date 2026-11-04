import { Badge, Button, Group, Table, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  departmentChoicesQueryOptions,
  DEPARTMENT_OPTIONS,
  removeTemplateItem,
  TASK_TYPE_OPTIONS,
  taskTemplateErrorMessage,
  taskTemplateKeys,
  taskTemplateQueryOptions,
  taskTypeChoicesQueryOptions,
  templateItemsQueryOptions,
  updateTemplateItem,
  type ChoiceOption,
  type TaskTemplate,
  type TemplateChildItem,
  type TemplateItem,
} from '@/api/planning/taskTemplates';
import { formatDateTime } from '@/lib/format';
import { confirm, DataTable, DetailModal, FaIcon, notify, StatusBadge, type DataTableColumn, type RowAction } from '@/ui';
import { AddChildItemModal, AddItemModal, EditItemModal } from './ItemModals';

/** One row of the flattened hierarchy: a main item followed by its children. */
export interface ItemRow {
  id: number;
  parentId: number | null;
  isChildItem: boolean;
  sequence: number | null | undefined;
  department: string | null | undefined;
  department_display: string;
  title: string;
  task_type: string | null;
  weight: number;
  depends_on: string;
  children_count: number;
}

const isMain = (item: TemplateItem) => item.parent === null || item.parent === undefined;

/** Legacy tableData: main items by sequence, each followed by its children. */
export function flattenItems(items: TemplateItem[], departments: ChoiceOption[]): ItemRow[] {
  const rows: ItemRow[] = [];
  const mainItems = items.filter(isMain).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  mainItems.forEach((item) => {
    const deptLabel =
      departments.find((d) => d.value === item.department)?.label || item.department_display || item.department || '';
    const dependsOn = item.depends_on?.length
      ? item.depends_on.map((id) => items.find((i) => i.id === id)?.title ?? id).join(', ')
      : '-';
    rows.push({
      id: item.id,
      parentId: null,
      isChildItem: false,
      sequence: item.sequence,
      department: item.department,
      department_display: deptLabel,
      title: item.title,
      task_type: item.task_type || null,
      weight: item.weight || 10,
      depends_on: dependsOn,
      children_count: item.children_count || 0,
    });
    (item.children ?? []).forEach((child) => {
      rows.push({
        id: child.id,
        parentId: item.id,
        isChildItem: true,
        sequence: child.sequence,
        department: child.department || item.department,
        department_display: child.department_display || deptLabel,
        title: child.title,
        task_type: child.task_type || null,
        weight: child.weight || 10,
        depends_on: '-',
        children_count: 0,
      });
    });
  });
  return rows;
}

const Muted = ({ children = '-' }: { children?: string }) => <Text span c="dimmed" size="sm">{children}</Text>;

function itemColumns(taskTypes: ChoiceOption[]): DataTableColumn<ItemRow>[] {
  const typeLabel = (value: string) => taskTypes.find((t) => t.value === value)?.label || value;
  return [
    {
      key: 'sequence',
      header: 'Sıra',
      width: 80,
      sortable: true,
      render: (row) => (row.isChildItem ? <Muted>↳</Muted> : <Badge color="gray" variant="filled">{row.sequence}</Badge>),
    },
    {
      key: 'department_display',
      header: 'Departman',
      width: 150,
      sortable: true,
      render: (row) => <StatusBadge color="blue">{row.department_display}</StatusBadge>,
    },
    {
      key: 'title',
      header: 'Başlık',
      sortable: true,
      render: (row) => <strong style={row.isChildItem ? { marginLeft: 16 } : undefined}>{row.title}</strong>,
    },
    {
      key: 'task_type',
      header: 'Görev Tipi',
      width: 130,
      sortable: true,
      render: (row) => (row.task_type ? <StatusBadge color="yellow">{typeLabel(row.task_type)}</StatusBadge> : <Muted />),
      exportValue: (row) => (row.task_type ? typeLabel(row.task_type) : ''),
    },
    {
      key: 'weight',
      header: 'Ağırlık',
      width: 100,
      sortable: true,
      editable: {
        type: 'number',
        min: 1,
        max: 100,
        step: 1,
        validate: (value) =>
          value === null || typeof value !== 'number' || Math.trunc(value) < 1 || Math.trunc(value) > 100
            ? 'Ağırlık 1-100 arasında olmalıdır'
            : true,
      },
      render: (row) => <Badge color="gray" variant="filled">{row.weight || 10}</Badge>,
    },
    {
      key: 'children_count',
      header: 'Alt Görevler',
      width: 120,
      render: (row) =>
        !row.isChildItem && row.children_count > 0 ? (
          <StatusBadge color="green">{row.children_count} alt görev</StatusBadge>
        ) : (
          <Muted />
        ),
    },
    {
      key: 'depends_on',
      header: 'Bağımlılıklar',
      width: 200,
      render: (row) =>
        row.isChildItem || row.depends_on === '-' ? (
          <Muted />
        ) : (
          <Text span size="xs" c="dimmed">
            {row.depends_on}
          </Text>
        ),
    },
  ];
}

type ItemDialog =
  | { kind: 'add' }
  | { kind: 'edit'; item: TemplateChildItem & { depends_on?: number[] | null }; isChildItem: boolean }
  | { kind: 'addChild'; parent: TemplateItem };

function TemplateInfo({ template, items }: { template: TaskTemplate; items: TemplateItem[] }) {
  const mainCount = items.filter(isMain).length;
  const rows: [string, ReactNode][] = [
    ['Şablon Adı', <strong key="n">{template.name}</strong>],
    ['Açıklama', template.description || <Muted key="d" />],
    [
      'Durum',
      template.is_active ? (
        <StatusBadge key="s" color="green">Aktif</StatusBadge>
      ) : (
        <StatusBadge key="s" color="yellow">Pasif</StatusBadge>
      ),
    ],
    [
      'Varsayılan',
      template.is_default ? (
        <Badge key="v" color="blue">Varsayılan</Badge>
      ) : (
        <Badge key="v" color="gray">Varsayılan Değil</Badge>
      ),
    ],
    ['Ana Görev Sayısı', <Badge key="m" color="gray">{mainCount}</Badge>],
    [
      'Toplam Görev Sayısı',
      <span key="t">
        <Badge color="cyan">{items.length}</Badge> ({mainCount} ana + {items.length - mainCount} alt görev)
      </span>,
    ],
    ['Oluşturulma Tarihi', template.created_at ? formatDateTime(template.created_at) : <Muted key="c" />],
    ['Oluşturan', template.created_by_name || <Muted key="b" />],
  ];
  return (
    <Table withTableBorder withColumnBorders verticalSpacing={6}>
      <Table.Tbody>
        {rows.map(([label, value]) => (
          <Table.Tr key={label}>
            <Table.Th w={220}>{label}</Table.Th>
            <Table.Td>{value}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

interface ManageItemsModalProps {
  templateId: number;
  onClose: () => void;
}

/** "Görevleri Yönet": template info and the hierarchical item table with inline weight editing. */
export function ManageItemsModal({ templateId, onClose }: ManageItemsModalProps) {
  const queryClient = useQueryClient();
  const template = useQuery(taskTemplateQueryOptions(templateId));
  const itemsQuery = useQuery(templateItemsQueryOptions(templateId));
  const departments = useQuery(departmentChoicesQueryOptions()).data ?? DEPARTMENT_OPTIONS;
  const taskTypes = useQuery(taskTypeChoicesQueryOptions()).data ?? TASK_TYPE_OPTIONS;
  const [dialog, setDialog] = useState<ItemDialog | null>(null);

  // Legacy opened the modal only once both loaded; a failure was a toast and no modal.
  const failed = template.isError || itemsQuery.isError;
  useEffect(() => {
    if (!failed) return;
    notify.error('Şablon görevleri yüklenirken bir hata oluştu');
    onClose();
  }, [failed, onClose]);

  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const rows = useMemo(() => flattenItems(items, departments), [items, departments]);
  const columns = useMemo(() => itemColumns(taskTypes), [taskTypes]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: taskTemplateKeys.all });

  const findItem = (id: number) => {
    const main = items.find((i) => i.id === id);
    if (main) return { item: main, isChildItem: false };
    for (const parent of items) {
      const child = (parent.children ?? []).find((c) => c.id === id);
      if (child) return { item: child, isChildItem: true };
    }
    return null;
  };

  const removeItem = async (row: ItemRow) => {
    const ok = await confirm({
      title: 'Görev Silme Onayı',
      icon: 'fas fa-exclamation-triangle',
      message: 'Bu görevi silmek istediğinizden emin misiniz? Alt görevler de silinecektir.',
      confirmLabel: 'Sil',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await removeTemplateItem(templateId, row.id);
      notify.success('Görev başarıyla silindi');
      void refresh();
    } catch (error) {
      console.error('Error removing item:', error);
      notify.error('Görev silinirken bir hata oluştu');
    }
  };

  const rowActions = (row: ItemRow): RowAction<ItemRow>[] => [
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'primary',
      onClick: (r) => {
        const found = findItem(r.id);
        if (!found) {
          notify.error('Görev bulunamadı');
          return;
        }
        setDialog({ kind: 'edit', ...found });
      },
    },
    {
      key: 'add_child',
      label: 'Alt Görev Ekle',
      icon: 'fas fa-plus',
      color: 'primary',
      hidden: row.isChildItem,
      onClick: (r) => {
        const parent = items.find((i) => i.id === r.id);
        if (!parent) {
          notify.error('Ana görev bulunamadı');
          return;
        }
        setDialog({ kind: 'addChild', parent });
      },
    },
    { key: 'delete', label: 'Sil', icon: 'fas fa-trash', color: 'danger', onClick: (r) => void removeItem(r) },
  ];

  const saveWeight = async (row: ItemRow, value: number) => {
    const weight = Math.trunc(value);
    try {
      await updateTemplateItem(templateId, row.id, { weight });
    } catch (error) {
      console.error('Error updating weight:', error);
      throw new Error(taskTemplateErrorMessage(error, 'Ağırlık güncellenirken bir hata oluştu'), { cause: error });
    }
    queryClient.setQueryData<TemplateItem[]>(taskTemplateKeys.items(templateId), (prev) =>
      prev?.map((item) =>
        item.id === row.id
          ? { ...item, weight }
          : { ...item, children: item.children?.map((c) => (c.id === row.id ? { ...c, weight } : c)) },
      ),
    );
    notify.success('Ağırlık başarıyla güncellendi');
  };

  const data = template.data;
  const onSaved = () => void refresh();

  return (
    <>
      <DetailModal
        opened
        onClose={onClose}
        title={data ? `${data.name} - Görev Yönetimi` : 'Görev Yönetimi'}
        icon="fas fa-tasks"
        size="xl"
        loading={template.isPending || itemsQuery.isPending}
        sections={[
          {
            title: 'Şablon Bilgileri',
            icon: 'fas fa-info-circle',
            content: data ? <TemplateInfo template={data} items={items} /> : null,
          },
          {
            title: 'Görevler',
            icon: 'fas fa-tasks',
            content: (
              <>
                <Group justify="flex-end" mb="sm">
                  <Button size="xs" leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setDialog({ kind: 'add' })}>
                    Ana Görev Ekle
                  </Button>
                </Group>
                <DataTable
                  title="Şablon Görevleri"
                  data={rows}
                  columns={columns}
                  getRowId={(row) => String(row.id)}
                  loading={itemsQuery.isFetching}
                  rowActions={rowActions}
                  sortable
                  striped
                  withColumnBorders
                  verticalSpacing="xs"
                  rowStyle={(row) => (row.isChildItem ? { backgroundColor: 'var(--gk-surface-subtle)' } : undefined)}
                  onCellEdit={({ row, columnKey, value }) =>
                    columnKey === 'weight' && typeof value === 'number' ? saveWeight(row, value) : undefined
                  }
                  emptyMessage="Henüz ana görev eklenmemiş."
                />
              </>
            ),
          },
        ]}
      />
      {dialog?.kind === 'add' ? (
        <AddItemModal
          templateId={templateId}
          items={items}
          departments={departments}
          taskTypes={taskTypes}
          onSaved={onSaved}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <EditItemModal
          templateId={templateId}
          item={dialog.item}
          isChildItem={dialog.isChildItem}
          items={items}
          departments={departments}
          taskTypes={taskTypes}
          onSaved={onSaved}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'addChild' ? (
        <AddChildItemModal
          templateId={templateId}
          parent={dialog.parent}
          taskTypes={taskTypes}
          onSaved={onSaved}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}
