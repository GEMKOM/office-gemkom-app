import { hasPerm, isAdmin } from '@/auth/authService';
import { Button } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { customersQueryOptions, useUsers, type UserOption } from '@/api';
import {
  OFFER_STATUS_LABELS,
  offersQueryOptions,
  resolveOfferQueryOptions,
  type OffersParams,
} from '@/api/sales/offers';
import { useAuth } from '@/auth/AuthProvider';
import {
  DataTable,
  FaIcon,
  FilterBar,
  fromOrdering,
  notify,
  PageHeader,
  SelectRemote,
  toOrdering,
  useUrlFilters,
  type FilterConfig,
  type FilterOption,
  type RowAction,
} from '@/ui';
import { offerColumns, type OfferRow } from './columns';
import { OffersProvider, useOffers, type OfferDialog } from './context';
import { OfferDialogs } from './dialogs/OfferDialogs';
import { canSubmitApproval, deadlineUrgency, TAB_LABELS, type OfferTab } from './logic';
import { OfferModal } from './OfferModal';
import css from './OffersPage.module.css';

/** The UserGroup whose members are the sales team (organization.UserGroup.slug). */
const SALES_TEAM_GROUP = 'proje-taahhut';

const EMPTY_ROWS: OfferRow[] = [];

type FilterKeys = 'search' | 'status' | 'created_by' | 'customer_ref';
type FilterState = { search: string; status: string[]; created_by: string; customer_ref: string };

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** In the sales team by the user's own group fields, else by the group's member list. */
function inSalesTeam(
  user: { id: number; [key: string]: unknown },
  members: readonly UserOption[],
): boolean {
  const group = user.group ?? user.team_group ?? user.teamGroup ?? '';
  if (String(group) === SALES_TEAM_GROUP) return true;
  const groups = user.groups;
  if (
    Array.isArray(groups) &&
    groups.some((g) => String((g as { name?: unknown } | null)?.name ?? g) === SALES_TEAM_GROUP)
  ) {
    return true;
  }
  return members.some((u) => String(u.id) === String(user.id));
}

export function canViewEstimates(): boolean {
  try {
    return Boolean(isAdmin()) || hasPerm('view_estimates');
  } catch {
    return false;
  }
}

const TABS = Object.keys(TAB_LABELS) as OfferTab[];

