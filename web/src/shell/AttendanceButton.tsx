import { Button, Loader, Popover, Textarea, Tooltip, UnstyledButton, type FloatingPosition } from '@mantine/core';
import { useState } from 'react';
import {
  isOffNetwork,
  useAttendanceAction,
  useAttendanceToday,
  type AttendanceAction,
  type AttendanceModel,
} from './attendance';
import { FaIcon } from './FaIcon';
import classes from './shell.module.css';

const ACTION_LABEL: Record<AttendanceAction, string> = { 'check-in': 'Giriş Yap', 'check-out': 'Çıkış Yap' };

/** The one action today's state allows, if any. */
function nextAction(model: AttendanceModel | undefined): AttendanceAction | null {
  if (model?.state === 'not_checked_in') return 'check-in';
  if (model?.state === 'active') return 'check-out';
  return null;
}

function AttendancePanel({ model, loading, failed, onRefresh }: {
  model: AttendanceModel | undefined;
  loading: boolean;
  failed: boolean;
  onRefresh: () => void;
}) {
  const mutation = useAttendanceAction();
  // Set when the backend refused because the user is off the office network.
  const [offNetwork, setOffNetwork] = useState<AttendanceAction | null>(null);
  const [reason, setReason] = useState('');
  const [reasonMissing, setReasonMissing] = useState(false);
  const action = nextAction(model);

  const run = (which: AttendanceAction, withReason?: string) =>
    mutation.mutate(
      { action: which, reason: withReason },
      {
        onSuccess: () => {
          setOffNetwork(null);
          setReason('');
        },
        onError: (error) => {
          if (isOffNetwork(error)) setOffNetwork(which);
        },
      },
    );

  const submitOverride = () => {
    if (!offNetwork) return;
    if (!reason.trim()) {
      setReasonMissing(true);
      return;
    }
    run(offNetwork, reason.trim());
  };

  return (
    <>
      <div className={classes.notifHeader}>
        <span className={classes.notifHeading}>PDKS</span>
        {model && (
          <span className={classes.pdksPill} data-family={model.tone}>
            {model.label}
          </span>
        )}
        <UnstyledButton className={classes.pdksRefresh} aria-label="Yenile" onClick={onRefresh}>
          <FaIcon icon="fas fa-sync-alt" />
        </UnstyledButton>
      </div>
      <div className={classes.pdksBody}>
        {loading && !model ? (
          <Loader size="sm" color="gray" />
        ) : failed && !model ? (
          <p className={classes.pdksNote}>Durum yüklenemedi.</p>
        ) : (
          <dl className={classes.pdksTimes}>
            <dt>Giriş</dt>
            <dd>{model?.checkIn ?? '-'}</dd>
            <dt>Çıkış</dt>
            <dd>{model?.checkOut ?? '-'}</dd>
          </dl>
        )}

        {offNetwork ? (
          <div className={classes.pdksOverride}>
            <p className={classes.pdksNote} data-family="yellow">
              Ofis ağı dışındasınız. İşlem açıklamanızla İnsan Kaynakları onayına gider.
            </p>
            <Textarea
              label="Açıklama"
              autosize
              minRows={2}
              value={reason}
              error={reasonMissing ? 'Açıklama girin' : undefined}
              onChange={(event) => {
                setReason(event.currentTarget.value);
                setReasonMissing(false);
              }}
              data-autofocus
            />
            <Button fullWidth loading={mutation.isPending} onClick={submitOverride}>
              Ofis Dışı {ACTION_LABEL[offNetwork]}
            </Button>
          </div>
        ) : action ? (
          <Button fullWidth loading={mutation.isPending} onClick={() => run(action)}>
            {ACTION_LABEL[action]}
          </Button>
        ) : model?.state === 'complete' ? (
          <p className={classes.pdksNote}>Bugünkü giriş ve çıkışınız kaydedildi.</p>
        ) : null}

        {mutation.isError && !offNetwork && (
          <p className={classes.pdksNote} data-tone="danger">
            {mutation.error.message || 'İşlem yapılamadı.'}
          </p>
        )}
      </div>
    </>
  );
}

/**
 * Check-in / check-out. The icon carries today's state as a dot; the popover
 * holds the action. `row` is the expanded rail's version.
 */
export function AttendanceButton({
  variant = 'icon',
  position = 'bottom-end',
}: {
  variant?: 'icon' | 'row';
  position?: FloatingPosition;
}) {
  const [opened, setOpened] = useState(false);
  const today = useAttendanceToday();
  const model = today.data;
  const tone = today.isError && !model ? 'red' : (model?.tone ?? 'grey');
  const short = model?.short ?? (today.isError ? 'Yüklenemedi' : '…');
  const label = `PDKS, ${short}`;

  const toggle = () => {
    if (!opened) void today.refetch();
    setOpened((o) => !o);
  };

  const dot = <span className={classes.pdksDot} data-tone={tone} />;

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position={position}
      offset={variant === 'row' ? 10 : 14}
      width="min(320px, calc(100vw - 24px))"
      withinPortal
      trapFocus
      returnFocus
      classNames={{ dropdown: classes.notifPanel }}
    >
      <Popover.Target>
        <Tooltip label={label} position="right" offset={12} withArrow disabled={opened || variant === 'row' || position.startsWith('bottom')}>
          {variant === 'row' ? (
            <UnstyledButton className={classes.railRow} aria-label={label} onClick={toggle}>
              <span className={classes.pdksIcon}>
                <FaIcon icon="fas fa-fingerprint" />
                {dot}
              </span>
              <span className={classes.railRowLabel}>PDKS</span>
              <span className={classes.rowMeta}>{short}</span>
            </UnstyledButton>
          ) : (
            <UnstyledButton className={classes.railItem} aria-label={label} onClick={toggle}>
              <FaIcon icon="fas fa-fingerprint" />
              {dot}
            </UnstyledButton>
          )}
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        {opened && (
          <AttendancePanel
            model={model}
            loading={today.isFetching}
            failed={today.isError}
            onRefresh={() => void today.refetch()}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
