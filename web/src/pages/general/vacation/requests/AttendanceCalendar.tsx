import { ActionIcon, Anchor, Button, Group, Loader, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { myAttendanceMonthlyQueryOptions, type AttendanceDay } from '@/api/general/vacation';
import { formatTime } from '@/lib/format';
import { FaIcon } from '@/ui';
import classes from './AttendanceCalendar.module.css';

// Port of components/attendance-calendar (the only page that used it), with
// the user filter off as requests.js configured it.

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
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
];

const DAY_TYPES: Record<string, string> = {
  working: 'Çalışma',
  weekend: 'Hafta Sonu',
  public_holiday: 'Resmi Tatil',
  leave: 'İzin',
};

const FLAGS: Record<string, string> = {
  absent: 'Devamsızlık',
  pending_approval: 'Giriş Onayı Bekliyor',
  pending_checkout_approval: 'Çıkış Onayı Bekliyor',
};

const LEAVE_TYPES: Record<string, string> = {
  annual_leave: 'Yıllık İzin',
  sick_leave: 'Hastalık İzni',
  unpaid_leave: 'Ücretsiz İzin',
  maternity_leave: 'Doğum İzni',
  paternity_leave: 'Babalık İzni',
  bereavement_leave: 'Mazeret Izni',
};

const RECORD_STATUSES: Record<string, string> = {
  complete: 'Tamamlandı',
  active: 'Aktif',
  leave: 'İzinli',
  pending_override: 'Giriş Onayı Bekliyor',
  pending_checkout_override: 'Çıkış Onayı Bekliyor',
  override_rejected: 'Reddedildi',
  rejected: 'Reddedildi',
};

/** "vr:123" in a leave record's notes names the vacation request behind it. */
export function vacationRequestIdFromNotes(notes: string | null | undefined): string | null {
  const match = /^vr:(\d+)$/i.exec(String(notes ?? '').trim());
  return match ? match[1]! : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

function weekdayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const value = new Date(y!, (m ?? 1) - 1, d);
  return Number.isNaN(value.getTime())
    ? '-'
    : value.toLocaleDateString('tr-TR', { weekday: 'short' });
}

