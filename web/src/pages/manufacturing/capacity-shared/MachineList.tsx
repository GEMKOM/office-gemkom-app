import { Group, Text } from '@mantine/core';
import { useMemo } from 'react';
import { DataTable, type DataTableColumn } from '@/ui';

export interface MachineListItem {
  id: number | string;
  name: string;
  tasks_count?: number | null;
}

export interface MachineListProps {
  machines: readonly MachineListItem[];
  selectedId: string;
  onSelect: (machine: MachineListItem) => void;
  loading?: boolean;
  onRefresh?: () => void;
  /** Legacy CNC / history lists show the task count in a badge. */
  showCount?: boolean;
  title?: string;
}

/** The machine column of the planners (legacy machines-table-container). */
export function MachineList({
  machines,
  selectedId,
  onSelect,
  loading,
  onRefresh,
  showCount = false,
  title = 'Makineler',
}: MachineListProps) {
  const columns = useMemo<DataTableColumn<MachineListItem>[]>(
    () => [
      {
        key: 'name',
        header: 'Makineler',
        sortable: true,
        render: (row) => (
          <Group gap={8} wrap="nowrap">
            {showCount ? (
              <Text span size="xs" fw={600} ff="monospace" c="dimmed" miw={22} ta="right">
                {row.tasks_count ?? 0}
              </Text>
            ) : null}
            <Text span size="sm" fw={String(row.id) === selectedId ? 600 : 400} truncate>
              {row.name}
            </Text>
          </Group>
        ),
      },
    ],
    [showCount, selectedId],
  );
  return (
    <DataTable
      title={title}
      icon="fas fa-industry"
      data={machines}
      columns={columns}
      getRowId={(row) => String(row.id)}
      loading={loading}
      onRowClick={onSelect}
      onRefresh={onRefresh}
      rowStyle={(row) =>
        String(row.id) === selectedId
          ? { background: 'var(--gk-red-050)', boxShadow: 'inset 3px 0 0 var(--gk-red-700)' }
          : { cursor: 'pointer' }
      }
      extraData={selectedId}
      emptyMessage="Makine bulunamadı"
    />
  );
}
