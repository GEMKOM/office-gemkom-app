import { Button, Modal } from '@mantine/core';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  useSpecialDaysToday,
  type Occasion,
  type ReceivedCelebration,
} from '@/api/general/specialDays';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate } from '@/lib/format';
import { FaIcon } from '@/ui/FaIcon';
import {
  cachedTheme,
  cacheTheme,
  markSeen,
  markSeenInPreview,
  occasionIcon,
  pendingWelcomes,
  primaryOccasion,
  THEME_TONE,
} from './occasionModel';
import classes from './occasion.module.css';
import { useOccasionPreview } from './previewStore';

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
 * Mounted once in the layout. On a special day it sets data-occasion on
 * <html> (global.css re-themes the band from it) and opens the full-screen
 * welcome once per occasion: a three-day bayram welcomes once, and a
 * birthday that falls on a holiday shows both, one after the other.
 */
export function OccasionLayer() {
  const { user, isImpersonating } = useAuth();
  const { data, primary, preview } = useTodayOccasions();
  // Welcomes closed in this tab, per previewed day (null: the real today); a
  // preview only remembers them here, so each new preview welcomes again.
  const [closedBy, setClosedBy] = useState<{ scope: string | null; keys: ReadonlySet<string> }>(
    () => ({ scope: preview, keys: new Set() }),
  );
  const closed = useMemo(
    () => (closedBy.scope === preview ? closedBy.keys : new Set<string>()),
    [closedBy, preview],
  );
  // The welcome on screen, for the day it was opened for: starting or ending a
  // preview drops a welcome that is up for the other day.
  const [open, setOpen] = useState<{ scope: string | null; occasion: Occasion } | null>(null);
  const current = open && open.scope === preview ? open.occasion : null;
  // Until today's answer arrives, the theme this browser saw earlier today,
  // so a full page load doesn't flash the plain red band first.
  const [cached] = useState(() => cachedTheme());
  const theme = data ? primary?.theme : preview ? undefined : (cached ?? undefined);

  useEffect(() => {
    if (data && !preview) cacheTheme(primary?.theme ?? null);
  }, [data, preview, primary?.theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.dataset.occasion = theme;
    else delete root.dataset.occasion;
    return () => {
      delete root.dataset.occasion;
    };
  }, [theme]);

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
        setOpen({ scope: preview, occasion: next });
      else timer = setTimeout(tryOpen, 1500);
    };
    tryOpen();
    return () => clearTimeout(timer);
  }, [next, current, preview]);

  if (!current || !data) return null;

  const close = () => {
    if (preview) markSeenInPreview(preview, current.key);
    else markSeen(user.id, current.key);
    setClosedBy({ scope: preview, keys: new Set(closed).add(current.key) });
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
  const tone = THEME_TONE[occasion.theme] ?? THEME_TONE.company;
  const shown = showAll ? received : received.slice(0, PREVIEW_COUNT);
  const dateLabel = date
    ? formatDate(date, { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })
    : '';

  return (
    <Modal
      opened
      onClose={onClose}
      fullScreen
      withCloseButton={false}
      transitionProps={{ transition: 'fade', duration: 200 }}
      aria-labelledby="occasion-title"
      classNames={{ content: classes.welcome, body: classes.welcomeBody }}
      styles={{ content: { '--occasion-tone': tone } as CSSProperties }}
      data-testid="occasion-welcome"
      data-occasion-theme={occasion.theme}
    >
      <div className={classes.motif} data-theme={occasion.theme} aria-hidden />
      <div className={classes.welcomeInner}>
        <span className={classes.welcomeIcon} aria-hidden>
          <FaIcon icon={occasionIcon(occasion.kind, occasion.theme)} />
        </span>
        {dateLabel ? <span className={classes.welcomeDate}>{dateLabel}</span> : null}
        <h1 id="occasion-title" className={classes.welcomeTitle}>
          {occasion.title || occasion.name}
        </h1>
        {occasion.body ? <p className={classes.welcomeText}>{occasion.body}</p> : null}
        {occasion.is_half_day ? (
          <p className={classes.welcomeNote}>Bugün yarım gün çalışılır.</p>
        ) : null}
        {shown.length > 0 ? (
          <ul className={classes.messages} aria-label="Kutlama mesajları">
            {shown.map((message) => (
              <li key={`${message.sender_id}-${message.created_at}`} className={classes.message}>
                <span className={classes.messageFrom}>{message.sender_name}</span>
                <span className={classes.messageText}>{message.message || 'Gününüzü kutladı'}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className={classes.welcomeActions}>
          {received.length > PREVIEW_COUNT && !showAll ? (
            <Button
              variant="outline"
              size="md"
              className={classes.ghost}
              onClick={() => setShowAll(true)}
            >
              {received.length} Mesajın Tümü
            </Button>
          ) : null}
          <Button size="md" className={classes.go} onClick={onClose} data-autofocus>
            Uygulamaya Geç
          </Button>
        </div>
      </div>
    </Modal>
  );
}