function DayContent({
  day,
  onOpenRequest,
}: {
  day: AttendanceDay;
  onOpenRequest: (id: string) => void;
}) {
  const record = day.record;
  const halfDay = Boolean(day.is_half_day_holiday);
  const out: ReactNode[] = [];

  if (day.holiday_name) {
    out.push(
      <div key="holiday" className={classes.holiday}>
        <FaIcon icon="fas fa-star" style={{ marginRight: 4 }} />
        {halfDay ? `${day.holiday_name} (Yarım Gün Tatil)` : day.holiday_name}
      </div>,
    );
  } else if (halfDay) {
    out.push(
      <div key="holiday" className={classes.holiday}>
        <FaIcon icon="fas fa-star-half-stroke" style={{ marginRight: 4 }} />
        Yarım Gün Tatil
      </div>,
    );
  }

  if (day.day_type === 'leave') {
    const type = record?.leave_type
      ? (LEAVE_TYPES[record.leave_type] ?? record.leave_type.replaceAll('_', ' '))
      : '-';
    out.push(
      <div key="leave" className={classes.strong}>
        <FaIcon icon="fas fa-umbrella-beach" style={{ marginRight: 4 }} />
        {type}
      </div>,
    );
    if (record?.notes) {
      const requestId = vacationRequestIdFromNotes(record.notes);
      out.push(
        requestId ? (
          <div key="notes">
            <Anchor
              component="button"
              type="button"
              size="xs"
              onClick={() => onOpenRequest(requestId)}
            >
              İzin Talebi #{requestId}
            </Anchor>
          </div>
        ) : (
          <div key="notes" style={{ color: 'var(--gk-muted)' }}>
            {record.notes}
          </div>
        ),
      );
    }
    return <>{out}</>;
  }

  if (record) {
    if (record.status) {
      out.push(
        <div key="status" className={classes.strong}>
          {RECORD_STATUSES[record.status] ?? record.status}
        </div>,
      );
    }
    if (record.first_check_in || record.last_check_out) {
      out.push(
        <div key="times">
          <FaIcon
            icon="fas fa-right-to-bracket"
            style={{ marginRight: 4, color: 'var(--mantine-color-green-7)' }}
          />
          {record.first_check_in ? formatTime(record.first_check_in) : '-'}
          <span style={{ margin: '0 4px' }}>-</span>
          <FaIcon
            icon="fas fa-right-from-bracket"
            style={{ marginRight: 4, color: 'var(--mantine-color-red-7)' }}
          />
          {record.last_check_out ? formatTime(record.last_check_out) : '-'}
        </div>,
      );
    }
    if ((record.total_present_minutes || 0) > 0) {
      out.push(
        <div key="present" style={{ color: 'var(--mantine-color-blue-7)' }}>
          {record.total_present_minutes} dk ofiste
        </div>,
      );
    }
    if ((record.overtime_minutes || 0) > 0) {
      out.push(
        <div key="ot" style={{ color: 'var(--mantine-color-green-7)' }}>
          +{record.overtime_minutes} dk mesai
        </div>,
      );
    }
    if ((record.late_minutes || 0) > 0) {
      out.push(
        <div key="late" style={{ color: 'var(--mantine-color-yellow-8)' }}>
          {record.late_minutes} dk gecikme
        </div>,
      );
    }
    if ((record.early_leave_minutes || 0) > 0) {
      out.push(
        <div key="early" style={{ color: 'var(--mantine-color-red-7)' }}>
          {record.early_leave_minutes} dk erken çıkış
        </div>,
      );
    }
  } else if (day.flag === 'absent') {
    out.push(
      <div key="absent" style={{ color: 'var(--mantine-color-red-7)' }}>
        <FaIcon icon="fas fa-user-xmark" style={{ marginRight: 4 }} />
        Kayıt yok (devamsız)
      </div>,
    );
  } else if (day.day_type === 'working') {
    out.push(
      <div key="none" style={{ color: 'var(--gk-muted)' }}>
        Kayıt bulunmuyor
      </div>,
    );
  }

  return out.length ? <>{out}</> : <div style={{ color: 'var(--gk-muted)' }}>-</div>;
}

function DayCard({
  day,
  onOpenRequest,
}: {
  day: AttendanceDay;
  onOpenRequest: (id: string) => void;
}) {
  const type = day.day_type || 'working';
  const halfDay = Boolean(day.is_half_day_holiday);
  return (
    <div
      className={classes.day}
      data-type={type}
      data-half-day={halfDay || undefined}
      title={halfDay && day.holiday_name ? day.holiday_name : undefined}
    >
      <div className={classes.dayHead}>
        <span className={classes.dayNumber}>{day.date.split('-')[2] || '-'}</span>
        <span className={classes.dayWeekday}>{weekdayOf(day.date)}</span>
      </div>
      <div className={classes.chips}>
        <span className={classes.chip} data-kind={type}>
          {DAY_TYPES[type] ?? type}
        </span>
        {halfDay ? (
          <span className={classes.chip} data-kind="half_day">
            Yarım Gün Tatil
          </span>
        ) : null}
        {day.flag ? (
          <span className={classes.chip} data-kind={`flag-${day.flag}`}>
            {FLAGS[day.flag] ?? day.flag}
          </span>
        ) : null}
      </div>
      <div className={classes.content}>
        <DayContent day={day} onOpenRequest={onOpenRequest} />
      </div>
    </div>
  );
}

export interface AttendanceCalendarProps {
  /** A leave day's "İzin Talebi #id" link. */
  onOpenRequest: (requestId: string) => void;
}

