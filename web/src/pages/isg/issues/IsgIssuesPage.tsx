import { Button } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ISG_CATEGORY_CHOICES,
  ISG_SEVERITY_CHOICES,
  ISG_STATUS_CHOICES,
  isgFilteredSummaryQueryOptions,
  isgIssuesQueryOptions,
  useIsgAction,
  useIsgPermissions,
  type IsgIssue,
  type IsgIssueFilters,
} from '@/api/isg/issues';
import { useUsers } from '@/api/reference/users';
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
import { isgColumns } from './columns';
import { IsgIssueDetailModal, type IsgDetailAction } from './IsgIssueDetailModal';
import {
  IsgFileUploadModal,
  IsgIssueFormModal,
  IsgWorkflowModal,
  type IsgWorkflowKind,
} from './IsgModals';

// Everything but the two terminal states: the page is a worklist first, an
// archive second, so a fresh visit shows what still needs somebody.
const DEFAULT_STATUS_FILTER = ['open', 'in_progress', 'resolved'];

// Every piece of page state lives in the URL under the legacy keys; the
// multi-value filters stay comma lists (?status__in=open,in_progress), which
// the management dashboard links to. `issue` is the deep link (?issue=ISG-…).
const URL_DEFAULTS = {
  search: '',
  status__in: '',
  severity__in: '',
  category: '',
  assigned_to: '',
  mine: false,
  overdue: false,
  page: '1',
  page_size: '20',
  ordering: '-created_at',
  issue: '',
};

type FilterKeys =
  'status__in' | 'severity__in' | 'category' | 'assigned_to' | 'search' | 'mine' | 'overdue';
type FilterState = {
  status__in: string[];
  severity__in: string[];
  category: string;
  assigned_to: string;
  search: string;
  mine: boolean;
  overdue: boolean;
};

const EMPTY_ROWS: IsgIssue[] = [];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const commaList = (value: string) => value.split(',').filter(Boolean);

type Child =
  | { kind: 'create' }
  | { kind: 'edit'; issue: IsgIssue }
  | { kind: IsgWorkflowKind; issue: IsgIssue }
  | { kind: 'upload'; issue: IsgIssue };

