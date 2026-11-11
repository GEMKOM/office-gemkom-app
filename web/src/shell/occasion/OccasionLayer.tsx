import { Button, Modal } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import {
  useSpecialDaysToday,
  type Occasion,
  type ReceivedCelebration,
} from '@/api/general/specialDays';
import { useAuth } from '@/auth/AuthProvider';
import { isoDate } from '@/lib/workdays';
import { bandLook, occasionDesign, occasionKicker, occasionNumeral } from './design';
import {
  cachedBand,
  cachedTheme,
  cacheTheme,
  markSeen,
  markSeenInPreview,
  pendingWelcomes,
  primaryOccasion,
} from './occasionModel';
import classes from './occasion.module.css';
import { useOccasionPreview, useOccasionPreviewScope } from './previewStore';
import { WelcomeTemplate } from './WelcomeTemplate';

/**
 * Today's occasions, for the layer and for pages (the home band, its panel);
 * during an HR preview, the previewed day's.
 */
export function useTodayOccasions() {
  const preview = useOccasionPreview();
  const query = useSpecialDaysToday(preview);
  return { ...query, preview, primary: primaryOccasion(query.data?.occasions ?? []) };
}

/** A dialog is already up (the page's own, the daily summary): don't stack on it. */
function dialogOpen() {
  return !!document.querySelector('[role="dialog"]');
}

/**
 * Mounted once in the layout. On a special day it paints the band in the
 * day's tone and motif (inline --gk-band-* vars on <html>, plus
 * data-occasion) and opens the full-screen welcome once per occasion key: a
 * greeting shown the working day before a holiday and the holiday itself
 * share a key, the return-day message has its own; a birthday that falls on
 * a holiday shows both, one after the other.
 */
export function OccasionLayer() {
  const { user, isImpersonating } = useAuth();
  const { data, primary, preview } = useTodayOccasions();
  // What closed and open welcomes belong to: the real day (null) or this one
  // preview; a restarted preview of the same day is a new scope.
  const scope = useOccasionPreviewScope();
  // Welcomes closed in this tab, per previewed day (null: the real today); a
  // preview only remembers them here, so each new preview welcomes again.
  const [closedBy, setClosedBy] = useState<{ scope: string | null; keys: ReadonlySet<string> }>(
    () => ({ scope, keys: new Set() }),
  );
  const closed = useMemo(
    () => (closedBy.scope === scope ? closedBy.keys : new Set<string>()),
    [closedBy, scope],
  );
  // The welcome on screen, for the day it was opened for: starting or ending a
  // preview drops a welcome that is up for the other day.
  const [open, setOpen] = useState<{ scope: string | null; occasion: Occasion } | null>(null);
  const current = open && open.scope === scope ? open.occasion : null;
  // Until today's answer arrives, the theme this browser saw earlier today,
  // so a full page load doesn't flash the plain red band first.
  const [cached] = useState(() => ({ theme: cachedTheme(), band: cachedBand() }));
  // The band takes the day's tone and motif unless the day says otherwise.
  const look = useMemo(() => {
    if (!primary) return null;
    const band = bandLook(occasionDesign(primary), primary.color_band ?? true);
    return band ? { theme: primary.theme, band: { tone: band.tone, motif: band.motif } } : null;
  }, [primary]);
  const shown = data ? look : preview ? null : cached.theme ? cached : null;
  const theme = shown?.theme;
  const bandTone = shown?.band?.tone;
  const bandMotif = shown?.band?.motif;

  useEffect(() => {
    if (data && !preview) cacheTheme(look?.theme ?? null, new Date(), look?.band ?? null);
  }, [data, preview, look]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.dataset.occasion = theme;
    else delete root.dataset.occasion;
    // Inline vars beat the fixed [data-occasion] themes in global.css.
    if (bandTone) root.style.setProperty('--gk-band-bg', bandTone);
    else root.style.removeProperty('--gk-band-bg');
    if (bandMotif) root.style.setProperty('--gk-band-motif', bandMotif);
    else root.style.removeProperty('--gk-band-motif');
    return () => {
      delete root.dataset.occasion;
      root.style.removeProperty('--gk-band-bg');
      root.style.removeProperty('--gk-band-motif');
    };
  }, [theme, bandTone, bandMotif]);

  const next = useMemo(() => {
    if (!data || isImpersonating) return null;
    return pendingWelcomes(user.id, data.occasions, closed, { preview })[0] ?? null;
  }, [data, user.id, closed, preview, isImpersonating]);

  // Wait for any other dialog to close, and for the tab to be in view.
  useEffect(() => {
    if (!next || current) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tryOpen = () => {
      if (document.visibilityState === 'visible' && !dialogOpen())
        setOpen({ scope, occasion: next });
      else timer = setTimeout(tryOpen, 1500);
    };
    tryOpen();
    return () => clearTimeout(timer);
  }, [next, current, scope]);

  if (!current || !data) return null;

  const close = () => {
    if (preview) markSeenInPreview(preview, current.key);
    else markSeen(user.id, current.key);
    setClosedBy({ scope, keys: new Set(closed).add(current.key) });
    setOpen(null);
  };
  const received = data.received.filter((r) => r.kind === current.kind);
  return (
    <OccasionWelcome occasion={current} date={data.date} received={received} onClose={close} />
  );
}

const PREVIEW_COUNT = 3;

export function OccasionWelcome({
  occasion,
  date,
  received,
  onClose,
}: {
  occasion: Occasion;
  date: string;
  received: ReceivedCelebration[];
  onClose: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const design = occasionDesign(occasion);
  const shown = showAll ? received : received.slice(0, PREVIEW_COUNT);
  const today = date || isoDate(new Date());
  const halfDay =
    occasion.is_half_day && (occasion.phase ?? 'on') === 'on' ? 'Bugün yarım gün çalışılır.' : '';
  const celebrated = received.length > 0 ? `${received.length} kişi sizi kutladı` : '';
  const note = occasion.note || halfDay || celebrated;

  return (
    <Modal
      opened
      onClose={onClose}
      fullScreen
      withCloseButton={false}
      transitionProps={{ transition: 'fade', duration: 200 }}
      aria-labelledby="occasion-title"
      classNames={{ content: classes.welcome, body: classes.welcomeBody }}
      styles={{ content: { background: design.tone } }}
      data-testid="occasion-welcome"
      data-occasion-theme={occasion.theme}
      data-layout={design.layout}
    >
      <WelcomeTemplate
        design={design}
        kicker={occasionKicker(occasion, today)}
        title={occasion.title || occasion.name}
        body={occasion.body}
        note={note}
        numeral={occasionNumeral(occasion, design)}
        titleId="occasion-title"
        onCta={onClose}
        extra={
          shown.length > 0 ? (
            <ul className={classes.messages} aria-label="Kutlama mesajları">
              {shown.map((message) => (
                <li key={`${message.sender_id}-${message.created_at}`} className={classes.message}>
                  <span className={classes.messageFrom}>{message.sender_name}</span>
                  <span className={classes.messageText}>
                    {message.message || 'Gününüzü kutladı'}
                  </span>
                </li>
              ))}
            </ul>
          ) : null
        }
        actions={
          received.length > PREVIEW_COUNT && !showAll ? (
            <Button
              variant="outline"
              size="md"
              className={classes.ghost}
              onClick={() => setShowAll(true)}
            >
              {received.length} Mesajın Tümü
            </Button>
          ) : null
        }
      />
    </Modal>
  );
}
