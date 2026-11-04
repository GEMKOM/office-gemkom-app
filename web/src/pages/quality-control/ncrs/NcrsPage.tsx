import type { AuthUser } from '@/auth/authService';
import { Button, Select } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useJobOrderOptions } from '@/api';
import {
  DEFECT_TYPE_CHOICES,
  NCR_STATUS_CHOICES,
  SEVERITY_CHOICES,
  ncrKeys,
  ncrLookupQueryOptions,
  ncrsQueryOptions,
  useCloseNcr,
  useNcr,
  useNcrFiles,
  useNcrGroups,
  type Ncr,
  type NcrListParams,
} from '@/api/quality-control/ncrs';
import { useAuth } from '@/auth/AuthProvider';
import {
  confirm,
  DataTable,
  FaIcon,
  FilterBar,
  fromOrdering,
  notify,
  PageHeader,
  toOrdering,
  useUrlFilters,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { ncrColumns } from './columns';
import { normalizeNcrFile } from './ncrFiles';
import { NcrDetailModal } from './NcrDetailModal';
import { NcrFormModal } from './NcrFormModal';
import {
  ALL_VALUE,
  canDecideNcrs,
  canSubmit,
  DEFAULT_STATUS_FILTER,
  defaultTeamSelection,
  isClosable,
  isInAssignedTeam,
  isSubmittable,
  isSubmitted,
  parseSelection,
  selectionParams,
  selectionToUrl,
} from './ncrRules';
import { NcrDecisionModal, NcrSubmitModal } from './NcrWorkflowModals';

// Every piece of page state lives in the URL, under the legacy keys. A missing
// status__in / assigned_team__in means "the default", `all` means "no restriction".
// ncr is the legacy deep link (?ncr=NCR-2026-0001) that opens the form.
const URL_DEFAULTS = {
  search: '',
  status__in: '',
  assigned_team__in: '',
  severity: '',
  defect_type: '',
  job_order: '',
  page: '1',
  page_size: '20',
  ordering: '-created_at',
  ncr: '',
};

type FilterState = {
  search: string;
  status__in: string[];
  assigned_team__in: string[];
  severity: string;
  defect_type: string;
};

const EMPTY_ROWS: Ncr[] = [];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

type FollowUp =
  | { kind: 'create' }
  | { kind: 'edit'; id: number; returnToDetails: boolean }
  | { kind: 'submit'; id: number; returnToDetails: boolean }
  | { kind: 'decide'; ncr: Ncr; approve: boolean };

/** Loads the NCR and its files fresh, then opens the edit form (showEditNCRModal). */
function EditLoader({ id, user, onClose }: { id: number; user: AuthUser; onClose: () => void }) {
  const detail = useNcr(id);
  const files = useNcrFiles(id);
  useEffect(() => {
    if (!detail.isError) return;
    notify.error('NCR yüklenirken hata oluştu');
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.isError]);
  // A failed file list only hides the "Mevcut ekler" block, as in legacy.
  if (!detail.data || !detail.isFetchedAfterMount || files.isPending) return null;
  const existing = (files.data ?? [])
    .map(normalizeNcrFile)
    .map((f) => ({ name: f.fileName, typeLabel: f.typeLabel }));
  return (
    <NcrFormModal currentUser={user} ncr={detail.data} existingFiles={existing} onClose={onClose} />
  );
}

/** Loads the NCR fresh and checks it may still be submitted (handleSubmitNCR). */
function SubmitLoader({
  id,
  user,
  onClose,
}: {
  id: number;
  user: AuthUser;
  onClose: () => void;
}) {
  const detail = useNcr(id);
  const ncr = detail.isFetchedAfterMount ? detail.data : undefined;
  const blocked = !ncr
    ? null
    : !isSubmittable(ncr)
      ? 'Sadece "Taslak" veya "Reddedildi" durumundaki NCR kayıtları gönderilebilir.'
      : !isInAssignedTeam(user, ncr)
        ? "Bu NCR'ı göndermek için atanan takıma üye olmanız gerekir."
        : null;
  useEffect(() => {
    if (detail.isError) {
      notify.error('NCR yüklenirken hata oluştu');
      onClose();
    } else if (blocked) {
      notify.warning(blocked);
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.isError, blocked]);
  if (!ncr || blocked) return null;
  return <NcrSubmitModal ncr={ncr} onClose={onClose} />;
}

/** Port of quality-control/ncrs (ncrs.js, ncrForm.js, ncrFileStager.js). */
export function NcrsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const url = useUrlFilters(URL_DEFAULTS);
  const { values, apply } = url;

  const groupsQuery = useNcrGroups();
  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);
  // NCRs outlive their job orders, so completed jobs stay filterable.
  const jobOrders = useJobOrderOptions({ includeAll: true });

  const canDecide = canDecideNcrs(user);
  const teamDefault = useMemo(
    () => defaultTeamSelection(user, groups).filter((v) => v !== ALL_VALUE),
    [user, groups],
  );
  const statuses = useMemo(
    () => parseSelection(values.status__in, DEFAULT_STATUS_FILTER),
    [values.status__in],
  );
  const teams = useMemo(
    () => parseSelection(values.assigned_team__in, teamDefault),
    [values.assigned_team__in, teamDefault],
  );

  const filters = useMemo<FilterState>(
    () => ({
      search: values.search,
      status__in: statuses,
      assigned_team__in: teams,
      severity: values.severity,
      defect_type: values.defect_type,
    }),
    [values.search, statuses, teams, values.severity, values.defect_type],
  );

  const filterConfig = useMemo<FilterConfig<keyof FilterState>[]>(
    () => [
      { type: 'text', key: 'search', label: 'Arama', placeholder: 'NCR no, başlık, açıklama...' },
      {
        type: 'multiselect',
        key: 'status__in',
        label: 'Durum',
        options: NCR_STATUS_CHOICES.map(({ value, label }) => ({ value, label })),
      },
      {
        type: 'multiselect',
        key: 'assigned_team__in',
        label: 'Atanan Grup',
        options: groups.map((g) => ({
          value: String(g.id),
          label: g.display_name || g.name || `#${g.id}`,
        })),
      },
      {
        type: 'select',
        key: 'severity',
        label: 'Önem Derecesi',
        placeholder: 'Tümü',
        options: SEVERITY_CHOICES,
      },
      {
        type: 'select',
        key: 'defect_type',
        label: 'Kusur Tipi',
        placeholder: 'Tümü',
        options: DEFECT_TYPE_CHOICES,
      },
    ],
    [groups],
  );

  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering || '-created_at');
  const ordering = toOrdering(sort.sortBy, sort.sortDir);

  const params: NcrListParams = {
    ...selectionParams(statuses, teams),
    severity: values.severity,
    defect_type: values.defect_type,
    job_order: values.job_order,
    search: values.search,
    ordering,
    page,
    page_size: pageSize,
  };
  // Legacy narrows to the user's own groups by default, so it waits for the groups first.
  const teamsKnown = values.assigned_team__in !== '' || !groupsQuery.isPending;
  const list = useQuery({
    ...ncrsQueryOptions(params),
    enabled: teamsKnown,
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError) notify.error("NCR'lar yüklenirken hata oluştu");
  }, [list.isError, list.errorUpdatedAt]);

  const columns = useMemo(() => ncrColumns(user, groups), [user, groups]);

  // ---- details (and the ?ncr= deep link) ----
  const [detailId, setDetailId] = useState<number | null>(null);
  const lookup = useQuery({
    ...ncrLookupQueryOptions(values.ncr),
    enabled: values.ncr !== '' && detailId === null,
    staleTime: 0,
  });
  const openId = detailId ?? (values.ncr ? (lookup.data?.id ?? null) : null);

  useEffect(() => {
    if (!values.ncr || detailId !== null) return;
    if (lookup.isError || (lookup.isSuccess && lookup.data === null)) {
      if (lookup.isError) console.error('Error loading NCR from URL parameter:', lookup.error);
      notify.error('NCR yüklenirken hata oluştu');
      apply({ ncr: '' });
    }
  }, [values.ncr, detailId, lookup.isError, lookup.isSuccess, lookup.data, lookup.error, apply]);

  const closeDetails = () => {
    setDetailId(null);
    apply({ ncr: '' });
  };

  // ---- create / edit / submit / decide ----
  const [followUp, setFollowUp] = useState<FollowUp | null>(null);
  const closeFollowUp = () => {
    // Opened from the form, it brings the form back (refetched) whether saved or not.
    setFollowUp(null);
  };
  const detailsHidden =
    followUp !== null && 'returnToDetails' in followUp && followUp.returnToDetails;

  const startEdit = (row: Ncr, returnToDetails = false) => {
    if (!canDecide) {
      notify.warning(
        'Bu işlem için yetkiniz yok. Sadece "kalite-kontrol" grubu veya superuser düzenleyebilir.',
      );
      return;
    }
    setFollowUp({ kind: 'edit', id: row.id, returnToDetails });
  };

  const startDecision = (row: Ncr, approve: boolean) => {
    if (!canDecide) {
      notify.warning(
        'Bu işlem için yetkiniz yok. Sadece "kalite-kontrol" grubu veya superuser karar verebilir.',
      );
      return;
    }
    if (!isSubmitted(row)) {
      notify.warning('Sadece "Gönderildi" durumundaki NCR kayıtları için onay/red verilebilir.');
      return;
    }
    setFollowUp({ kind: 'decide', ncr: row, approve });
  };

  // ---- close ----
  const closeNcr = useCloseNcr();
  const handleClose = async (row: Ncr) => {
    if (!isClosable(row)) {
      notify.warning('Sadece "Onaylandı" durumundaki NCR kayıtları kapatılabilir.');
      return;
    }
    const ok = await confirm({
      title: 'NCR Kapat',
      icon: 'fas fa-lock',
      message: `"${row.ncr_number || row.title}" NCR'sını kapatmak istediğinizden emin misiniz?`,
      confirmLabel: 'Kapat',
      cancelLabel: 'İptal',
    });
    if (!ok) return;
    try {
      await closeNcr.mutateAsync(row.id);
      notify.success('NCR başarıyla kapatıldı');
    } catch (error) {
      notify.error(error, { fallback: 'NCR kapatılırken hata oluştu' });
    }
  };

  const rowActions = (row: Ncr): RowAction<Ncr>[] => [
    { key: 'view', label: 'Detaylar', icon: 'fas fa-eye', onClick: (r) => setDetailId(r.id) },
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'primary',
      hidden: !canDecide,
      onClick: (r) => startEdit(r),
    },
    {
      key: 'submit',
      label: 'Gönder',
      icon: 'fas fa-paper-plane',
      hidden: !canSubmit(user, row),
      onClick: (r) => setFollowUp({ kind: 'submit', id: r.id, returnToDetails: false }),
    },
    {
      key: 'approve',
      label: 'Onayla',
      icon: 'fas fa-check',
      hidden: !(canDecide && isSubmitted(row)),
      onClick: (r) => startDecision(r, true),
    },
    {
      key: 'reject',
      label: 'Reddet',
      icon: 'fas fa-times',
      color: 'danger',
      hidden: !(canDecide && isSubmitted(row)),
      onClick: (r) => startDecision(r, false),
    },
    {
      key: 'close',
      label: 'Kapat',
      icon: 'fas fa-lock',
      hidden: !isClosable(row),
      onClick: (r) => void handleClose(r),
    },
  ];

  const refresh = () => {
    // Legacy refresh goes back to page 1 and reloads.
    if (page === 1) {
      void list.refetch();
    } else {
      void queryClient.invalidateQueries({ queryKey: ncrKeys.all, refetchType: 'none' });
      apply({ page: '1' });
    }
  };

  const jobOrderOptions = useMemo(
    () =>
      (jobOrders.data ?? []).map((jo) => ({
        value: jo.job_no,
        label: `${jo.job_no}${jo.title ? ` - ${jo.title}` : ''}`,
      })),
    [jobOrders.data],
  );

  return (
    <>
      <PageHeader
        title="Uygunsuzluk Raporları"
        subtitle="NCR'ları görüntüleyin, oluşturun ve yönetin"
        icon="fas fa-exclamation-triangle"
        stats={[
          {
            id: 'ncr-total-count',
            label: 'Toplam',
            value: list.isPending ? '–' : total.toLocaleString('tr-TR'),
          },
        ]}
        actions={
          <Button
            leftSection={<FaIcon icon="fas fa-plus" />}
            onClick={() => setFollowUp({ kind: 'create' })}
          >
            Yeni Oluştur
          </Button>
        }
      />

      <DataTable
        columnsKey="ncrs"
        title="Uygunsuzluk Raporları"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) =>
              apply({
                search: next.search,
                severity: next.severity,
                defect_type: next.defect_type,
                status__in: selectionToUrl(next.status__in),
                assigned_team__in: selectionToUrl(next.assigned_team__in),
                page: '1',
              })
            }
            // Temizle goes back to the defaults, not to an unfiltered list.
            onClear={() =>
              apply({
                search: '',
                status__in: '',
                assigned_team__in: '',
                severity: '',
                defect_type: '',
                job_order: '',
                page: '1',
              })
            }
            extra={
              <Select
                size="xs"
                w={220}
                aria-label="İş Emri"
                placeholder="İş Emri"
                searchable
                clearable
                data={jobOrderOptions}
                value={values.job_order || null}
                onChange={(value) => apply({ job_order: value ?? '', page: '1' })}
                nothingFoundMessage="Sonuç bulunamadı"
                comboboxProps={{ withinPortal: true }}
              />
            }
          />
        }
        data={rows}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching || !teamsKnown}
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
        emptyMessage="NCR bulunamadı"
        onRefresh={refresh}
      />

      {openId !== null ? (
        <NcrDetailModal
          key={openId}
          ncrId={openId}
          currentUser={user}
          groups={groups}
          hidden={detailsHidden}
          onLoaded={(ncr) => {
            if (ncr.ncr_number && ncr.ncr_number !== values.ncr) apply({ ncr: ncr.ncr_number });
          }}
          onClose={closeDetails}
          onEdit={(ncr) => startEdit(ncr, true)}
          onSubmit={(ncr) => setFollowUp({ kind: 'submit', id: ncr.id, returnToDetails: true })}
          onDecide={(ncr, approve) => {
            // A decision replaces the form; it doesn't come back afterwards.
            closeDetails();
            startDecision(ncr, approve);
          }}
        />
      ) : null}

      {followUp?.kind === 'create' ? (
        <NcrFormModal currentUser={user} onClose={closeFollowUp} />
      ) : null}
      {followUp?.kind === 'edit' ? (
        <EditLoader key={followUp.id} id={followUp.id} user={user} onClose={closeFollowUp} />
      ) : null}
      {followUp?.kind === 'submit' ? (
        <SubmitLoader key={followUp.id} id={followUp.id} user={user} onClose={closeFollowUp} />
      ) : null}
      {followUp?.kind === 'decide' ? (
        <NcrDecisionModal ncr={followUp.ncr} approve={followUp.approve} onClose={closeFollowUp} />
      ) : null}
    </>
  );
}
