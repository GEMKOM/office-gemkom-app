import {
  ActionIcon,
  Button,
  Grid,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { HrUser } from '@/api/human_resources/users';
import {
  createAttendanceHrRecord,
  monthlySummaryKey,
  monthlySummaryQueryOptions,
  type AttendanceDay,
} from '@/api/human_resources/userAttendance';
import { FaIcon, notify, StatusBadge } from '@/ui';
import { userDisplayName } from '../userForm';
import { AttendanceRecordModal } from './AttendanceRecordModal';
import {
  attendanceExport,
  checkIn,
  checkOut,
  dayLeave,
  dayTypeTr,
  flagTr,
  lateMinutes,
  methodIcon,
  methodLabel,
  overtimeMinutes,
  parseNum,
  rowTint,
  safeFilePart,
  timeHM,
  weekdayTr,
} from './attendanceFormat';
import { LeaveIntervalsModal } from './LeaveIntervalsModal';

const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
].map((label, i) => ({ value: String(i + 1), label }));

/** Port of the PDKS Özeti tab: a month of attendance, HR record edits and leave intervals. */
export function AttendanceTab({ user }: { user: HrUser }) {
  const queryClient = useQueryClient();
  const today = new Date();
  const [year, setYear] = useState(String(today.getFullYear()));
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  // The month on screen; Sorgula applies the inputs.
  const [query, setQuery] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const summary = useQuery(monthlySummaryQueryOptions(user.id, query.year, query.month));
  const reload = () => queryClient.invalidateQueries({ queryKey: monthlySummaryKey(user.id) });

  const [editing, setEditing] = useState<{ date: string; day: AttendanceDay } | null>(null);
  const [intervals, setIntervals] = useState<{ recordId: number; date: string } | null>(null);

  const fetchMonth = () => {
    const next = { year: Number(year), month: Number(month) };
    if (next.year === query.year && next.month === query.month) void summary.refetch();
    else setQuery(next);
  };

  const openIntervals = async (day: AttendanceDay) => {
    const date = day.date || '';
    if (!date) return;
    let recordId = day.record?.id ?? null;
    if (!recordId) {
      // Intervals hang off a record: make an empty one for the day first.
      try {
        const created = await createAttendanceHrRecord({ user: user.id, date });
        recordId = created?.id ?? null;
      } catch (error) {
        notify.error(
          `Kayıt oluşturulamadı: ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }
      if (!recordId) {
        notify.error('Kayıt oluşturulamadı');
        return;
      }
      await reload();
    }
    setIntervals({ recordId, date });
  };

  const runExport = async () => {
    if (!summary.data) {
      notify.warning('Önce yoklama özetini sorgulayın.');
      return;
    }
    try {
      const { rows, columns } = attendanceExport(summary.data);
      const name = safeFilePart(userDisplayName(user) || `user_${user.id}`);
      const ym = `${query.year}-${String(query.month).padStart(2, '0')}`;
      const { exportToExcel } = await import('@/ui/DataTable/exportExcel');
      await exportToExcel(rows, columns, { fileName: `PDKSOzeti_${name}_${ym}.xlsx` });
    } catch (error) {
      notify.error(`Dışa aktarılamadı: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const data = summary.data;
  const s = data?.summary || {};
  const days = Array.isArray(data?.days) ? data.days : [];
  const threshold = parseNum(data?.shift_rule?.overtime_threshold_minutes);
  const figures = [
    ['Çalışma Günü', s.total_working_days],
    ['Geldi', s.total_present],
    ['Gelmedi', s.total_absent],
    ['Fazla Mesai (dk)', s.total_overtime_minutes],
    ['Toplam Geç Kalma (dk)', s.total_late_minutes],
  ] as const;

  let daysView;
  if (summary.isPending) {
    daysView = (
      <Text size="sm" c="dimmed">
        <FaIcon icon="fas fa-spinner fa-spin" /> Yükleniyor...
      </Text>
    );
  } else if (summary.isError) {
    daysView = (
      <Text size="sm" c="red">
        PDKS özeti yüklenemedi: {summary.error.message}
      </Text>
    );
  } else if (!days.length) {
    daysView = (
      <Text size="sm" c="dimmed">
        Gün bulunamadı.
      </Text>
    );
  } else {
    daysView = (
      <Table.ScrollContainer minWidth={1000}>
        <Table highlightOnHover verticalSpacing={4} fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Tarih</Table.Th>
              <Table.Th>Gün</Table.Th>
              <Table.Th>Gün Türü</Table.Th>
              <Table.Th>Tatil</Table.Th>
              <Table.Th>Durum Notu</Table.Th>
              <Table.Th ta="center">Yöntem</Table.Th>
              <Table.Th>Giriş</Table.Th>
              <Table.Th>Çıkış</Table.Th>
              <Table.Th ta="right">FM (dk)</Table.Th>
              <Table.Th ta="right">Geç/EÇ (dk)</Table.Th>
              <Table.Th ta="right">İşlem</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {days.map((d, i) => {
              const rec = d.record || null;
              const tint = rowTint(d, threshold);
              let flag: ReactNode = '-';
              if (d.day_type === 'leave') {
                const leave = dayLeave(d);
                flag = (
                  <StatusBadge color={leave.paid === false ? 'grey' : 'green'}>
                    {leave.label}
                  </StatusBadge>
                );
              } else if (d.flag) {
                flag = <StatusBadge color="red">{flagTr(d.flag)}</StatusBadge>;
              }
              return (
                <Table.Tr
                  key={d.date || i}
                  data-family={tint ?? undefined}
                  style={tint ? { background: 'var(--fam-bg)' } : undefined}
                >
                  <Table.Td>{d.date || '-'}</Table.Td>
                  <Table.Td>{weekdayTr(d.weekday)}</Table.Td>
                  <Table.Td>{dayTypeTr(d.day_type)}</Table.Td>
                  <Table.Td>{d.holiday_name || '-'}</Table.Td>
                  <Table.Td>{flag}</Table.Td>
                  <Table.Td ta="center">
                    {rec?.method ? (
                      <Tooltip label={methodLabel(rec)}>
                        <Text span c="dimmed" aria-label={methodLabel(rec)}>
                          <FaIcon icon={methodIcon(rec.method)} />
                        </Text>
                      </Tooltip>
                    ) : (
                      '-'
                    )}
                  </Table.Td>
                  <Table.Td>{rec ? timeHM(checkIn(rec)) : '-'}</Table.Td>
                  <Table.Td>{rec ? timeHM(checkOut(rec)) : '-'}</Table.Td>
                  <Table.Td ta="right">{overtimeMinutes(rec)}</Table.Td>
                  <Table.Td ta="right">{lateMinutes(rec)}</Table.Td>
                  <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>
                    <Button
                      size="compact-xs"
                      variant={rec ? 'default' : 'light'}
                      color={rec ? undefined : 'green'}
                      leftSection={<FaIcon icon="fas fa-edit" />}
                      disabled={!d.date}
                      onClick={() => d.date && setEditing({ date: d.date, day: d })}
                    >
                      {rec ? 'Düzenle' : 'Ekle'}
                    </Button>
                    <Tooltip label="İzin Aralıkları">
                      <ActionIcon
                        ml={4}
                        size="sm"
                        variant="default"
                        aria-label="İzin Aralıkları"
                        onClick={() => void openIntervals(d)}
                      >
                        <FaIcon icon="fas fa-person-walking-arrow-right" />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    );
  }

  return (
    <Stack gap="md">
      <Text fw={600}>Aylık PDKS Özeti</Text>
      <Grid gap="sm" align="flex-end">
        <Grid.Col span={{ base: 6, md: 3 }}>
          <TextInput
            size="xs"
            label="Yıl"
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.currentTarget.value)}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 6, md: 3 }}>
          <Select
            size="xs"
            label="Ay"
            data={MONTHS}
            allowDeselect={false}
            value={month}
            onChange={(v) => setMonth(v ?? month)}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Button
            size="xs"
            fullWidth
            leftSection={<FaIcon icon="fas fa-search" />}
            onClick={fetchMonth}
          >
            Sorgula
          </Button>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Button
            size="xs"
            variant="default"
            fullWidth
            leftSection={<FaIcon icon="fas fa-download" />}
            onClick={() => void runExport()}
          >
            Excel’e Aktar
          </Button>
        </Grid.Col>
      </Grid>

      {data ? (
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="xs">
          {figures.map(([label, value]) => (
            <Paper key={label} withBorder p="xs" radius="md">
              <Text size="xs" c="dimmed">
                {label}
              </Text>
              <Text size="sm" fw={600}>
                {value ?? '-'}
              </Text>
            </Paper>
          ))}
        </SimpleGrid>
      ) : null}

      {daysView}

      {editing ? (
        <AttendanceRecordModal
          userId={user.id}
          date={editing.date}
          record={editing.day.record ?? null}
          shiftStart={data?.shift_rule?.expected_start || ''}
          shiftEnd={data?.shift_rule?.expected_end || ''}
          onSaved={reload}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {intervals ? (
        <LeaveIntervalsModal
          recordId={intervals.recordId}
          date={intervals.date}
          onChanged={() => void reload()}
          onClose={() => setIntervals(null)}
        />
      ) : null}
    </Stack>
  );
}