/** Port of isg/issues (issues.js). */
export function IsgIssuesPage() {
  const { user } = useAuth();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const permissions = useIsgPermissions();
  const canManage = Boolean(permissions.data?.can_manage);
  const users = useUsers();

  const statuses = useMemo(
    () => (values.status__in ? commaList(values.status__in) : DEFAULT_STATUS_FILTER),
    [values.status__in],
  );
  const filters = useMemo<FilterState>(
    () => ({
      status__in: statuses,
      severity__in: commaList(values.severity__in),
      category: values.category,
      assigned_to: values.assigned_to,
      search: values.search,
      mine: values.mine,
      overdue: values.overdue,
    }),
    [
      statuses,
      values.severity__in,
      values.category,
      values.assigned_to,
      values.search,
      values.mine,
      values.overdue,
    ],
  );

  const apiFilters: IsgIssueFilters = {
    status__in: statuses.join(','),
    severity__in: values.severity__in || undefined,
    category: values.category || undefined,
    assigned_to: values.assigned_to || undefined,
    mine: values.mine ? 'true' : undefined,
    overdue: values.overdue ? 'true' : undefined,
    search: values.search || undefined,
  };
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering || '-created_at');
  const ordering = toOrdering(sort.sortBy, sort.sortDir) ?? '-created_at';

  const list = useQuery({
    ...isgIssuesQueryOptions({ ...apiFilters, ordering, page, page_size: pageSize }),
    placeholderData: keepPreviousData,
  });
  // The cards follow the filters minus the status filter, or "Kapatıldı" would
  // always read 0 under the default worklist view.
  const summaryFilters: IsgIssueFilters = { ...apiFilters, status__in: undefined };
  const summary = useQuery({
    ...isgFilteredSummaryQueryOptions(summaryFilters),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError)
      notify.error(list.error, { fallback: 'İSG bildirimleri yüklenirken hata oluştu' });
  }, [list.isError, list.error]);

  const isAssignedToMe = (issue: IsgIssue) =>
    (issue.assigned_to ?? []).some((id) => Number(id) === Number(user.id));
  const canAct = (issue: IsgIssue) => canManage || isAssignedToMe(issue);

  // ---- the detail modal and the modals opened from it ----
  const [detailId, setDetailId] = useState<number | null>(null);
  const [child, setChild] = useState<Child | null>(null);
  // Opened from the details: go back there when it closes.
  const [returnToDetails, setReturnToDetails] = useState(false);

  // ?issue=ISG-2026-001: find the issue by number (legacy openIssueByNumber).
  const lookup = useQuery({
    ...isgIssuesQueryOptions({
      search: values.issue,
      ordering: '-created_at',
      page: 1,
      page_size: 5,
    }),
    enabled: Boolean(values.issue) && detailId === null,
  });
  const linkedId =
    lookup.data?.results.find((row) => row.issue_number === values.issue)?.id ?? null;
  const openId = detailId ?? (values.issue ? linkedId : null);
  useEffect(() => {
    if (!values.issue || detailId !== null) return;
    if (lookup.isError || (lookup.data && linkedId === null)) {
      if (!lookup.isError) notify.warning('Bildirim bulunamadı');
      apply({ issue: '' });
    }
  }, [values.issue, detailId, lookup.isError, lookup.data, linkedId, apply]);

  const openDetails = (issue: Pick<IsgIssue, 'id' | 'issue_number'>) => {
    setDetailId(issue.id);
    apply({ issue: issue.issue_number });
  };
  const closeDetails = () => {
    setDetailId(null);
    setReturnToDetails(false);
    apply({ issue: '' });
  };

  const openChild = (next: Child, fromDetails: boolean) => {
    if (openId !== null && fromDetails) setDetailId(openId);
    setReturnToDetails(fromDetails);
    setChild(next);
  };
  const closeChild = () => {
    setChild(null);
    if (!returnToDetails) closeDetails();
  };

  const action = useIsgAction();
  const start = async (issue: IsgIssue) => {
    try {
      await action.mutateAsync({ id: issue.id, action: 'start' });
      notify.success('Bildirim işleme alındı');
    } catch (error) {
      notify.error(error, { fallback: 'İşlem tamamlanamadı' });
    }
  };
  const cancel = async (issue: IsgIssue) => {
    const ok = await confirm({
      title: 'Bildirimi İptal Et',
      icon: 'fas fa-ban',
      message: `${issue.issue_number} numaralı bildirimi iptal etmek istiyor musunuz?`,
      details: issue.title,
      confirmLabel: 'Evet, İptal Et',
      cancelLabel: 'Vazgeç',
      danger: true,
    });
    if (!ok) return;
    try {
      await action.mutateAsync({ id: issue.id, action: 'cancel' });
      notify.success('Bildirim iptal edildi');
    } catch (error) {
      notify.error(error, { fallback: 'İşlem tamamlanamadı' });
    }
  };

  const onDetailAction = (kind: IsgDetailAction, issue: IsgIssue) => {
    if (kind === 'start') void start(issue);
    else if (kind === 'edit') openChild({ kind: 'edit', issue }, true);
    else openChild({ kind, issue }, true);
  };

  const rowActions = (row: IsgIssue): RowAction<IsgIssue>[] => [
    { key: 'view', label: 'Detaylar', icon: 'fas fa-eye', onClick: (r) => openDetails(r) },
    {
      key: 'start',
      label: 'İşleme Al',
      icon: 'fas fa-play',
      color: 'primary',
      hidden: !(row.status === 'open' && canAct(row)),
      onClick: (r) => void start(r),
    },
    {
      key: 'resolve',
      label: 'Giderildi',
      icon: 'fas fa-check',
      hidden: !(['open', 'in_progress'].includes(row.status) && canAct(row)),
      onClick: (r) => openChild({ kind: 'resolve', issue: r }, false),
    },
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'primary',
      hidden: !canManage,
      onClick: (r) => openChild({ kind: 'edit', issue: r }, false),
    },
    {
      key: 'close',
      label: 'Kapat',
      icon: 'fas fa-lock',
      hidden: !(canManage && ['open', 'in_progress', 'resolved'].includes(row.status)),
      onClick: (r) => openChild({ kind: 'close', issue: r }, false),
    },
    {
      key: 'reopen',
      label: 'Yeniden Aç',
      icon: 'fas fa-rotate-left',
      hidden: !(canManage && ['resolved', 'closed', 'cancelled'].includes(row.status)),
      onClick: (r) => openChild({ kind: 'reopen', issue: r }, false),
    },
    {
      key: 'cancel',
      label: 'İptal Et',
      icon: 'fas fa-ban',
      color: 'danger',
      hidden: !(canManage && ['open', 'in_progress', 'resolved'].includes(row.status)),
      onClick: (r) => void cancel(r),
    },
  ];

  const userOptions = useMemo(
    () =>
      (users.data ?? []).map((u) => ({
        value: String(u.id),
        label: u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username,
      })),
    [users.data],
  );
  const filterConfig: FilterConfig<FilterKeys>[] = [
    { type: 'text', key: 'search', label: 'Arama', placeholder: 'Bildirim no, başlık, yer...' },
    { type: 'multiselect', key: 'status__in', label: 'Durum', options: ISG_STATUS_CHOICES },
    { type: 'multiselect', key: 'severity__in', label: 'Önem', options: ISG_SEVERITY_CHOICES },
    {
      type: 'select',
      key: 'category',
      label: 'Kategori',
      placeholder: 'Tümü',
      options: ISG_CATEGORY_CHOICES,
    },
    {
      type: 'select',
      key: 'assigned_to',
      label: 'Atanan Kişi',
      placeholder: 'Tümü',
      options: userOptions,
    },
    { type: 'checkbox', key: 'mine', label: 'Bana atananlar' },
    { type: 'checkbox', key: 'overdue', label: 'Gecikenler' },
  ];

  const refresh = () => {
    if (page === 1) {
      void list.refetch();
      void summary.refetch();
    } else apply({ page: '1' });
  };

  const figure = (value: number | undefined) =>
    summary.isPending || value === undefined ? '–' : value.toLocaleString('tr-TR');
  const counts = summary.data;

  return (
    <>
      <PageHeader
        title="İSG Bildirimleri"
        subtitle="İş sağlığı ve güvenliği bulgularını takip edin ve kapatın"
        icon="fas fa-helmet-safety"
        backTo="/isg"
        stats={[
          { id: 'isg-total', label: 'Toplam', value: figure(counts?.total) },
          { id: 'isg-open', label: 'Açık', value: figure(counts?.open) },
          { id: 'isg-in-progress', label: 'Devam Eden', value: figure(counts?.in_progress) },
          { id: 'isg-resolved', label: 'Onay Bekleyen', value: figure(counts?.resolved) },
          { id: 'isg-overdue', label: 'Geciken', value: figure(counts?.overdue) },
          { id: 'isg-mine', label: 'Bana Atanan', value: figure(counts?.mine_open) },
        ]}
        actions={
          canManage ? (
            <Button
              leftSection={<FaIcon icon="fas fa-plus" />}
              onClick={() => setChild({ kind: 'create' })}
            >
              Yeni Bildirim
            </Button>
          ) : null
        }
      />

      <DataTable
        title="İSG Bildirimleri"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) =>
              apply({
                search: next.search,
                // Nothing ticked means every status, as in legacy.
                status__in: (next.status__in.length
                  ? next.status__in
                  : ISG_STATUS_CHOICES.map((s) => s.value)
                ).join(','),
                severity__in: next.severity__in.join(','),
                category: next.category,
                assigned_to: next.assigned_to,
                mine: next.mine,
                overdue: next.overdue,
                page: '1',
              })
            }
            onClear={() =>
              apply({
                search: '',
                status__in: '',
                severity__in: '',
                category: '',
                assigned_to: '',
                mine: false,
                overdue: false,
                page: '1',
              })
            }
          />
        }
        data={rows}
        columns={isgColumns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
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
        // The actions depend on the permission answer, which arrives after the rows.
        extraData={canManage}
        emptyMessage="İSG bildirimi bulunamadı."
        onRefresh={refresh}
      />

      {openId !== null ? (
        <IsgIssueDetailModal
          issueId={openId}
          opened={child === null}
          canManage={canManage}
          canAct={canAct}
          onAction={onDetailAction}
          onClose={closeDetails}
        />
      ) : null}

      {child?.kind === 'create' ? (
        <IsgIssueFormModal
          onClose={() => setChild(null)}
          // Legacy opens the new issue right away.
          onSaved={(created) => {
            setReturnToDetails(true);
            openDetails(created);
          }}
        />
      ) : null}
      {child?.kind === 'edit' ? (
        <IsgIssueFormModal issue={child.issue} onClose={closeChild} />
      ) : null}
      {child?.kind === 'resolve' || child?.kind === 'close' || child?.kind === 'reopen' ? (
        <IsgWorkflowModal kind={child.kind} issue={child.issue} onClose={closeChild} />
      ) : null}
      {child?.kind === 'upload' ? (
        <IsgFileUploadModal issue={child.issue} onClose={closeChild} />
      ) : null}
    </>
  );
}
