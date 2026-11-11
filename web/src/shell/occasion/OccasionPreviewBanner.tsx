import { Button } from '@mantine/core';
import { formatDate } from '@/lib/format';
import { AppLink } from '@/shell/AppLink';
import { FaIcon } from '@/ui/FaIcon';
import classes from './occasion.module.css';
import { endOccasionPreview, useOccasionPreview } from './previewStore';

export const SPECIAL_DAYS_PAGE = '/human_resources/special-days';

/**
 * On every page while an HR preview runs, like the impersonation strip: which
 * day the app is pretending it is, and a way out.
 */
export function OccasionPreviewBanner() {
  const preview = useOccasionPreview();
  if (!preview) return null;
  const day = formatDate(preview, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
  });
  return (
    <div className={classes.previewBanner} role="status" data-testid="occasion-preview-banner">
      <FaIcon icon="fas fa-eye" aria-hidden />
      <span className={classes.previewText}>
        Özel gün önizlemesi: uygulama <strong>{day}</strong> günündeymiş gibi görünüyor. Kutlama
        gönderilmez.
      </span>
      <AppLink to={SPECIAL_DAYS_PAGE} className={classes.previewLink}>
        Günü Değiştir
      </AppLink>
      <Button size="compact-sm" variant="default" onClick={endOccasionPreview}>
        Önizlemeyi Bitir
      </Button>
    </div>
  );
}