/** The signed-in user's month: summary figures and a day grid. */
export function AttendanceCalendar({ onOpenRequest }: AttendanceCalendarProps) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const summary = useQuery(myAttendanceMonthlyQueryOptions(month.year, month.month));

  const step = (delta: number) =>
    setMonth(({ year, month: m }) => {
      const date = new Date(year, m - 1 + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() + 1 };
    });

  const data = summary.data;
  const days = new Map(
    (Array.isArray(data?.days) ? data.days : []).filter((d) => d?.date).map((d) => [d.date, d]),
  );
  const first = new Date(month.year, month.month - 1, 1);
  const daysInMonth = new Date(month.year, month.month, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const figures = data?.summary ?? {};

  let body: ReactNode;
  if (summary.isPending) {
    body = (
      <div className={classes.state}>
        <Loader size="sm" />
        <div>Takvim yükleniyor...</div>
      </div>
    );
  } else if (summary.isError) {
    body = (
      <div className={classes.state}>
        <FaIcon
          icon="fas fa-triangle-exclamation"
          style={{ color: 'var(--gk-danger)', fontSize: 20 }}
        />
        <div>{summary.error.message || 'Bilinmeyen hata'}</div>
      </div>
    );
  } else {
    body = (
      <div className={classes.grid}>
        {WEEKDAYS.map((w) => (
          <div key={w} className={classes.weekday}>
            {w}
          </div>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <div key={`empty-${i}`} className={classes.day} data-type="empty" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const date = `${month.year}-${pad(month.month)}-${pad(i + 1)}`;
          const day = days.get(date) ?? {
            date,
            day_type: 'working',
            holiday_name: null,
            record: null,
            flag: null,
          };
          return <DayCard key={date} day={day} onOpenRequest={onOpenRequest} />;
        })}
      </div>
    );
  }

  return (
    <div className={classes.root}>
      <div className={classes.panel}>
        <div className={classes.toolbar}>
          <Group gap="xs" wrap="nowrap">
            <ActionIcon
              variant="default"
              onClick={() => step(-1)}
              aria-label="Önceki Ay"
              title="Önceki Ay"
            >
              <FaIcon icon="fas fa-chevron-left" />
            </ActionIcon>
            <h5 className={classes.monthTitle}>
              {MONTHS[month.month - 1]} {month.year}
            </h5>
            <ActionIcon
              variant="default"
              onClick={() => step(1)}
              aria-label="Sonraki Ay"
              title="Sonraki Ay"
            >
              <FaIcon icon="fas fa-chevron-right" />
            </ActionIcon>
            <Button
              size="xs"
              variant="light"
              onClick={() => {
                const now = new Date();
                setMonth({ year: now.getFullYear(), month: now.getMonth() + 1 });
              }}
            >
              Bugün
            </Button>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <TextInput
              type="month"
              size="xs"
              aria-label="Ay"
              value={`${month.year}-${pad(month.month)}`}
              onChange={(event) => {
                const [y, m] = event.currentTarget.value
                  .split('-')
                  .map((v) => Number.parseInt(v, 10));
                if (y && m) setMonth({ year: y, month: m });
              }}
            />
            <Button
              size="xs"
              leftSection={<FaIcon icon="fas fa-filter" />}
              disabled={summary.isFetching}
              onClick={() => void summary.refetch()}
            >
              Uygula
            </Button>
          </Group>
        </div>
      </div>

      {data && !summary.isError ? (
        <div className={classes.panel}>
          <h6 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>
            {data.user_display || `Kullanıcı #${data.user_id || '-'}`}
          </h6>
          <div className={classes.summaryGrid}>
            {(
              [
                ['Çalışma Günü', figures.total_working_days ?? 0],
                ['Gelen Gün', figures.total_present ?? 0],
                ['Devamsızlık', figures.total_absent ?? 0],
                ['Fazla Mesai', `${figures.total_overtime_minutes || 0} dk`],
                ['Geç Kalma', `${figures.total_late_minutes || 0} dk`],
                ['Erken Çıkış', `${figures.total_early_leave_minutes || 0} dk`],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className={classes.summaryCard}>
                <div className={classes.summaryLabel}>{label}</div>
                <div className={classes.summaryValue}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className={classes.panel}>{body}</div>
    </div>
  );
}
