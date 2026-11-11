import { Button } from '@mantine/core';
import { useState } from 'react';
import {
  useUpcomingDays,
  type ColleagueOccasion,
  type UpcomingDay,
} from '@/api/general/specialDays';
import { addDaysIso } from '@/lib/workdays';
import { formatDate } from '@/lib/format';
import { DEPARTMENT_LABELS } from '@/pages/home/shortcuts';
import { Panel } from '@/ui';
import { CelebrateButton } from './CelebrateButton';
import { OccasionWelcome, useTodayOccasions } from './OccasionLayer';
import { personDayLabel } from './occasionModel';
import classes from './occasion.module.css';

const UPCOMING_DAYS = 14;
const UPCOMING_ROWS = 5;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase('tr'))
    .join('');
}

function personMeta(person: {
  department_code?: string | null;
  position_title?: string | null;
}): string {
  const department = person.department_code ? DEPARTMENT_LABELS[person.department_code] : null;
  return [department, person.position_title].filter(Boolean).join(' · ') || '-';
}

function upcomingLabel(row: UpcomingDay): string {
  if (row.kind === 'birthday' || row.kind === 'work_anniversary') {
    const what = row.kind === 'birthday' ? 'doğum günü' : `${row.years ?? ''}. yıl`;
    return `${row.full_name ?? '-'}, ${what}`;
  }
  return row.is_half_day ? `${row.name} (yarım gün)` : row.name;
}

function upcomingWhen(row: UpcomingDay, today: string): string {
  if (row.date === addDaysIso(today, 1)) return 'Yarın';
  const short = { day: 'numeric', month: 'short' } as const;
  const start = formatDate(row.date, short);
  return row.end_date && row.end_date !== row.date
    ? `${start} - ${formatDate(row.end_date, short)}`
    : start;
}

function Person({ person }: { person: ColleagueOccasion }) {
  return (
    <li className={classes.person}>
      <span
        className={classes.avatar}
        data-family={person.kind === 'birthday' ? 'purple' : 'blue'}
        aria-hidden
      >
        {initials(person.full_name)}
      </span>
      <span className={classes.personText}>
        <span className={classes.personName}>{person.full_name}</span>
        <span className={classes.personMeta}>
          {personDayLabel(person.kind, person.years)} · {personMeta(person)}
        </span>
      </span>
      <CelebrateButton person={person} />
    </li>
  );
}

/**
 * "Özel Günler" on the home page: the celebrations the user received today,
 * colleagues with a birthday or work anniversary today (with Kutla), and the
 * next two weeks. Hidden on a day with nothing to show.
 */
export function SpecialDaysPanel() {
  const today = useTodayOccasions();
  const upcoming = useUpcomingDays(UPCOMING_DAYS, today.preview);
  const [reading, setReading] = useState(false);

  const data = today.data;
  if (!data) return null;
  const own = data.occasions.find((o) => o.kind === 'birthday' || o.kind === 'work_anniversary');
  const received = own ? data.received.filter((r) => r.kind === own.kind) : [];
  const later = (upcoming.data ?? []).filter((row) => row.date > data.date).slice(0, UPCOMING_ROWS);
  if (!own && data.colleagues.length === 0 && later.length === 0) return null;

  return (
    <Panel title="Özel Günler" icon="fas fa-cake-candles">
      {own ? (
        <>
          <h3 className={classes.section}>{own.name}</h3>
          <p className={classes.received}>
            {received.length > 0
              ? `${received.length} kişi sizi kutladı.`
              : 'Henüz bir kutlama mesajı yok.'}
          </p>
          {received.length > 0 ? (
            <Button size="compact-sm" variant="default" onClick={() => setReading(true)}>
              Mesajları Gör
            </Button>
          ) : null}
          {reading ? (
            <OccasionWelcome
              occasion={own}
              date={data.date}
              received={received}
              onClose={() => setReading(false)}
            />
          ) : null}
        </>
      ) : null}
      {data.colleagues.length > 0 ? (
        <>
          <h3 className={classes.section}>Bugün kutlananlar</h3>
          <ul className={classes.people}>
            {data.colleagues.map((person) => (
              <Person key={`${person.user_id}-${person.kind}`} person={person} />
            ))}
          </ul>
        </>
      ) : null}
      {later.length > 0 ? (
        <>
          <h3 className={classes.section}>Yaklaşan günler</h3>
          <ul className={classes.upcoming}>
            {later.map((row) => (
              <li key={`${row.kind}-${row.key ?? row.user_id}-${row.date}`}>
                <span>{upcomingLabel(row)}</span>
                <span className={classes.upcomingWhen}>{upcomingWhen(row, data.date)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Panel>
  );
}
