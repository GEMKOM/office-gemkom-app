import { Accordion, Alert, Badge, Group, List, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { isApiError } from '@/api/client';
import type { TimerModule } from '@/api/manufacturing/counts';
import {
  userTaskDetailQueryOptions,
  type TaskTotals,
  type UserReportDates,
  type UserTaskDetail,
  type UserTaskRow,
} from '@/api/manufacturing/userReport';
import {
  DataTable,
  DetailModal,
  FaIcon,
  notify,
  type DataTableColumn,
  type DetailSection,
} from '@/ui';
import { detailColumns, withDay, type ActivityRow, type UserReportRow } from './userReportColumns';

const NOT_IN_TEAM: Record<TimerModule, string> = {
  machining: 'Kullanıcı bulunamadı veya talaşlı imalat ekibinde değil',
  cnc_cutting: 'Kullanıcı bulunamadı veya CNC kesim ekibinde değil',
};

function days(detail: UserTaskDetail | undefined) {
  if (!detail) return [];
  if (Array.isArray(detail.days)) return detail.days;
  if (Array.isArray(detail.results)) return detail.results;
  return [];
}

/** Legacy enrichTaskRow: fills a row's missing totals from task_totals. */
function enrich(row: ActivityRow, totals: TaskTotals): ActivityRow {
  const t = row.task_key ? totals[row.task_key] : undefined;
  if (!t) return row;
  return {
    ...row,
    estimated_hours: row.estimated_hours ?? t.estimated_hours,
    total_hours_spent: row.total_hours_spent ?? t.total_hours_spent,
    parts_count: row.parts_count ?? t.parts_count,
  };
}

function rowId(row: UserTaskRow, index: number) {
  return `${row.timer_id ?? row.task_key ?? 'row'}-${row.start_time ?? ''}-${index}`;
}

function DetailTable({
  rows,
  columns,
  empty,
  emptyIcon,
}: {
  rows: ActivityRow[];
  columns: DataTableColumn<ActivityRow>[];
  empty: string;
  emptyIcon: string;
}) {
  if (rows.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="md">
        <FaIcon icon={`fas ${emptyIcon}`} style={{ marginRight: 8 }} />
        {empty}
      </Text>
    );
  }
  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={rowId}
      sortable
      verticalSpacing="xs"
      emptyMessage="Kayıt yok"
    />
  );
}

function Count({ n }: { n: number }) {
  return (
    <Badge color="gray" variant="light" ml={6}>
      {n}
    </Badge>
  );
}

export interface UserDetailModalProps {
  module: TimerModule;
  user: UserReportRow;
  dates: UserReportDates;
  onClose: () => void;
}

/** Port of showUserDetails: warnings, then the tasks / idle / hold tables of the range. */
export function UserDetailModal({ module, user, dates, onClose }: UserDetailModalProps) {
  const userId = (user.id ?? user.user_id) as number;
  const detail = useQuery(userTaskDetailQueryOptions(module, userId, dates));

  useEffect(() => {
    if (!detail.isError) return;
    notify.error(
      isApiError(detail.error) && detail.error.status === 404
        ? NOT_IN_TEAM[module]
        : 'Detay verisi yüklenirken hata oluştu',
    );
    onClose();
  }, [detail.isError, detail.error, module, onClose]);

  const tables = useMemo(() => {
    const list = days(detail.data);
    const totals = detail.data?.task_totals || detail.data?.taskTotals || {};
    const tasks: ActivityRow[] = [];
    const idle: ActivityRow[] = [];
    const hold: ActivityRow[] = [];
    for (const day of list) {
      const date = day.date || day.day || '';
      (day.tasks ?? []).forEach((t) => tasks.push(enrich(withDay(t, date), totals)));
      (day.idle_periods ?? []).forEach((i) => idle.push(withDay(i, date)));
      (day.hold_tasks ?? []).forEach((h) => hold.push(enrich(withDay(h, date), totals)));
    }
    return {
      dayCount: list.length,
      tasks,
      idle,
      hold,
      columns: detailColumns(module, list.length > 1),
    };
  }, [detail.data, module]);

  const title = `${user._displayName}${user.first_name && user.last_name ? ` (@${user.username})` : ''}`;

  const sections: DetailSection[] = [
    {
      title: 'Uyarılar',
      icon: 'fas fa-exclamation-triangle',
      hidden: user._warnings.length === 0,
      content: (
        <Alert color="yellow" variant="light">
          <List size="sm">
            {user._warnings.map((warning) => (
              <List.Item key={warning}>{warning}</List.Item>
            ))}
          </List>
        </Alert>
      ),
    },
  ];
  if (detail.data && tables.dayCount === 0) {
    sections.push({
      content: (
        <Text c="dimmed" ta="center" py="md">
          <FaIcon icon="fas fa-inbox" style={{ marginRight: 8 }} />
          Seçilen aralıkta gösterilecek kayıt yok
        </Text>
      ),
    });
  } else if (detail.data) {
    sections.push({
      content: (
        <Accordion multiple variant="separated">
          <Accordion.Item value="tasks">
            <Accordion.Control icon={<FaIcon icon="fas fa-tasks" />}>
              <Group gap={0}>
                Görevler
                <Count n={tables.tasks.length} />
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <DetailTable
                rows={tables.tasks}
                columns={tables.columns.tasks}
                empty="Görev kaydı yok"
                emptyIcon="fa-inbox"
              />
            </Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item value="idle">
            <Accordion.Control icon={<FaIcon icon="fas fa-hourglass-half" />}>
              <Group gap={0}>
                Boşta geçen zaman
                <Count n={tables.idle.length} />
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <DetailTable
                rows={tables.idle}
                columns={tables.columns.idle}
                empty="Boşta geçen dönem yok"
                emptyIcon="fa-check-circle"
              />
            </Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item value="hold">
            <Accordion.Control icon={<FaIcon icon="fas fa-pause-circle" />}>
              <Group gap={0}>
                Bekleme görevleri
                <Count n={tables.hold.length} />
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <DetailTable
                rows={tables.hold}
                columns={tables.columns.hold}
                empty="Bekleme görevi yok"
                emptyIcon="fa-inbox"
              />
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      ),
    });
  }

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={title}
      icon="fas fa-user"
      size="xl"
      loading={detail.isPending}
      sections={sections}
    />
  );
}
