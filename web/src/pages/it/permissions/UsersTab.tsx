import { Badge, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { permissionsMatrixQueryOptions, type MatrixUser } from '@/api/it/permissions';
import { DataTable, FaIcon, notify, Panel, type DataTableColumn } from '@/ui';
import { grantedCount, PositionDisplay } from './permissionsMeta';
import css from './PermissionsPage.module.css';
import { UserPermissionsPanel } from './UserPermissionsPanel';

interface UserRow {
  id: number;
  username: string;
  full_name: string;
  is_superuser: boolean;
  /** null for a superuser, who has everything. */
  permission_count: number | null;
  user: MatrixUser;
}

const EMPTY_ROWS: UserRow[] = [];

const columns: DataTableColumn<UserRow>[] = [
  {
    key: 'username',
    header: 'Kullanıcı Adı',
    width: 160,
    render: (row) => (
      <>
        <strong>{row.username || '-'}</strong>
        {row.is_superuser ? (
          <Badge color="red" size="sm" radius="sm" ml={4} tt="none">
            Süper
          </Badge>
        ) : null}
      </>
    ),
  },
  { key: 'full_name', header: 'Ad Soyad', width: 200 },
  {
    key: 'position',
    header: 'Pozisyon',
    sortable: false,
    render: (row) => <PositionDisplay user={row.user} />,
    exportValue: (row) => row.user.position_title ?? '',
  },
  {
    key: 'permission_count',
    header: 'Yetki',
    width: 80,
    // A superuser sorts above everyone, as "all".
    accessor: (row) => row.permission_count ?? Number.MAX_SAFE_INTEGER,
    render: (row) =>
      row.is_superuser ? (
        <Badge color="red" size="sm" radius="sm" tt="none">
          Tümü
        </Badge>
      ) : (
        String(row.permission_count ?? 0)
      ),
    exportValue: (row) => (row.is_superuser ? 'Tümü' : row.permission_count),
  },
];

/** The Kullanıcılar tab: every user and the selected user's permissions. */
export function UsersTab() {
  const matrix = useQuery(permissionsMatrixQueryOptions());
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (matrix.isError) notify.error(matrix.error, { fallback: 'Kullanıcı listesi yüklenirken hata oluştu' });
  }, [matrix.isError, matrix.error]);

  const rows = useMemo<UserRow[]>(() => {
    if (!matrix.data) return EMPTY_ROWS;
    const { codenames, users } = matrix.data;
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      full_name: u.full_name || u.username,
      is_superuser: Boolean(u.is_superuser),
      permission_count: grantedCount(u, codenames),
      user: u,
    }));
  }, [matrix.data]);

  return (
    <div className={css.layout}>
      <DataTable
        title="Kullanıcılar"
        icon="fas fa-users"
        data={rows}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={matrix.isFetching}
        sortable
        onRowClick={(row) => setSelectedId(row.id)}
        rowStyle={(row) => (row.id === selectedId ? { background: 'var(--gk-red-050)' } : undefined)}
        emptyMessage="Kullanıcı bulunamadı."
        onRefresh={() => void matrix.refetch()}
      />
      {selectedId === null ? (
        <Panel className={css.detail}>
          <Stack align="center" gap={6} py="lg" c="dimmed">
            <FaIcon icon="fas fa-mouse-pointer" style={{ fontSize: 22 }} />
            <Text size="sm">Yetkilerini görmek için listeden bir kullanıcı seçin.</Text>
          </Stack>
        </Panel>
      ) : (
        <UserPermissionsPanel key={selectedId} userId={selectedId} matrix={matrix.data} />
      )}
    </div>
  );
}
