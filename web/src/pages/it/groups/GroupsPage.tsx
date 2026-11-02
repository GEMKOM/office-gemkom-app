import { Button, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  organizationGroupsQueryOptions,
  useDeleteOrganizationGroup,
  usePatchOrganizationGroup,
  usePositionsCatalog,
  type OrganizationGroup,
} from '@/api/it/organizationGroups';
import {
  confirm,
  DataTable,
  FaIcon,
  notify,
  PageHeader,
  StatusBadge,
  type DataTableColumn,
  type RowAction,
} from '@/ui';
import { GroupDetailPanel } from './GroupDetailPanel';
import { GroupFormModal } from './GroupFormModal';
import css from './GroupsPage.module.css';

const EMPTY_ROWS: OrganizationGroup[] = [];

function shortDescription(value: string | null | undefined): string {
  const text = String(value || '').trim();
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

// Legacy columns; every one sorts the loaded rows.
const columns: DataTableColumn<OrganizationGroup>[] = [
  { key: 'name', header: 'Ad', render: (row) => <strong>{row.name || '-'}</strong> },
  {
    key: 'description',
    header: 'Açıklama',
    render: (row) =>
      shortDescription(row.description) || (
        <Text span c="dimmed" size="sm">
          -
        </Text>
      ),
  },
  { key: 'position_count', header: 'Pozisyon', accessor: (row) => Number(row.position_count || 0), align: 'right' },
  { key: 'member_count', header: 'Üye', accessor: (row) => Number(row.member_count || 0), align: 'right' },
  {
    key: 'is_active',
    header: 'Durum',
    accessor: (row) => row.is_active !== false,
    render: (row) =>
      row.is_active !== false ? (
        <StatusBadge color="green">Aktif</StatusBadge>
      ) : (
        <StatusBadge color="grey">Pasif</StatusBadge>
      ),
    exportValue: (row) => (row.is_active !== false ? 'Aktif' : 'Pasif'),
  },
];

/** Port of it/groups (groups.js): organization groups and their positions. */
export function GroupsPage() {
  const list = useQuery(organizationGroupsQueryOptions());
  const positions = usePositionsCatalog();
  const groups = list.data ?? EMPTY_ROWS;

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<OrganizationGroup | null>(null);

  useEffect(() => {
    if (list.isError) notify.error(list.error, { fallback: 'Gruplar yüklenemedi.' });
  }, [list.isError, list.error]);
  useEffect(() => {
    if (positions.isError) notify.error(positions.error, { fallback: 'Pozisyon listesi yüklenemedi.' });
  }, [positions.isError, positions.error]);

  // A group that left the list (deleted elsewhere) closes its detail, as legacy loadGroups did.
  const detailId = selectedId !== null && list.data && !groups.some((g) => g.id === selectedId) ? null : selectedId;

  const stats = useMemo(
    () => ({
      total: groups.length,
      active: groups.filter((g) => g.is_active !== false).length,
      positions: groups.reduce((sum, g) => sum + Number(g.position_count || 0), 0),
      members: groups.reduce((sum, g) => sum + Number(g.member_count || 0), 0),
    }),
    [groups],
  );

  const patch = usePatchOrganizationGroup();
  const remove = useDeleteOrganizationGroup();

  const toggle = async (group: OrganizationGroup) => {
    const active = group.is_active !== false;
    const ok = await confirm({
      title: active ? 'Grubu Pasifleştir' : 'Grubu Aktifleştir',
      message: `"${group.name || ''}" ${active ? 'pasifleştirilecek' : 'aktifleştirilecek'}.`,
      description: 'Devam etmek istediğinize emin misiniz?',
      confirmLabel: active ? 'Pasifleştir' : 'Aktifleştir',
      icon: 'fas fa-power-off',
    });
    if (!ok) return;
    try {
      await patch.mutateAsync({ id: group.id, data: { is_active: !active } });
      notify.success('Grup durumu güncellendi.');
    } catch (error) {
      notify.error(error, { fallback: 'Grup güncellenemedi.' });
    }
  };

  const deleteGroup = async (group: OrganizationGroup) => {
    const ok = await confirm({
      title: 'Grubu Sil',
      subtitle: 'Bu işlem geri alınamaz',
      icon: 'fas fa-trash',
      message: `"${group.name}" kalıcı olarak silinecek.`,
      description: 'Bu işlem geri alınamaz. Devam edilsin mi?',
      confirmLabel: 'Sil',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(group.id);
      notify.success('Grup silindi.');
      if (selectedId === group.id) setSelectedId(null);
    } catch (error) {
      notify.error(error, { fallback: 'Grup silinemedi.' });
    }
  };

  const rowActions = (): RowAction<OrganizationGroup>[] => [
    { key: 'detail', label: 'Detay', icon: 'fas fa-eye', color: 'info', onClick: (row) => setSelectedId(row.id) },
    { key: 'edit', label: 'Düzenle', icon: 'fas fa-edit', color: 'primary', onClick: (row) => setEditing(row) },
    { key: 'toggle', label: 'Durum', icon: 'fas fa-power-off', color: 'warning', onClick: (row) => void toggle(row) },
    { key: 'delete', label: 'Sil', icon: 'fas fa-trash', color: 'danger', onClick: (row) => void deleteGroup(row) },
  ];

  const figure = (value: number) => (list.isPending ? '–' : value.toLocaleString('tr-TR'));
  const positionCatalog = positions.data ?? [];

  return (
    <>
      <PageHeader
        title="Organizasyon Grupları"
        subtitle="Grupları yönetin, pozisyonları toplu atayın"
        icon="fas fa-object-group"
        backTo="/it/"
        stats={[
          { id: 'stat-total', label: 'Toplam Grup', value: figure(stats.total) },
          { id: 'stat-active', label: 'Aktif', value: figure(stats.active) },
          { id: 'stat-positions', label: 'Gruplardaki Pozisyon', value: figure(stats.positions) },
          { id: 'stat-members', label: 'Çözümlenmiş Üye', value: figure(stats.members) },
        ]}
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
            Yeni Grup
          </Button>
        }
      />

      <div className={css.layout}>
        <DataTable
          title="Organizasyon Grupları"
          icon="fas fa-object-group"
          data={groups}
          columns={columns}
          getRowId={(row) => String(row.id)}
          loading={list.isFetching}
          sortable
          rowActions={rowActions}
          onRowClick={(row) => setSelectedId(row.id)}
          emptyMessage="Grup bulunamadı."
          onRefresh={() => void list.refetch()}
        />
        <GroupDetailPanel groupId={detailId} positions={positionCatalog} />
      </div>

      {creating ? (
        <GroupFormModal
          positions={positionCatalog}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            if (id) setSelectedId(id);
          }}
        />
      ) : null}
      {editing ? (
        <GroupFormModal
          key={editing.id}
          group={editing}
          positions={positionCatalog}
          onClose={() => setEditing(null)}
          onSaved={(id) => setSelectedId(id)}
        />
      ) : null}
    </>
  );
}
