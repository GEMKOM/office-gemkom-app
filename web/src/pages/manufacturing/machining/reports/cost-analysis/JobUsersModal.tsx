import { Anchor, Group, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import {
  jobCostDetailsQueryOptions,
  type JobCostIssue,
  type JobCostUserRow,
} from '@/api/manufacturing/costAnalysis';
import { formatNumber } from '@/lib/format';
import {
  DataTable,
  DetailModal,
  FaIcon,
  notify,
  StatusBadge,
  type DataTableColumn,
  type StatusFamily,
} from '@/ui';
import { euro, hoursOf, sumHours } from './costFormat';

interface UserCostRow {
  user: string;
  weekday_work_hours: number;
  after_hours_hours: number;
  sunday_hours: number;
  total_hours: number;
  weekday_work_cost: number;
  after_hours_cost: number;
  sunday_cost: number;
  total_cost: number;
  cost_per_hour: number;
  issues: JobCostIssue[];
}

function toUserRow(user: JobCostUserRow): UserCostRow {
  const total = sumHours(user.hours);
  const totalCost = user.total_cost || 0;
  return {
    user: user.user,
    weekday_work_hours: user.hours?.weekday_work || 0,
    after_hours_hours: user.hours?.after_hours || 0,
    sunday_hours: user.hours?.sunday || 0,
    total_hours: total,
    weekday_work_cost: user.costs?.weekday_work || 0,
    after_hours_cost: user.costs?.after_hours || 0,
    sunday_cost: user.costs?.sunday || 0,
    total_cost: totalCost,
    // Legacy never filled this column in (it always read €0.00).
    cost_per_hour: total > 0 ? totalCost / total : 0,
    issues: user.issues ?? [],
  };
}

const ISSUE_COLORS: Record<string, StatusFamily> = {
  completed: 'green',
  in_progress: 'blue',
  waiting: 'red',
};

function IssueLinks({ issues }: { issues: JobCostIssue[] }) {
  if (issues.length === 0) return <>-</>;
  return (
    <Group gap={4}>
      {issues.map((issue) => (
        <Anchor
          key={issue.key}
          href={`/manufacturing/machining/tasks/list/?task=${encodeURIComponent(issue.key)}`}
          target="_blank"
          rel="noopener noreferrer"
          underline="never"
        >
          <StatusBadge color={ISSUE_COLORS[issue.status ?? ''] ?? 'grey'}>{issue.key}</StatusBadge>
        </Anchor>
      ))}
    </Group>
  );
}

const num = (
  key: keyof UserCostRow,
  header: string,
  format: (v: number) => string,
  bold = false,
): DataTableColumn<UserCostRow> => ({
  key,
  header,
  align: 'right',
  render: (row) => (
    <Text span size="sm" fw={bold ? 700 : undefined}>
      {format(row[key] as number)}
    </Text>
  ),
});

const columns: DataTableColumn<UserCostRow>[] = [
  {
    key: 'user',
    header: 'Kullanıcı',
    render: (row) => (
      <Text span size="sm" fw={700}>
        {row.user}
      </Text>
    ),
  },
  num('weekday_work_hours', 'Hafta İçi Saat', hoursOf),
  num('after_hours_hours', 'Mesai Saat', hoursOf),
  num('sunday_hours', 'Pazar Saat', hoursOf),
  num('total_hours', 'Toplam Saat', hoursOf, true),
  num('weekday_work_cost', 'Hafta İçi Maliyet', euro),
  num('after_hours_cost', 'Mesai Maliyet', euro),
  num('sunday_cost', 'Pazar Maliyet', euro),
  num('total_cost', 'Toplam Maliyet', euro, true),
  num('cost_per_hour', 'Saat Başı Maliyet', euro, true),
  {
    key: 'issues',
    header: 'İş Anahtarları',
    sortable: false,
    render: (row) => <IssueLinks issues={row.issues} />,
  },
];

const saat = (value: number) => `${formatNumber(value, 1)} saat`;

/** Port of showUserDetails in costAnalysis.js: per-user hours and costs of one job. */
export function JobUsersModal({ jobNo, onClose }: { jobNo: string; onClose: () => void }) {
  const details = useQuery(jobCostDetailsQueryOptions(jobNo));

  useEffect(() => {
    if (details.isError) {
      notify.error('Kullanıcı detayları yüklenirken bir hata oluştu.');
      onClose();
    }
  }, [details.isError, onClose]);

  const rows = useMemo(() => (details.data ?? []).map(toUserRow), [details.data]);
  const totals = useMemo(() => {
    const sum = (pick: (r: UserCostRow) => number) =>
      rows.reduce((total, row) => total + pick(row), 0);
    const totalCost = sum((r) => r.total_cost);
    const weekday = sum((r) => r.weekday_work_hours);
    const after = sum((r) => r.after_hours_hours);
    const sunday = sum((r) => r.sunday_hours);
    const totalHours = weekday + after + sunday;
    return {
      totalCost,
      weekday,
      after,
      sunday,
      totalHours,
      overtimeCost: sum((r) => r.after_hours_cost + r.sunday_cost),
      costPerHour: totalHours > 0 ? totalCost / totalHours : 0,
    };
  }, [rows]);

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`${jobNo} - Kullanıcı Detayları`}
      icon="fas fa-users"
      size="xl"
      loading={details.isPending}
      sections={[
        {
          title: 'Özet',
          icon: 'fas fa-chart-pie',
          fields: [
            { label: 'Toplam Kullanıcı', value: rows.length, type: 'number', span: 3 },
            { label: 'Toplam Maliyet', render: euro(totals.totalCost), span: 3 },
            { label: 'Mesai Maliyeti', render: euro(totals.overtimeCost), span: 3 },
            { label: 'Saat Başı Maliyet', render: euro(totals.costPerHour), span: 3 },
            { label: 'Hafta İçi Saat', render: saat(totals.weekday), span: 3 },
            { label: 'Mesai Saat', render: saat(totals.after), span: 3 },
            { label: 'Pazar Saat', render: saat(totals.sunday), span: 3 },
            { label: 'Toplam Saat', render: saat(totals.totalHours), span: 3 },
          ],
        },
        details.isSuccess && rows.length === 0
          ? {
              title: 'Kullanıcı Detayları',
              icon: 'fas fa-table',
              content: (
                <Text c="dimmed" ta="center" py="lg" size="sm">
                  <FaIcon icon="fas fa-info-circle" style={{ marginRight: 8 }} />
                  Bu iş için kullanıcı detayı bulunamadı.
                </Text>
              ),
            }
          : {
              content: (
                <DataTable
                  title="Kullanıcı Detayları"
                  icon="fas fa-users"
                  data={rows}
                  columns={columns}
                  getRowId={(row) => row.user}
                  loading={details.isFetching}
                  sortable
                />
              ),
            },
      ]}
    />
  );
}
