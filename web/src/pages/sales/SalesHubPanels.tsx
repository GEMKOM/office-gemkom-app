import { Skeleton } from '@mantine/core';
import type { UseQueryResult } from '@tanstack/react-query';
import type { Paginated } from '@/api';
import { offerStatusFamily, offerStatusLabel, type Offer } from '@/api/sales/offers';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { AppLink } from '@/shell/AppLink';
import { FaIcon, Panel, PendingValue, StatusBadge, type StatusFamily } from '@/ui';
import css from './SalesHubPage.module.css';

const OFFERS_PAGE = '/sales/offers/';

/** The legacy offers page opens an offer's detail when given its number. */
function offerLink(offer: Offer) {
  return `${OFFERS_PAGE}?offer_no=${encodeURIComponent(offer.offer_no)}`;
}

const ALL_OFFERS = (
  <AppLink to={OFFERS_PAGE} className={css.more}>
    Tümü <FaIcon icon="fas fa-arrow-right" />
  </AppLink>
);

export function RecentOffers({ query }: { query: UseQueryResult<Paginated<Offer>> }) {
  const offers = query.data?.results ?? [];
  let body;
  if (query.isPending) {
    body = (
      <div className={css.note}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height={18} my={10} />
        ))}
      </div>
    );
  } else if (query.isError) {
    body = (
      <p className={css.note}>
        Teklifler yüklenemedi.{' '}
        <button type="button" className={css.retry} onClick={() => void query.refetch()}>
          Yeniden Dene
        </button>
      </p>
    );
  } else if (offers.length === 0) {
    body = <p className={css.note}>Henüz teklif yok.</p>;
  } else {
    body = (
      <ul className={css.offers}>
        {offers.map((offer) => (
          <li key={offer.id}>
            <AppLink to={offerLink(offer)} className={css.offer}>
              <span className={css.offerNo}>{offer.offer_no}</span>
              <span className={css.offerMain}>
                <span className={css.offerCustomer}>{offer.customer_name || '-'}</span>
                {offer.title ? <span className={css.offerTitle}>{offer.title}</span> : null}
              </span>
              <span className={css.offerStatus}>
                <StatusBadge color={offerStatusFamily(offer.status)}>{offerStatusLabel(offer)}</StatusBadge>
              </span>
              <span className={css.offerPrice}>
                {offer.total_price ? formatCurrency(offer.total_price, offer.currency || 'TRY') : '-'}
              </span>
              <span className={css.offerDate}>
                {offer.created_at ? formatDate(offer.created_at, { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
              </span>
            </AppLink>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <Panel title="Son Teklifler" icon="fas fa-clock-rotate-left" actions={ALL_OFFERS} padded={false}>
      {body}
    </Panel>
  );
}

export interface PipelineStage {
  key: string;
  label: string;
  color: StatusFamily;
  /** Undefined while loading. */
  count: number | undefined;
}

/** Open offers by stage, as bars against the open total. */
export function OfferPipeline({ stages, won }: { stages: PipelineStage[]; won: number | undefined }) {
  const total = stages.reduce((sum, stage) => sum + (stage.count ?? 0), 0);
  return (
    <Panel
      title="Teklif Hattı"
      icon="fas fa-filter"
      footer={
        <>
          <span>Kazanılan Teklif</span>
          <b className={css.wonValue}>{won === undefined ? <PendingValue /> : formatNumber(won)}</b>
        </>
      }
    >
      <ul className={css.stages}>
        {stages.map((stage) => (
          <li key={stage.key}>
            <div className={css.stageRow}>
              <span>{stage.label}</span>
              <b>{stage.count === undefined ? <PendingValue /> : formatNumber(stage.count)}</b>
            </div>
            <div className={css.bar} data-family={stage.color}>
              <span style={{ width: total ? `${((stage.count ?? 0) / total) * 100}%` : 0 }} />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
