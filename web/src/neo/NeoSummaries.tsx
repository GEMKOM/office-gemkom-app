import { isImpersonating } from '@/auth/authService';
import {
  areaOrderFor,
  bindDailySummaryInteractions,
  currentDepartmentCode,
  formatSummaryDate,
  formatWindowLabel,
  relativeDayLabel,
  renderDailySummary,
} from '@/neo/dailySummaryRender';
import './dailySummary.css';
import { Button, Group, Loader, Modal, UnstyledButton } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getDailySummary,
  isAccessDenied,
  markDailySummaryRead,
  summaryMiniStats,
  type DailySummaryDetail,
  type DailySummaryRow,
} from '@/api/assistant';
import { useAuth } from '@/auth/AuthProvider';
import { FaIcon } from '@/ui/FaIcon';
import { ModalBody, ModalFooter, ModalHeader, modalClassNames } from '@/ui/ModalParts';
import { StatusBadge } from '@/ui/StatusBadge';
import classes from './neo.module.css';
import { liteOf, noteSummaryRead, rememberShown, snoozeSummary } from './dailySummary';
import { NeoAskButton } from './NeoAskButton';
import { clearSummaryRequest, openNeo, useNeo } from './neoStore';
import { neoKeys, useDailySummaries, useNeoAccess } from './queries';

// "Günlük Özetler": the company-wide daily brief, newest first. A row opens
// the summary in the same layout the legacy morning popup uses (its renderer
// and stylesheet are shared as they are).

type Opened = { row: DailySummaryRow; latest: boolean; source: 'pane' | 'deeplink' };

function windowLabel(detail: DailySummaryDetail): string {
  const days = Number((detail.payload as { window?: { days?: number } } | null)?.window?.days) || 0;
  const label = formatWindowLabel(detail);
  return label && days > 1 ? `${label} · ${days} gün` : label;
}

