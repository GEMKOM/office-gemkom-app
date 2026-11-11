import { Button, SegmentedControl } from '@mantine/core';
import { useState } from 'react';
import { useSpecialDayCalendar, type CalendarDay } from '@/api/general/specialDays';
import { formatDate } from '@/lib/format';
import { isoDate } from '@/lib/workdays';
import { Panel, PendingValue, StatusBadge, type StatusFamily } from '@/ui';
import css from './SpecialDaysPreviewPage.module.css';
import { CATEGORY_LABEL, MONTHS } from './specialDayText';

const CATEGORY_FAMILY: Record<string, StatusFamily> = {
  company: 'purple',
  national: 'red',
  religious: 'green',
  international: 'blue',
};

function kindBadge(row: CalendarDay) {
  if (row.kind === 'public_holiday') {
    return row.theme === 'religious' ? (
      <StatusBadge color="green">Dini bayram</StatusBadge>
    ) : (
      <StatusBadge color="red">Milli bayram</StatusBadge>
    );
  }
  const category = row.category ?? 'company';
  return (
    <StatusBadge color={CATEGORY_FAMILY[category] ?? 'grey'}>
      {CATEGORY_LABEL[category] ?? 'Özel gün'}
    </StatusBadge>
  );
}

function dayRange(row: CalendarDay): string {
  const long = { day: 'numeric', month: 'long', weekday: 'long' } as const;
  if (!row.end_date || row.end_date === row.date) return formatDate(row.date, long);
  return `${formatDate(row.date, { day: 'numeric', month: 'long' })} - ${formatDate(row.end_date, long)}`;
}

/** Rows grouped by the month they start in, months in order. */
export function groupByMonth(rows: CalendarDay[]): { month: number; rows: CalendarDay[] }[] {
  const groups = new Map<number, CalendarDay[]>();
  for (const row of rows) {
    const month = Number(row.date.slice(5, 7));
    groups.set(month, [...(groups.get(month) ?? []), row]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([month, list]) => ({ month, rows: list }));
}

export interface YearCalendarPanelProps {
  onPreview: (date: string) => void;
  /** Opens the company day's editor. */
  onEditDay: (id: number) => void;
}

/**
 * Yılın Özel Günleri: every public holiday and company day of this year or
 * the next, by month. Days already past are muted.
 */
export function YearCalendarPanel({ onPreview, onEditDay }: YearCalendarPanelProps) {
  const today = isoDate(new Date());
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const calendar = useSpecialDayCalendar(year);
  const groups = groupByMonth(calendar.data ?? []);

  return (
    <Panel
      title="Yılın Özel Günleri"
      icon="fas fa-calendar-days"
      padded={false}
      actions={
        <SegmentedControl
          size="xs"
          value={String(year)}
          onChange={(value) => setYear(Number(value))}
          data={[String(thisYear), String(thisYear + 1)]}
          aria-label="Yıl"
        />
      }
    >
      {calendar.isPending ? (
        <div className={css.empty}>
          <PendingValue />
        </div>
      ) : calendar.isError ? (
        <p className={css.empty}>Özel günler yüklenemedi.</p>
      ) : groups.length === 0 ? (
        <p className={css.empty}>{year} için bir bayram ya da şirket günü yok.</p>
      ) : (
        <div data-testid="year-calendar">
          {groups.map((group) => (
            <section key={group.month} aria-label={`${MONTHS[group.month - 1]} ${year}`}>
              <h3 className={css.monthHead}>{MONTHS[group.month - 1]}</h3>
              <ul className={css.list}>
                {group.rows.map((row) => {
                  const past = (row.end_date || row.date) < today;
                  const isToday = row.date <= today && today <= (row.end_date || row.date);
                  const label = `${row.name} ${formatDate(row.date, { day: 'numeric', month: 'long' })}`;
                  return (
                    <li
                      key={row.key}
                      className={past ? `${css.row} ${css.rowPast}` : css.row}
                      data-past={past || undefined}
                    >
                      <span className={css.rowText}>
                        <span className={css.rowName}>
                          {row.name}
                          {row.is_half_day ? ' (yarım gün)' : ''}
                        </span>
                        <span className={css.rowDate}>{dayRange(row)}</span>
                      </span>
                      {isToday ? <StatusBadge color="yellow">Bugün</StatusBadge> : null}
                      {kindBadge(row)}
                      <span className={css.rowActions}>
                        {row.kind === 'special_day' && row.id !== undefined ? (
                          <Button
                            size="compact-sm"
                            variant="default"
                            onClick={() => onEditDay(row.id as number)}
                            aria-label={`${label} düzenle`}
                          >
                            <i className="fas fa-pen" aria-hidden />
                          </Button>
                        ) : null}
                        <Button
                          size="compact-sm"
                          variant="default"
                          onClick={() => onPreview(row.date)}
                          aria-label={`${label} önizle`}
                        >
                          Önizle
                        </Button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}
