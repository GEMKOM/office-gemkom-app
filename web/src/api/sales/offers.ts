import { queryOptions } from '@tanstack/react-query';
import type { StatusFamily } from '@/ui/StatusBadge';
import { apiFetch, cleanParams } from '../client';
import { toPaginated, type Paginated } from '../types';

// Read side of apis/sales/offers.js, as much as the sales hub needs. The
// offers page itself is still legacy.

export type OfferStatus =
  | 'draft'
  | 'consultation'
  | 'pricing'
  | 'pending_approval'
  | 'approved'
  | 'submitted_customer'
  | 'won'
  | 'converted'
  | 'lost'
  | 'cancelled';

export interface Offer {
  id: number;
  offer_no: string;
  title?: string;
  status: OfferStatus | string;
  status_display?: string;
  customer_name?: string;
  total_price?: string | number | null;
  currency?: string;
  offer_expiry_date?: string | null;
  created_at?: string;
  [key: string]: unknown;
}

/** Legacy OFFER_STATUS_MAP. */
export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  draft: 'Taslak',
  consultation: 'Danışma',
  pricing: 'Fiyatlandırma',
  pending_approval: 'Onay Bekliyor',
  approved: 'Onaylandı',
  submitted_customer: 'Müşteriye Sunuldu',
  won: 'Kazanıldı',
  converted: 'İş Emrine Dönüştürüldü',
  lost: 'Kaybedildi',
  cancelled: 'İptal Edildi',
};

/** The design system's status families: waiting is yellow, with the customer purple. */
export const OFFER_STATUS_FAMILIES: Record<OfferStatus, StatusFamily> = {
  draft: 'grey',
  consultation: 'blue',
  pricing: 'blue',
  pending_approval: 'yellow',
  approved: 'green',
  submitted_customer: 'purple',
  won: 'green',
  converted: 'green',
  lost: 'red',
  cancelled: 'red',
};

export function offerStatusLabel(offer: Pick<Offer, 'status' | 'status_display'>): string {
  return offer.status_display || OFFER_STATUS_LABELS[offer.status as OfferStatus] || offer.status;
}

export function offerStatusFamily(status: string): StatusFamily {
  return OFFER_STATUS_FAMILIES[status as OfferStatus] ?? 'grey';
}

export type OffersParams = {
  search?: string;
  status?: OfferStatus;
  /** Comma-separated, e.g. "consultation,pricing". */
  status__in?: string;
  customer?: number | string;
  ordering?: string;
  page?: number;
  page_size?: number;
};

/** Offers move all day; a minute is fresh enough for a hub. */
export const OFFERS_STALE_TIME = 60_000;

const BASE = '/sales/offers/';

/** Port of listOffers. */
export async function listOffers(params: OffersParams = {}, signal?: AbortSignal): Promise<Paginated<Offer>> {
  return toPaginated<Offer>(await apiFetch<unknown>(BASE, { params, signal }));
}

const offersKey = (params: OffersParams) => ['offers', 'list', cleanParams(params)] as const;

export function offersQueryOptions(params: OffersParams = {}) {
  return queryOptions({
    queryKey: offersKey(params),
    queryFn: ({ signal }) => listOffers(params, signal),
    staleTime: OFFERS_STALE_TIME,
  });
}

/** How many offers match, from a one-row page. */
export function offerCountQueryOptions(filter: Pick<OffersParams, 'status' | 'status__in' | 'customer'>) {
  const params: OffersParams = { ...filter, page_size: 1 };
  return queryOptions({
    queryKey: offersKey(params),
    queryFn: ({ signal }) => listOffers(params, signal),
    staleTime: OFFERS_STALE_TIME,
    select: (page) => page.count,
  });
}
