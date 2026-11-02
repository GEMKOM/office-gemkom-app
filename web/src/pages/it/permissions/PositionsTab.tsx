import { Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { positionsQueryOptions } from '@/api/human_resources/organization';
import { DataTable, FaIcon, notify, Panel, StatusBadge, type DataTableColumn } from '@/ui';
import { LevelPill } from './permissionsMeta';
import css from './PermissionsPage.module.css';
import { PositionPermissionsPanel } from './PositionPermissionsPanel';

interface PositionRow {
  id: number;
  title: string;
  level: number | null;
  department_name: string;
  parent_title: string;
  holder_count: number;
  permission_count: number;
  is_active: boolean;
}

const EMPTY_ROWS: PositionRow[] = [];

const columns: DataTableColumn<PositionRow>[] = [
  {
    key: 'title',
    header: 'Pozisyon',
    render: (row) => (
      <>
        <strong>{row.title}</strong>
        {row.level ? (
          <>
            {' '}
            <LevelPill level={row.level} />
          </>
        ) : null}
      </>
    ),
  },
  { key: 'department_name', header: 'Departman', width: 180 },
  { key: 'parent_title', header: 'Bağlı Olduğu', width: 180 },
  { key: 'holder_count', header: 'Kişi', width: 70, align: 'right' },
  { key: 'permission_count', header: 'Yetki', width: 70, align: 'right' },
  {
    key: 'is_active',
    header: 'Durum',
    width: 90,
    render: (row) =>
      row.is_active ? <StatusBadge color="green">Aktif</StatusBadge> : <StatusBadge color="grey">Pasif</StatusBadge>,
    exportValue: (row) => (row.is_active ? 'Aktif' : 'Pasif'),
  },
];

/** The Pozisyonlar tab: positions by level, and the selected one's permission editor. */
export function PositionsTab({
  expandedSections,
  onExpandedSectionsChange,
}: {
  expandedSections: string[];
  onExpandedSectionsChange: (sections: string[]) => void;
}) {
  const positions = useQuery(positionsQueryOptions());
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (positions.isError) notify.error(positions.error, { fallback: 'Pozisyon listesi yüklenirken hata oluştu' });
  }, [positions.isError, positions.error]);

  const rows = useMemo<PositionRow[]>(
    () =>
      (positions.data ?? [])
        .map((p) => ({
          id: p.id,
          title: p.title || '-',
          level: p.level ?? null,
          department_name: String(p.department_name || p.department_code || '-'),
          parent_title: String(p.parent_title || '-'),
          holder_count: Number(p.holder_count || 0),
          permission_count: Number(p.permission_count || 0),
          is_active: p.is_active !== false,
        }))
        .sort((a, b) => Number(a.level || 0) - Number(b.level || 0) || a.title.localeCompare(b.title, 'tr')),
    [positions.data],
  );

  const selected = rows.find((r) => r.id === selectedId);

  return (
    <div className={css.layout}>
      <DataTable
        title="Pozisyon Listesi"
        icon="fas fa-sitemap"
        data={positions.data ? rows : EMPTY_ROWS}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={positions.isFetching}
        sortable
        onRowClick={(row) => setSelectedId(row.id)}
        rowStyle={(row) => (row.id === selectedId ? { background: 'var(--gk-red-050)' } : undefined)}
        emptyMessage="Pozisyon bulunamadı."
        onRefresh={() => void positions.refetch()}
      />
      {selectedId === null ? (
        <Panel className={css.detail}>
          <Stack align="center" gap={6} py="lg" c="dimmed">
            <FaIcon icon="fas fa-mouse-pointer" style={{ fontSize: 22 }} />
            <Text size="sm">Yetkilerini düzenlemek için listeden bir pozisyon seçin.</Text>
          </Stack>
        </Panel>
      ) : (
        <PositionPermissionsPanel
          key={selectedId}
          positionId={selectedId}
          fallbackTitle={selected?.title ?? '-'}
          expandedSections={expandedSections}
          onExpandedSectionsChange={onExpandedSectionsChange}
        />
      )}
    </div>
  );
}
