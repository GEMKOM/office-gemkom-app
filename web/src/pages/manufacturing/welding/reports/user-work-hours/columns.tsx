import { Button, Group, HoverCard, ScrollArea, Stack, Text } from '@mantine/core';
import type { OvertimeBucket, UserWorkHoursRow } from '@/api/welding/userWorkHours';
import { formatNumber, toDate, toNumber } from '@/lib/format';
import { FaIcon, type DataTableColumn } from '@/ui';
import uiClasses from '@/ui/ui.module.css';

/** Legacy calculateWeekdays: Monday to Friday between the two days, both included. */
export function countWeekdays(start: string, end: string): number {
  const from = toDate(start);
  const to = toDate(end);
  if (!from || !to) return 0;
  const current = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const last = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  let weekdays = 0;
  while (current <= last) {
    const day = current.getDay();
    if (day >= 1 && day <= 5) weekdays++;
    current.setDate(current.getDate() + 1);
  }
  return weekdays;
}

/** Legacy: 9 hours for every weekday in the range. */
export const HOURS_PER_WEEKDAY = 9;

const hours2 = (value: number) => formatNumber(value, 2);

/** The job-number badge; hovering it lists the jobs (legacy Bootstrap popover). */
function JobNosBadge({ jobNos }: { jobNos: string[] }) {
  if (jobNos.length === 0) return null;
  return (
    <HoverCard position="top" withinPortal shadow="md" openDelay={100}>
      <HoverCard.Target>
        <Button
          size="compact-xs"
          variant="default"
          leftSection={<FaIcon icon="fas fa-list" />}
          aria-label={`İş Numaraları (${jobNos.length})`}
          style={{ flexShrink: 0 }}
        >
          {jobNos.length}
        </Button>
      </HoverCard.Target>
      <HoverCard.Dropdown maw={300}>
        <Text size="sm" fw={600}>
          İş Numaraları ({jobNos.length}):
        </Text>
        <ScrollArea.Autosize mah={200} mt="xs" type="auto">
          <Stack gap={4}>
            {jobNos.map((jobNo, index) => (
              <span key={`${jobNo}-${index}`} className={uiClasses.code}>
                {jobNo}
              </span>
            ))}
          </Stack>
        </ScrollArea.Autosize>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}

/** Legacy formatRegularHoursCell: actual / expected, red with Eksik / Fazla when they differ. */
function RegularHoursCell({ bucket, expected }: { bucket?: OvertimeBucket; expected: number }) {
  const actual = toNumber(bucket?.hours);
  if (!actual) {
    if (expected > 0) {
      return (
        <Group gap={6} wrap="nowrap">
          <Text fw={700} c="red.7">
            0/{expected}
          </Text>
          <Text size="xs" c="dimmed">
            saat
          </Text>
        </Group>
      );
    }
    return <>-</>;
  }

  // A 0.01 hour tolerance, as legacy.
  const off = expected > 0 && Math.abs(actual - expected) > 0.01;
  const status = off ? (actual < expected ? 'Eksik' : 'Fazla') : '';
  return (
    <Group gap="xs" wrap="nowrap">
      <div>
        <Text fw={700} c={off ? 'red.7' : undefined}>
          {expected > 0 ? `${hours2(actual)}/${expected}` : `${hours2(actual)} saat`}
        </Text>
        {status ? (
          <Text size="xs" c="dimmed">
            {status}
          </Text>
        ) : null}
      </div>
      <JobNosBadge jobNos={bucket?.job_nos ?? []} />
    </Group>
  );
}

/** Legacy formatOvertimeCell. */
function OvertimeCell({ bucket, color }: { bucket?: OvertimeBucket; color: string }) {
  const value = toNumber(bucket?.hours);
  if (!value) return <>-</>;
  return (
    <Group gap="xs" wrap="nowrap">
      <Text fw={700} c={color}>
        {hours2(value)} saat
      </Text>
      <JobNosBadge jobNos={bucket?.job_nos ?? []} />
    </Group>
  );
}

const bucketHours = (bucket?: OvertimeBucket) => toNumber(bucket?.hours) ?? 0;

/** The legacy table's columns; the regular column compares with `expected` hours. */
export function userWorkHoursColumns(expected: number): DataTableColumn<UserWorkHoursRow>[] {
  return [
    {
      key: 'employee_full_name',
      header: 'Çalışan',
      sortable: true,
      width: '20%',
      accessor: (row) => row.employee_full_name || row.employee_username || '',
      render: (row) => (
        <div>
          <Text size="sm" fw={600}>
            {row.employee_full_name || row.employee_username || '-'}
          </Text>
          {row.employee_username ? (
            <Text size="xs" c="dimmed">
              {row.employee_username}
            </Text>
          ) : null}
        </div>
      ),
    },
    {
      key: 'total_hours',
      header: 'Toplam Saat',
      sortable: true,
      width: '12%',
      accessor: (row) => toNumber(row.total_hours),
      render: (row) => {
        const total = toNumber(row.total_hours);
        return total === null ? (
          '-'
        ) : (
          <Text fw={700} c="blue.7" fz="md">
            {hours2(total)}
          </Text>
        );
      },
    },
    {
      key: 'regular_hours',
      header: 'Normal (1x)',
      sortable: false,
      width: '22%',
      accessor: (row) => bucketHours(row.by_overtime_type?.regular),
      render: (row) => (
        <RegularHoursCell bucket={row.by_overtime_type?.regular} expected={expected} />
      ),
    },
    {
      key: 'after_hours',
      header: 'Fazla Mesai (1.5x)',
      sortable: false,
      width: '22%',
      accessor: (row) => bucketHours(row.by_overtime_type?.after_hours),
      render: (row) => <OvertimeCell bucket={row.by_overtime_type?.after_hours} color="yellow.8" />,
    },
    {
      key: 'holiday_hours',
      header: 'Tatil (2x)',
      sortable: false,
      width: '22%',
      accessor: (row) => bucketHours(row.by_overtime_type?.holiday),
      render: (row) => <OvertimeCell bucket={row.by_overtime_type?.holiday} color="red.7" />,
    },
  ];
}
