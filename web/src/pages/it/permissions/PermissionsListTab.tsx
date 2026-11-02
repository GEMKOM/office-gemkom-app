import { Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { positionKeys, positionsQueryOptions, type Position } from '@/api/human_resources/organization';
import {
  permissionsListQueryOptions,
  permissionsMatrixQueryOptions,
  positionCodenames,
  type PositionDetail,
} from '@/api/it/permissions';
import { DataTable, notify, type DataTableColumn } from '@/ui';
import { SectionBadge } from './permissionsMeta';
import css from './PermissionsPage.module.css';

interface PermissionRow {
  codename: string;
  name: string;
  section: string;
  position_count: number;
  user_count: number;
  positions_display: string;
  users_display: string;
  overrides_display: string;
}

const EMPTY_ROWS: PermissionRow[] = [];

const columns: DataTableColumn<PermissionRow>[] = [
  {
    key: 'section',
    header: 'Bölüm',
    width: 120,
    render: (row) => <SectionBadge section={row.section} />,
  },
  {
    key: 'name',
    header: 'Yetki',
    width: 240,
    render: (row) => (
      <>
        <div style={{ fontWeight: 600 }}>{row.name}</div>
        <div className={css.code}>{row.codename}</div>
      </>
    ),
  },
  { key: 'position_count', header: 'Pozisyon', width: 90, align: 'right' },
  { key: 'user_count', header: 'Kullanıcı', width: 90, align: 'right' },
  { key: 'positions_display', header: 'Pozisyonlar', sortable: false },
  { key: 'users_display', header: 'Kullanıcılar', sortable: false },
  {
    key: 'overrides_display',
    header: 'Bireysel',
    sortable: false,
    render: (row) =>
      row.overrides_display !== '-' ? (
        <Text span size="sm" c="orange.8">
          {row.overrides_display}
        </Text>
      ) : (
        '-'
      ),
  },
];

const positionLabel = (p: Position) => `${p.title} (L${p.level ?? ''})`;

/**
 * Which positions hold each permission: from the list's permission_codenames
 * when the backend sends them, otherwise only from positions whose detail was
 * opened on the Pozisyonlar tab (legacy positionPermsCache).
 */
function usePositionsByPermission(positions: Position[] | undefined): Map<string, Position[]> {
  const queryClient = useQueryClient();
  // Read from the cache as the tab renders; the tab mounts fresh on each visit.
  const codesById = new Map<number, string[]>();
  for (const [, detail] of queryClient.getQueriesData<PositionDetail>({ queryKey: [...positionKeys.all, 'detail'] })) {
    if (detail) codesById.set(Number(detail.id), positionCodenames(detail));
  }
  const byPerm = new Map<string, Position[]>();
  for (const p of positions ?? []) {
    const codes = Array.isArray(p.permission_codenames) ? p.permission_codenames : codesById.get(Number(p.id));
    for (const code of codes ?? []) {
      const list = byPerm.get(code) ?? [];
      list.push(p);
      byPerm.set(code, list);
    }
  }
  return byPerm;
}

/** The Yetkiler tab: every permission with the positions and users that hold it. */
export function PermissionsListTab() {
  const list = useQuery(permissionsListQueryOptions());
  const positions = useQuery(positionsQueryOptions());
  // Only for the fallback when /users/permissions/ fails, as legacy.
  const matrix = useQuery({ ...permissionsMatrixQueryOptions(), enabled: list.isError });
  const positionsByPerm = usePositionsByPermission(positions.data);

  useEffect(() => {
    if (list.isError) notify.error(list.error, { fallback: 'Yetki listesi yüklenirken hata oluştu' });
  }, [list.isError, list.error]);

  // Small (one row per permission); rebuilt each render with the cached details.
  const rows = ((): PermissionRow[] => {
    const display = (code: string) => {
      const held = positionsByPerm.get(code) ?? [];
      return { position_count: held.length, positions_display: held.length ? held.map(positionLabel).join(', ') : '-' };
    };
    let out: PermissionRow[] = [];
    if (list.data?.length) {
      out = list.data.map((p) => {
        const users = Array.isArray(p.users) ? p.users : [];
        const overrides = Array.isArray(p.overrides) ? p.overrides : [];
        return {
          codename: p.codename,
          name: p.name || p.codename,
          section: p.section || p.portal || 'other',
          ...display(p.codename),
          user_count: users.length,
          users_display: users.length ? users.map((u) => u.username).join(', ') : '-',
          overrides_display: overrides.length
            ? overrides.map((o) => `${o.username}(${o.granted ? '+' : '-'})`).join(', ')
            : '-',
        };
      });
    } else if (matrix.data) {
      out = matrix.data.codenames.map((code) => {
        const holders = matrix.data.users.filter((u) => u.permissions?.[code]?.value === true);
        return {
          codename: code,
          name: code,
          section: 'other',
          ...display(code),
          user_count: holders.length,
          users_display: holders.map((u) => u.username).join(', ') || '-',
          overrides_display: '-',
        };
      });
    }
    return out.sort((a, b) => a.section.localeCompare(b.section, 'tr') || a.name.localeCompare(b.name, 'tr'));
  })();

  return (
    <DataTable
      title="Yetkiler"
      icon="fas fa-key"
      data={list.data || matrix.data ? rows : EMPTY_ROWS}
      columns={columns}
      getRowId={(row) => row.codename}
      loading={list.isFetching || positions.isFetching}
      sortable
      emptyMessage="Yetki bulunamadı."
      onRefresh={() => {
        void list.refetch();
        void positions.refetch();
      }}
    />
  );
}