function SummaryBody({ detail, onReveal }: { detail: DailySummaryDetail; onReveal: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = renderDailySummary(detail, {
    layer: 'brief',
    areaOrder: areaOrderFor(detail.for_you?.department_code || currentDepartmentCode()),
  });
  useEffect(() => {
    if (ref.current) bindDailySummaryInteractions(ref.current, { onReveal });
  }, [html, onReveal]);
  // The renderer escapes every payload string.
  return (
    <div ref={ref} className={classes.summaryBody} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export type SummarySource = 'pane' | 'deeplink' | 'modal' | 'banner';

/**
 * A summary in a popup. From the pane every way out is a read (the user went
 * looking for it). The morning popup and banner ('modal' | 'banner') are
 * offers: only "Okudum" reads, anything else snoozes.
 */
export function SummaryModal({
  summary,
  latest,
  source,
  onClose,
}: {
  summary: Pick<DailySummaryRow, 'id' | 'summary_date' | 'is_read'>;
  latest: boolean;
  source: SummarySource;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const offer = source === 'modal' || source === 'banner';
  const { locked } = useNeoAccess(true);
  const { data: detail, isError } = useQuery({
    queryKey: neoKeys.summary(summary.id),
    queryFn: ({ signal }) => getDailySummary(summary.id, signal),
    staleTime: Infinity,
  });
  const [openedAt] = useState(() => Date.now());
  const expanded = useRef(false);
  const onReveal = useCallback(() => {
    expanded.current = true;
  }, []);

  useEffect(() => {
    if (offer) rememberShown(summary.id);
  }, [offer, summary.id]);

  // An admin browsing as someone else must not touch their read state.
  const finish = (read: boolean, then?: () => void) => {
    if (detail && !isImpersonating()) {
      if (read) {
        markDailySummaryRead(summary.id, {
          seconds_open: Math.round((Date.now() - openedAt) / 1000),
          expanded: expanded.current,
          source,
        }).catch(() => undefined);
        noteSummaryRead(user.id, detail, { latest });
        for (const days of [30, 90]) {
          queryClient.setQueryData<DailySummaryRow[]>(neoKeys.summaries(days), (rows) =>
            rows?.map((r) => (r.id === summary.id ? { ...r, is_read: true } : r)),
          );
        }
      } else if (latest) {
        snoozeSummary(user.id, liteOf(detail));
      }
    }
    onClose();
    then?.();
  };
  const dismiss = () => finish(!offer);

  return (
    <Modal opened onClose={dismiss} size="lg" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader
        icon="fas fa-newspaper"
        title={formatSummaryDate(summary.summary_date) || 'Günlük Özet'}
        subtitle={detail ? windowLabel(detail) || undefined : undefined}
        actions={
          locked ? null : (
            <NeoAskButton
              page={
                summary.summary_date
                  ? {
                      type: 'daily_summary',
                      id: summary.summary_date,
                      label: detail?.headline ? String(detail.headline) : undefined,
                    }
                  : null
              }
              // The modal lives in Neo's summaries view, which the chat
              // replaces: leave it the way the old "Neo'ya Sor" did.
              beforeAsk={() => finish(!offer)}
            />
          )
        }
      />
      <ModalBody>
        {detail ? (
          <SummaryBody detail={detail} onReveal={onReveal} />
        ) : isError ? (
          <div className={classes.muted}>Özet yüklenemedi.</div>
        ) : (
          <div className={classes.muted}>
            <Loader size="sm" color="gray" />
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Group gap="xs" mr="auto">
          {offer && (
            <Button
              variant="default"
              leftSection={<FaIcon icon="fas fa-newspaper" />}
              onClick={() =>
                finish(false, () => openNeo({ view: 'summaries', summaryId: summary.id }))
              }
            >
              Geçmiş Özetler
            </Button>
          )}
        </Group>
        {offer && (
          <Button
            variant="default"
            leftSection={<FaIcon icon="far fa-clock" />}
            onClick={() => finish(false)}
          >
            Daha Sonra
          </Button>
        )}
        <Button leftSection={<FaIcon icon="fas fa-check" />} onClick={() => finish(true)}>
          {summary.is_read ? 'Kapat' : 'Okudum'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/** The summaries pane. */
export function NeoSummaries() {
  const [days, setDays] = useState(30);
  const { data, isPending, isError, error } = useDailySummaries(days, true);
  const request = useNeo((s) => s.summaryRequest);
  const [opened, setOpened] = useState<Opened | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = data ?? [];

  const openRow = (row: DailySummaryRow, source: Opened['source'] = 'pane') =>
    setOpened({ row, latest: rows[0]?.id === row.id, source });

  // A deep link or openNeo({ summaryId }): scroll to that row (and pop it),
  // reaching back 90 days once if the first page doesn't hold it.
  useEffect(() => {
    if (!request || !data) return;
    const row = data.find((r) => r.id === request.id);
    if (row) {
      requestAnimationFrame(() =>
        scrollRef.current
          ?.querySelector(`[data-summary-id="${row.id}"]`)
          ?.scrollIntoView({ block: 'nearest' }),
      );
      if (request.open && row.status !== 'empty') {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- an outside request, applied once
        setOpened({ row, latest: data[0]?.id === row.id, source: 'deeplink' });
      }
      clearSummaryRequest();
    } else if (days < 90) {
      setDays(90);
    } else {
      clearSummaryRequest();
    }
  }, [request, data, days]);

  let body;
  if (isPending) body = <div className={classes.muted}>Yükleniyor…</div>;
  else if (isError)
    body = (
      <div className={classes.muted}>
        {isAccessDenied(error)
          ? 'Günlük özetler yalnızca ofis kullanıcılarına açıktır.'
          : 'Özetler yüklenemedi.'}
      </div>
    );
  else
    body = (
      <>
        {rows.length === 0 && <div className={classes.muted}>Henüz özet yok.</div>}
        {rows.some((row) => row.status !== 'empty') && (
          <p className={classes.hintLine}>Bir özeti açmak için tıklayın.</p>
        )}
        <ul className={classes.list}>
          {rows.map((row) => {
            const empty = row.status === 'empty';
            const content = (
              <span className={classes.rowMain}>
                <span className={classes.rowLine}>
                  <span className={classes.dayLabel}>{relativeDayLabel(row.summary_date)}</span>
                  <span className={classes.rowMeta}>
                    {empty ? 'Hareket yok' : summaryMiniStats(row)}
                  </span>
                  {!empty && !row.is_read && <StatusBadge color="blue">Yeni</StatusBadge>}
                </span>
                {!empty && row.headline ? (
                  <span className={classes.headline} title={row.headline}>
                    {row.headline}
                  </span>
                ) : null}
              </span>
            );
            return (
              <li key={row.id} data-summary-id={row.id}>
                {empty ? (
                  <div className={classes.row} data-static>
                    {content}
                  </div>
                ) : (
                  <UnstyledButton className={classes.row} onClick={() => openRow(row)}>
                    {content}
                    <span className={classes.rowIcon}>
                      <FaIcon icon="fas fa-up-right-from-square" />
                    </span>
                  </UnstyledButton>
                )}
              </li>
            );
          })}
        </ul>
        {days < 90 && (
          <UnstyledButton className={classes.more} onClick={() => setDays(90)}>
            Daha Eski Özetler
          </UnstyledButton>
        )}
      </>
    );

  return (
    <div className={classes.scroll} ref={scrollRef}>
      <h3 className={classes.sectionTitle}>Günlük Özetler</h3>
      {body}
      {opened && (
        <SummaryModal
          summary={opened.row}
          latest={opened.latest}
          source={opened.source}
          onClose={() => setOpened(null)}
        />
      )}
    </div>
  );
}