/** Port of sales/offers (offerList.js). */
export function OffersPage() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const members = useUsers({ group: SALES_TEAM_GROUP });
  const memberList = members.data ?? [];
  const createdByInUrl = searchParams.has('created_by');
  const selfIsSales = inSalesTeam(user, memberList);
  // Without ?created_by= a sales person starts on their own offers (legacy default).
  const defaultCreatedBy = selfIsSales ? String(user.id) : '';
  const createdByKnown = createdByInUrl || selfIsSales || !members.isPending;

  const url = useUrlFilters({
    search: '',
    status: [] as string[],
    created_by: defaultCreatedBy,
    customer: '',
    customer_ref: '',
    page: '1',
    page_size: '20',
    ordering: '-created_at',
    offer_no: '',
    tab: '',
  });
  const { values, apply } = url;
  const queryClient = useQueryClient();

  const filters = useMemo<FilterState>(
    () => ({
      search: values.search,
      status: values.status,
      created_by: values.created_by,
      customer_ref: values.customer_ref,
    }),
    [values.search, values.status, values.created_by, values.customer_ref],
  );

  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering || '-created_at');
  const params: OffersParams = {
    search: values.search || undefined,
    status__in: values.status.length ? values.status.join(',') : undefined,
    customer: values.customer || undefined,
    customer_inquiry_ref: values.customer_ref || undefined,
    created_by: values.created_by || undefined,
    ordering: toOrdering(sort.sortBy, sort.sortDir) ?? '-created_at',
    page,
    page_size: pageSize,
  };
  const list = useQuery({
    ...offersQueryOptions(params),
    placeholderData: keepPreviousData,
    enabled: createdByKnown,
  });
  const rows = (list.data?.results as OfferRow[] | undefined) ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError) notify.error('Teklifler yüklenirken hata oluştu');
  }, [list.isError, list.errorUpdatedAt]);

  // Legacy counts drafts, running and won offers on the loaded page.
  const stats = useMemo(() => {
    const running = [
      'consultation',
      'pricing',
      'pending_approval',
      'approved',
      'submitted_customer',
    ];
    return {
      draft: rows.filter((o) => o.status === 'draft').length,
      active: rows.filter((o) => running.includes(o.status)).length,
      won: rows.filter((o) => o.status === 'won').length,
    };
  }, [rows]);
  const figure = (value: number) => (list.isPending ? '–' : value.toLocaleString('tr-TR'));

  // ---- the open offer: ?offer_no= (legacy deep link) and ?tab= ----
  // Ids of offers opened from a row or just created, so the URL needs no lookup for them.
  const [known, setKnown] = useState<Record<string, number>>({});
  const offerNo = values.offer_no;
  const knownId = offerNo
    ? (rows.find((r) => r.offer_no === offerNo)?.id ?? known[offerNo])
    : undefined;
  const resolve = useQuery({
    ...resolveOfferQueryOptions(offerNo),
    enabled: Boolean(offerNo) && knownId === undefined && !list.isPending,
  });
  const offerId = knownId ?? resolve.data ?? null;

  useEffect(() => {
    if (offerNo && resolve.isSuccess && resolve.data === null && knownId === undefined) {
      notify.warning('Teklif bulunamadı');
      apply({ offer_no: '', tab: '' });
    }
  }, [offerNo, resolve.isSuccess, resolve.data, knownId, apply]);

  const estimatesAllowed = canViewEstimates();
  // A deep link without a tab opens Onay, as legacy did.
  const requestedTab = (values.tab || 'approval') as OfferTab;
  const tab: OfferTab =
    TABS.includes(requestedTab) && (requestedTab !== 'tahmin' || estimatesAllowed)
      ? requestedTab
      : 'genel';

  const openOffer = useCallback(
    (offer: { id: number; offer_no: string }, nextTab: OfferTab = 'genel') => {
      setKnown((prev) =>
        prev[offer.offer_no] === offer.id ? prev : { ...prev, [offer.offer_no]: offer.id },
      );
      apply({ offer_no: offer.offer_no, tab: nextTab });
    },
    [apply],
  );

  const refresh = () => {
    if (page === 1) void list.refetch();
    else {
      void queryClient.invalidateQueries({ queryKey: ['offers', 'list'], refetchType: 'none' });
      apply({ page: '1' });
    }
  };

  return (
    <OffersProvider openOffer={openOffer}>
      {(dialogs: OfferDialog[]) => (
        <>
          <PageHeader
            title="Satış Teklifleri"
            subtitle="Teklif listesi, oluşturma ve yönetimi"
            backTo="/sales/"
            stats={[
              { id: 'total-offers', label: 'Toplam Teklif', value: figure(total) },
              { id: 'draft-offers', label: 'Taslak', value: figure(stats.draft) },
              { id: 'active-offers', label: 'Devam Eden', value: figure(stats.active) },
              { id: 'won-offers', label: 'Kazanılan', value: figure(stats.won) },
            ]}
            actions={<NewOfferButton />}
          />

          <OffersTable
            rows={rows}
            total={total}
            loading={list.isFetching || (!createdByKnown && list.isPending)}
            filters={filters}
            customer={values.customer}
            createdByOptions={createdByOptions(memberList, values.created_by)}
            page={page}
            pageSize={pageSize}
            sort={sort}
            apply={apply}
            onRefresh={refresh}
          />

          {offerNo && offerId !== null ? (
            <OfferModal
              key={offerId}
              offerId={offerId}
              tab={tab}
              estimatesAllowed={estimatesAllowed}
              onTabChange={(next) => apply({ tab: next })}
              onClose={() => apply({ offer_no: '', tab: '' })}
            />
          ) : null}

          <OfferDialogs dialogs={dialogs} />
        </>
      )}
    </OffersProvider>
  );
}

/** "Tümü" plus the sales team; an id from the URL that is not in it shows as "Kullanıcı #id". */
function createdByOptions(members: readonly UserOption[], current: string): FilterOption[] {
  const opts = members.map((u) => ({
    value: String(u.id),
    label: u.full_name ? `${u.full_name} (${u.username})` : u.username || `Kullanıcı #${u.id}`,
  }));
  if (current && !opts.some((o) => o.value === current)) {
    opts.unshift({ value: current, label: `Kullanıcı #${current}` });
  }
  return opts;
}

function NewOfferButton() {
  const { openDialog } = useOffers();
  return (
    <Button
      leftSection={<FaIcon icon="fas fa-plus" />}
      onClick={() => openDialog({ kind: 'create' })}
    >
      Yeni Teklif
    </Button>
  );
}

