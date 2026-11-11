import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchCompanyDays, specialDayEditKeys } from '@/api/general/specialDays';
import { formatDate } from '@/lib/format';
import { isoDate } from '@/lib/workdays';
import { useAppNavigate } from '@/shell/AppLink';
import { endOccasionPreview, startOccasionPreview, useOccasionPreview } from '@/shell/occasion';
import { PageHeader, Panel, errorMessage, notify } from '@/ui';
import { CelebrationTemplatesPanel } from './CelebrationTemplatesPanel';
import { CompanyDaysPanel, type DayEditing } from './CompanyDaysPanel';
import css from './SpecialDaysPreviewPage.module.css';
import { YearCalendarPanel } from './YearCalendarPanel';

/**
 * İnsan Kaynakları > Özel Günler: HR picks a day and the app behaves as if it
 * were that day (band theme, welcome, the home panel), the way impersonation
 * shows the app as another user. A strip on every page names the day and
 * ends the preview; it lasts for this tab. Beside it, the year's holidays and
 * company days; around it, HR edits the greeting texts and the company's own
 * days, which the backend serves to everyone.
 */
export function SpecialDaysPreviewPage() {
  const navigate = useAppNavigate();
  const preview = useOccasionPreview();
  const [day, setDay] = useState(() => preview ?? isoDate(new Date()));
  const [editing, setEditing] = useState<DayEditing>(null);
  const queryClient = useQueryClient();

  // The year list knows a company day by id; the editor needs the whole row.
  const editDay = async (id: number) => {
    try {
      const all = await queryClient.ensureQueryData({
        queryKey: specialDayEditKeys.days(null),
        queryFn: ({ signal }) => fetchCompanyDays(null, signal),
      });
      const row = all.find((d) => d.id === id);
      if (row) setEditing(row);
      else notify.error('Bu özel gün bulunamadı.');
    } catch (error) {
      notify.error(errorMessage(error, 'Özel gün yüklenemedi.'));
    }
  };

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
        <div className={css.column}>
          <Panel title="Önizleme" icon="fas fa-eye">
            <Stack gap="md">
              <Text size="sm" c="var(--gk-ink-2)">
                Seçtiğiniz gün için bant rengi, karşılama ekranı ve ana sayfadaki Özel Günler bölümü
                o gündeymiş gibi görünür. Önizleme yalnızca bu sekmede sürer ve kutlama gönderilmez.
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
          <CelebrationTemplatesPanel />
        </div>
        <YearCalendarPanel onPreview={start} onEditDay={(id) => void editDay(id)} />
      </div>
      <CompanyDaysPanel onPreview={start} editing={editing} onEditingChange={setEditing} />
    </>
  );
}
