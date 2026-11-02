import { Button } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_STALE_TIME } from '@/api/queryClient';
import { useUsers, type UserOption } from '@/api/reference/users';
import {
  useDeleteWeldingTeam,
  weldingTeamErrorMessage,
  weldingTeamKeys,
  weldingTeamsQueryOptions,
  type WeldingTeam,
  type WeldingTeamsParams,
} from '@/api/welding/teams';
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
import { weldingTeamColumns } from './columns';
import { exportWeldingTeams } from './exportWeldingTeams';
import { foremanId } from './teamFields';
import { WeldingTeamFormModal } from './WeldingTeamFormModal';

// Every piece of page state lives in the URL (legacy read none of it).
const URL_DEFAULTS = {
  name: '',
  foreman: '',
  is_active: '',
  page: '1',
  page_size: '20',
  ordering: 'name',
};

type FilterKeys = 'name' | 'foreman' | 'is_active';
type FilterState = Record<FilterKeys, string>;

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'name', label: 'Ekip Adı', placeholder: 'Ekip adı ara...', span: 4 },
  { type: 'text', key: 'foreman', label: 'Ustabaşı', placeholder: 'Ustabaşı adı ara...', span: 4 },
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
    span: 4,
  },
];

const EMPTY_FILTERS: FilterState = { name: '', foreman: '', is_active: '' };
const EMPTY_ROWS: WeldingTeam[] = [];
const EMPTY_USERS: UserOption[] = [];

/** Legacy getFilterPayload: both text filters go to `search`, joined by a space. */
function filterParams(values: FilterState): WeldingTeamsParams {
  const params: WeldingTeamsParams = {};
  const tokens = [values.name, values.foreman].map((v) => v.trim()).filter(Boolean);
  if (tokens.length > 0) params.search = tokens.join(' ');
  if (values.is_active) params.is_active = values.is_active === 'true';
  return params;
}

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Port of manufacturing/welding/teams (teams.js). */
export function WeldingTeamsPage() {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);

  const filters = useMemo<FilterState>(
    () => ({ name: values.name, foreman: values.foreman, is_active: values.is_active }),
    [values.name, values.foreman, values.is_active],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering || 'name');
  const ordering = toOrdering(sort.sortBy, sort.sortDir);

  const params: WeldingTeamsParams = {
    ...filterParams(filters),
    page,
    page_size: pageSize,
    ordering,
  };
  const list = useQuery({
    ...weldingTeamsQueryOptions(params),
    staleTime: DEFAULT_STALE_TIME,
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError)
      notify.error(weldingTeamErrorMessage(list.error, 'Ekipler yüklenirken hata oluştu'));
  }, [list.isError, list.error, list.errorUpdatedAt]);

  // Legacy loadUsers: the pickers and the names of plain-id members.
  const usersQuery = useUsers();
  const users = usersQuery.data ?? EMPTY_USERS;
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  useEffect(() => {
    if (usersQuery.isError) notify.warning('Kullanıcı listesi yüklenemedi');
  }, [usersQuery.isError]);

  const columns = useMemo(() => weldingTeamColumns(usersById), [usersById]);

  // Active / with-foreman are counted on the loaded page, as legacy did.
  const stats = useMemo(
    () => ({
      active: rows.filter((t) => t.is_active).length,
      withForeman: rows.filter((t) => foremanId(t) !== null).length,
    }),
    [rows],
  );

  // ---- create / edit ----
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<WeldingTeam | null>(null);

  // ---- delete (the backend deactivates the team) ----
  const remove = useDeleteWeldingTeam();
  const deleteTeam = async (row: WeldingTeam) => {
    const ok = await confirm({
      title: 'Ekip Silme Onayı',
      icon: 'fas fa-exclamation-triangle',
      message: `"${row.name}" adlı ekip pasif duruma alınacaktır. Devam etmek istiyor musunuz?`,
      confirmLabel: 'Sil',
      cancelLabel: 'Kapat',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(row.id);
      notify.success('Ekip başarıyla silindi');
      apply({ page: '1' });
    } catch (error) {
      console.error('Error deleting team:', error);
      notify.error(weldingTeamErrorMessage(error, 'Ekip silinirken hata oluştu'));
    }
  };

  // Same two actions on every row; each gets its row from DataTable.
  const rowActions = (): RowAction<WeldingTeam>[] => [
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'primary',
      onClick: (r) => setEditing(r),
    },
    {
      key: 'delete',
      label: 'Sil',
      icon: 'fas fa-trash',
      color: 'danger',
      onClick: (r) => void deleteTeam(r),
    },
  ];

  // ---- export ----
  const [exporting, setExporting] = useState(false);
  const runExport = async () => {
    setExporting(true);
    try {
      await exportWeldingTeams({ ...filterParams(filters), ordering }, usersById);
      notify.success('Dışa aktarma başarılı');
    } catch (error) {
      console.error('Error exporting teams:', error);
      notify.error('Dışa aktarma sırasında hata oluştu');
    } finally {
      setExporting(false);
    }
  };

  const refresh = () => {
    // Legacy refresh goes back to page 1 and reloads.
    if (page === 1) {
      void list.refetch();
    } else {
      void queryClient.invalidateQueries({ queryKey: weldingTeamKeys.all, refetchType: 'none' });
      apply({ page: '1' });
    }
  };

  const figure = (value: number) => (list.isPending ? '–' : value.toLocaleString('tr-TR'));

  return (
    <>
      <PageHeader
        title="Kaynak Ekipleri"
        subtitle="Ekip, ustabaşı ve üye atamalarını yönetin"
        icon="users"
        backTo="/manufacturing/welding/"
        stats={[
          { id: 'total-teams-count', label: 'Toplam Ekip', value: figure(total) },
          { id: 'active-teams-count', label: 'Aktif Ekip', value: figure(stats.active) },
          {
            id: 'foreman-teams-count',
            label: 'Ustabaşı Atanmış',
            value: figure(stats.withForeman),
          },
        ]}
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
            Yeni Ekip
          </Button>
        }
      />

      <DataTable
        title="Ekip Listesi"
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
        emptyMessage="Ekip bulunamadı"
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

      {creating ? (
        <WeldingTeamFormModal
          users={users}
          onClose={() => setCreating(false)}
          // Legacy goes back to page 1 after a create.
          onSaved={() => apply({ page: '1' })}
        />
      ) : null}

      {editing ? (
        <WeldingTeamFormModal
          key={editing.id}
          team={editing}
          users={users}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