const STATUS_OPTIONS = Object.entries(OFFER_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

interface OffersTableProps {
  rows: OfferRow[];
  total: number;
  loading: boolean;
  filters: FilterState;
  customer: string;
  createdByOptions: FilterOption[];
  page: number;
  pageSize: number;
  sort: ReturnType<typeof fromOrdering>;
  apply: (
    next: Partial<
      FilterState & { customer: string; page: string; page_size: string; ordering: string }
    >,
  ) => void;
  onRefresh: () => void;
}

function OffersTable({
  rows,
  total,
  loading,
  filters,
  customer,
  createdByOptions: userOptions,
  page,
  pageSize,
  sort,
  apply,
  onRefresh,
}: OffersTableProps) {
  const { openOffer, openDialog, runAction } = useOffers();
  const queryClient = useQueryClient();
  const columns = useMemo(() => offerColumns((row, tab) => openOffer(row, tab)), [openOffer]);

  const filterConfig = useMemo<FilterConfig<FilterKeys>[]>(
    () => [
      { type: 'text', key: 'search', label: 'Arama', placeholder: 'Teklif no, başlık, müşteri...' },
      {
        type: 'multiselect',
        key: 'status',
        label: 'Durum',
        placeholder: 'Tümü',
        options: STATUS_OPTIONS,
      },
      {
        type: 'select',
        key: 'created_by',
        label: 'Oluşturan',
        placeholder: 'Tümü',
        options: userOptions,
      },
      {
        type: 'text',
        key: 'customer_ref',
        label: 'Müşteri Referansı',
        placeholder: 'Müşteri referansı...',
      },
    ],
    [userOptions],
  );

  const rowActions = (row: OfferRow): RowAction<OfferRow>[] => [
    {
      key: 'view',
      label: 'Görüntüle',
      icon: 'fas fa-eye',
      color: 'primary',
      onClick: () => openOffer(row),
    },
    {
      key: 'submit_approval',
      label: 'Onaya Gönder',
      icon: 'fas fa-gavel',
      color: 'primary',
      hidden: !canSubmitApproval(row),
      onClick: () => openDialog({ kind: 'submit-approval', offerId: row.id }),
    },
    {
      key: 'record_decision',
      label: 'Karar Ver',
      icon: 'fas fa-check-double',
      color: 'success',
      hidden: row.status !== 'pending_approval',
      onClick: () => openDialog({ kind: 'decision', offerId: row.id }),
    },
    {
      key: 'submit_to_customer',
      label: 'Müşteriye Gönder',
      icon: 'fas fa-paper-plane',
      color: 'dark',
      hidden: row.status !== 'approved',
      onClick: () => void runAction(row.id, 'submit-customer'),
    },
    {
      key: 'mark_won',
      label: 'Kazanıldı',
      icon: 'fas fa-trophy',
      color: 'success',
      hidden: row.status !== 'submitted_customer',
      onClick: () => void runAction(row.id, 'mark-won'),
    },
    {
      key: 'mark_lost',
      label: 'Kaybedildi',
      icon: 'fas fa-thumbs-down',
      color: 'danger',
      hidden: row.status !== 'submitted_customer',
      onClick: () => void runAction(row.id, 'mark-lost'),
    },
    {
      key: 'convert',
      label: 'İş Emrine Dönüştür',
      icon: 'fas fa-exchange-alt',
      color: 'success',
      hidden: row.status !== 'won',
      onClick: () => openDialog({ kind: 'convert', offerId: row.id }),
    },
    {
      key: 'revert_won',
      label: 'Geri Al',
      icon: 'fas fa-undo',
      color: 'warning',
      hidden: row.status !== 'won',
      onClick: () => void runAction(row.id, 'revert-won'),
    },
    {
      key: 'cancel',
      label: 'İptal',
      icon: 'fas fa-ban',
      color: 'dark',
      hidden: row.status === 'won' || row.status === 'cancelled',
      onClick: () => void runAction(row.id, 'cancel'),
    },
  ];

  return (
    <DataTable
      title="Teklifler"
      icon="fas fa-file-invoice-dollar"
      filters={
        <FilterBar
          inline
          title="Teklif Filtreleri"
          filters={filterConfig}
          values={filters}
          onApply={(next) => apply({ ...next, page: '1' })}
          onClear={() =>
            apply({
              search: '',
              status: [],
              created_by: '',
              customer_ref: '',
              customer: '',
              page: '1',
            })
          }
          extra={
            <div className={css.customerFilter}>
              <SelectRemote
                aria-label="Müşteri"
                placeholder="Müşteri ara (en az 3 karakter)"
                queryKey={['offers', 'customer-filter']}
                minSearchLength={3}
                clearable
                value={customer || null}
                initialOptions={customer ? [{ value: customer, label: `#${customer}` }] : []}
                onChange={(value) => apply({ customer: value ?? '', page: '1' })}
                search={async (term) => {
                  const res = await queryClient.fetchQuery(
                    customersQueryOptions({ search: term.trim(), is_active: true, page_size: 50 }),
                  );
                  return res.results.map((c) => ({
                    value: String(c.id),
                    label: c.name || c.code || `#${c.id}`,
                  }));
                }}
              />
            </div>
          }
        />
      }
      data={rows}
      columns={columns}
      getRowId={(row) => String(row.id)}
      loading={loading}
      sort={{
        sortBy: sort.sortBy,
        sortDir: sort.sortDir,
        onSortChange: (sortBy, sortDir) =>
          apply({ ordering: toOrdering(sortBy, sortDir) ?? '-created_at', page: '1' }),
      }}
      pagination={{
        page,
        pageSize,
        total,
        onPageChange: (next) => apply({ page: String(next) }),
        onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
      }}
      rowActions={rowActions}
      rowStyle={(row) => {
        // The submission deadline wins over "waiting for my approval".
        const urgency = deadlineUrgency(row);
        if (urgency === 'red') return { background: 'var(--mantine-color-red-1)' };
        if (urgency === 'yellow' || row.needs_my_approval)
          return { background: 'var(--mantine-color-yellow-1)' };
        return undefined;
      }}
      emptyMessage="Teklif bulunamadı"
      onRefresh={onRefresh}
    />
  );
}
