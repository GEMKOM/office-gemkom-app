import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { formatDate } from '@/lib/format';
import { isoDate } from '@/lib/workdays';
import { useAppNavigate } from '@/shell/AppLink';
import { endOccasionPreview, startOccasionPreview, useOccasionPreview } from '@/shell/occasion';
import { PageHeader, Panel } from '@/ui';
import { CompanyDaysPanel, type DayEditing } from './CompanyDaysPanel';
import { DesignEditor } from './design/DesignEditor';
import css from './SpecialDaysPreviewPage.module.css';
import { YearCalendarPanel } from './YearCalendarPanel';

type Tab = 'takvim' | 'tasarim' | 'onizleme';

const TABS: { value: Tab; label: string }[] = [
  { value: 'takvim', label: 'Takvim' },
  { value: 'tasarim', label: 'Tasarım' },
  { value: 'onizleme', label: 'Önizleme' },
];

/**
 * İnsan Kaynakları > Özel Günler, in three parts (?bolum=):
 *   Takvim    the year's holidays and special days, when each welcome shows,
 *             and the company's own days
 *   Tasarım   every day's welcome and band (?gun=day:12 opens one)
 *   Önizleme  HR picks a day and the app behaves as if it were that day, the
 *             way impersonation shows the app as another user; a strip on
 *             every page ends it, and it lasts for this tab
 */
export function SpecialDaysPreviewPage() {
  const navigate = useAppNavigate();
  const [params, setParams] = useSearchParams();
  const raw = params.get('bolum');
  const tab: Tab = raw === 'tasarim' || raw === 'onizleme' ? raw : 'takvim';
  const designKey = params.get('gun');
  const [editing, setEditing] = useState<DayEditing>(null);

  const start = (date: string) => {
    startOccasionPreview(date);
    navigate('/');
  };
  const openTab = (next: Tab) => setParams(next === 'takvim' ? {} : { bolum: next });
  const openDesign = (id: number) => setParams({ bolum: 'tasarim', gun: `day:${id}` });

  return (
    <>
      <PageHeader
        title="Özel Günler"
        subtitle="Her günün karşılama ekranını ve bant rengini düzenleyin"
        icon="fas fa-cake-candles"
        actions={
          <div className={css.tabs} role="tablist" aria-label="Özel Günler bölümleri">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                className={css.tab}
                data-on={tab === t.value || undefined}
                onClick={() => openTab(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      />
      {tab === 'tasarim' ? (
        <DesignEditor key={designKey ?? 'first'} initialKey={designKey} onPreview={start} />
      ) : tab === 'onizleme' ? (
        <PreviewPanel onStart={start} />
      ) : (
        <>
          <YearCalendarPanel onPreview={start} onEditDay={openDesign} />
          <CompanyDaysPanel
            onPreview={start}
            onDesign={openDesign}
            editing={editing}
            onEditingChange={setEditing}
          />
        </>
      )}
    </>
  );
}

function PreviewPanel({ onStart }: { onStart: (date: string) => void }) {
  const preview = useOccasionPreview();
  const [day, setDay] = useState(() => preview ?? isoDate(new Date()));
  return (
    <Panel title="Önizleme" icon="fas fa-eye" className={css.narrow}>
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
            if (day) onStart(day);
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
  );
}
