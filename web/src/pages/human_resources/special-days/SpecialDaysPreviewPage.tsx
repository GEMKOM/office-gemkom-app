import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { useUpcomingDays, type UpcomingDay } from '@/api/general/specialDays';
import { formatDate } from '@/lib/format';
import { isoDate } from '@/lib/workdays';
import { useAppNavigate } from '@/shell/AppLink';
import { endOccasionPreview, startOccasionPreview, useOccasionPreview } from '@/shell/occasion';
import { PageHeader, Panel, PendingValue, StatusBadge, type StatusFamily } from '@/ui';
import { CelebrationTemplatesPanel } from './CelebrationTemplatesPanel';
import { CompanyDaysPanel } from './CompanyDaysPanel';
import css from './SpecialDaysPreviewPage.module.css';

const UPCOMING_DAYS = 60;

const KIND_LABEL: Record<string, { label: string; family: StatusFamily }> = {
  national: { label: 'Milli bayram', family: 'red' },
  religious: { label: 'Dini bayram', family: 'green' },
  company: { label: 'Şirket günü', family: 'purple' },
  soft: { label: 'Özel gün', family: 'purple' },
};

function kindBadge(row: UpcomingDay) {
  const meta = KIND_LABEL[row.theme] ?? { label: 'Özel gün', family: 'grey' as StatusFamily };
  return <StatusBadge color={meta.family}>{meta.label}</StatusBadge>;
}

function dayRange(row: UpcomingDay): string {
  const long = { day: 'numeric', month: 'long', weekday: 'long' } as const;
  if (!row.end_date || row.end_date === row.date) return formatDate(row.date, long);
  return `${formatDate(row.date, { day: 'numeric', month: 'long' })} - ${formatDate(row.end_date, long)}`;
}

/**
 * İnsan Kaynakları > Özel Günler: HR picks a day and the app behaves as if it
 * were that day (band theme, welcome, the home panel), the way impersonation
 * shows the app as another user. A strip on every page names the day and
 * ends the preview; it lasts for this tab. Below, HR edits the greeting texts
 * and the company's own days, which the backend serves to everyone.
 */
export function SpecialDaysPreviewPage() {
  const navigate = useAppNavigate();
  const preview = useOccasionPreview();
  const [day, setDay] = useState(() => preview ?? isoDate(new Date()));
  // Holidays and company days only: colleagues' birthdays are not a day to preview.
  const upcoming = useUpcomingDays(UPCOMING_DAYS);
  const days = (upcoming.data ?? []).filter(
    (row) => row.kind === 'public_holiday' || row.kind === 'special_day',
  );

  const start = (date: string) => {
    startOccasionPreview(date);
    navigate('/');
  };

  return (
    <>
      <PageHeader
        title="Özel Günler"
        subtitle="Kutlama metinlerini ve şirket özel günlerini düzenleyin, uygulamanın o gün nasıl görüneceğini önizleyin"
        icon="fas fa-cake-candles"
      />
      <div className={css.grid}>
        <Panel title="Önizleme" icon="fas fa-eye">
          <Stack gap="md">
            <Text size="sm" c="var(--gk-ink-2)">
              Seçtiğiniz gün için bant rengi, karşılama ekranı ve ana sayfadaki Özel Günler bölümü o
              gündeymiş gibi görünür. Önizleme yalnızca bu sekmede sürer ve kutlama gönderilmez.
            </Text>
            {preview ? (
              <div className={css.active} data-testid="preview-active">
                <span>
                  Şu an önizlenen gün:{' '}
                  <strong>
                    {formatDate(preview, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      weekday: 'long',
                    })}
                  </strong>
                </span>
                <Button size="compact-sm" variant="default" onClick={endOccasionPreview}>
                  Önizlemeyi Bitir
                </Button>
              </div>
            ) : null}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (day) start(day);
              }}
            >
              <Group align="flex-end" gap="sm">
                <TextInput
                  type="date"
                  label="Gün"
                  value={day}
                  onChange={(event) => setDay(event.currentTarget.value)}
                  required
                  w={200}
                />
                <Button
                  type="submit"
                  leftSection={<i className="fas fa-eye" aria-hidden />}
                  disabled={!day}
                >
                  Bu Günü Önizle
                </Button>
              </Group>
            </form>
          </Stack>
        </Panel>

        <Panel title="Yaklaşan Özel Günler" icon="fas fa-calendar-day" padded={false}>
          {upcoming.isPending ? (
            <div className={css.empty}>
              <PendingValue />
            </div>
          ) : upcoming.isError ? (
            <p className={css.empty}>Özel günler yüklenemedi.</p>
          ) : days.length === 0 ? (
            <p className={css.empty}>
              Önümüzdeki {UPCOMING_DAYS} günde bir bayram ya da şirket günü yok.
            </p>
          ) : (
            <ul className={css.list}>
              {days.map((row) => (
                <li key={`${row.key ?? row.name}-${row.date}`} className={css.row}>
                  <span className={css.rowText}>
                    <span className={css.rowName}>
                      {row.name}
                      {row.is_half_day ? ' (yarım gün)' : ''}
                    </span>
                    <span className={css.rowDate}>{dayRange(row)}</span>
                  </span>
                  {kindBadge(row)}
                  <Button
                    size="compact-sm"
                    variant="default"
                    onClick={() => start(row.date)}
                    aria-label={`${row.name} önizle`}
                  >
                    Önizle
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <CelebrationTemplatesPanel />
      <CompanyDaysPanel onPreview={start} />
    </>
  );
}
