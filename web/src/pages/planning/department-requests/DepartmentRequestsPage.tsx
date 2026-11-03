import { Button, SimpleGrid, Stack, Text } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  approvedDepartmentRequestsQueryOptions,
  DEPARTMENT_OPTIONS,
  departmentRequestQueryOptions,
  type DepartmentRequest,
} from '@/api/general/departmentRequests';
import {
  cancelPlanningRequest,
  planningRequestKeys,
  planningRequestQueryOptions,
  planningRequestsQueryOptions,
  type PlanningRequest,
  type PlanningRequestInput,
} from '@/api/planning/planningRequests';
import { userLabel, useUsers, type UserOption } from '@/api/reference';
import { useAuth } from '@/auth/AuthProvider';
import {
  confirm,
  DataTable,
  errorMessage,
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
import { approvedRequestColumns, PlanningStatusBadge, planningRequestColumns } from './columns';
import { DepartmentRequestDetailModal } from './DepartmentRequestDetailModal';
import { canCancelPlanningRequest, PLANNING_STATUS_OPTIONS, PRIORITY_OPTIONS } from './logic';
import { PlanningRequestDetailModal } from './PlanningRequestDetailModal';
import { PlanningRequestFormModal, type PlanningRequestFormMode } from './PlanningRequestFormModal';
import { TransferWorkflowModal } from './TransferWorkflowModal';

/** organization.UserGroup slug whose members make up the planlama team. */
const PLANNING_TEAM_GROUP = 'planlama';
const PAGE_SIZE = 20;

// Each table's filters, page and sort live in the URL under its own prefix:
// dr_ approved department requests, erp_ pending ERP entry, pr_ planning
// requests. `request` opens a department request, `talep` a planning request
// by number (the link notification e-mails and other pages build).
const URL_DEFAULTS = {
  dr_department: '',
  dr_priority: '',
  dr_requestor: '',
  dr_page: '1',
  dr_ordering: '-id',
  erp_priority: '',
  erp_created_by: '',
  erp_department_request: '',
  erp_page: '1',
  erp_ordering: '-id',
  pr_request_number: '',
  pr_status: '',
  pr_priority: '',
  pr_created_by: '',
  pr_department_request: '',
  pr_page: '1',
  pr_ordering: '-id',
  request: '',
  talep: '',
};

type DrKeys = 'dr_department' | 'dr_priority' | 'dr_requestor';
type ErpKeys = 'erp_priority' | 'erp_created_by' | 'erp_department_request';
type PrKeys =
  'pr_request_number' | 'pr_status' | 'pr_priority' | 'pr_created_by' | 'pr_department_request';

const EMPTY_DEPARTMENT: DepartmentRequest[] = [];
const EMPTY_PLANNING: PlanningRequest[] = [];

const toOptions = (list: readonly { value: string; label: string }[]) =>
  list.map(({ value, label }) => ({ value, label }));

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function pick<K extends string>(values: Record<string, string>, keys: readonly K[]) {
  return Object.fromEntries(keys.map((k) => [k, values[k] ?? ''])) as Record<K, string>;
}

const DR_KEYS = ['dr_department', 'dr_priority', 'dr_requestor'] as const;
const ERP_KEYS = ['erp_priority', 'erp_created_by', 'erp_department_request'] as const;
const PR_KEYS = [
  'pr_request_number',
  'pr_status',
  'pr_priority',
  'pr_created_by',
  'pr_department_request',
] as const;

const userValue = (u: Pick<UserOption, 'id' | 'username'>) => (u.id ? String(u.id) : u.username);

/** Port of planning/department-requests (department-requests.js + modals.js). */
export function DepartmentRequestsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);

  // ---- filter options ----
  // "Talep Eden" spans all users: department requests come from every department.
  const allUsers = useUsers();
  const planningUsers = useUsers({ group: PLANNING_TEAM_GROUP });
  const requestorOptions = useMemo(
    () => (allUsers.data ?? []).map((u) => ({ value: userValue(u), label: userLabel(u) })),
    [allUsers.data],
  );
  // "Oluşturan" is the planlama team, plus the current user so they can find their own.
  const createdByOptions = useMemo(() => {
    const options = (planningUsers.data ?? []).map((u) => ({
      value: userValue(u),
      label: userLabel(u),
    }));
    if (user?.id && !options.some((o) => o.value === String(user.id))) {
      options.unshift({
        value: String(user.id),
        label: userLabel(user as unknown as UserOption),
      });
    }
    return options;
  }, [planningUsers.data, user]);
  const createdByPlaceholder = planningUsers.isError ? 'Kullanıcı yüklenemedi' : 'Kullanıcı seçin';

  const drFilters = useMemo<FilterConfig<DrKeys>[]>(
    () => [
      {
        type: 'select',
        key: 'dr_department',
        label: 'Departman',
        placeholder: 'Departman seçin',
        searchable: false,
        options: toOptions(DEPARTMENT_OPTIONS),
      },
      {
        type: 'select',
        key: 'dr_priority',
        label: 'Öncelik',
        placeholder: 'Öncelik seçin',
        searchable: false,
        options: PRIORITY_OPTIONS,
      },
      {
        type: 'select',
        key: 'dr_requestor',
        label: 'Talep Eden',
        placeholder: allUsers.isError ? 'Kullanıcı yüklenemedi' : 'Kullanıcı seçin',
        searchable: true,
        options: requestorOptions,
      },
    ],
    [requestorOptions, allUsers.isError],
  );
  const erpFilters = useMemo<FilterConfig<ErpKeys>[]>(
    () => [
      {
        type: 'select',
        key: 'erp_priority',
        label: 'Öncelik',
        placeholder: 'Öncelik seçin',
        searchable: false,
        options: PRIORITY_OPTIONS,
      },
      {
        type: 'select',
        key: 'erp_created_by',
        label: 'Oluşturan',
        placeholder: createdByPlaceholder,
        searchable: true,
        options: createdByOptions,
      },
      {
        type: 'text',
        key: 'erp_department_request',
        label: 'Departman Talebi No',
        placeholder: 'Departman talebi numarası',
        inputType: 'number',
      },
    ],
    [createdByOptions, createdByPlaceholder],
  );
  const prFilters = useMemo<FilterConfig<PrKeys>[]>(
    () => [
      {
        type: 'text',
        key: 'pr_request_number',
        label: 'Talep Numarası',
        placeholder: 'Talep numarası',
      },
      {
        type: 'select',
        key: 'pr_status',
        label: 'Durum',
        placeholder: 'Durum seçin',
        searchable: false,
        options: PLANNING_STATUS_OPTIONS,
      },
      {
        type: 'select',
        key: 'pr_priority',
        label: 'Öncelik',
        placeholder: 'Öncelik seçin',
        searchable: false,
        options: PRIORITY_OPTIONS,
      },
      {
        type: 'select',
        key: 'pr_created_by',
        label: 'Oluşturan',
        placeholder: createdByPlaceholder,
        searchable: true,
        options: createdByOptions,
      },
      {
        type: 'text',
        key: 'pr_department_request',
        label: 'Departman Talebi No',
        placeholder: 'Departman talebi numarası',
        inputType: 'number',
      },
    ],
    [createdByOptions, createdByPlaceholder],
  );

  // ---- lists ----
  const drPage = positiveInt(values.dr_page, 1);
  const drSort = fromOrdering(values.dr_ordering || '-id');
  const approved = useQuery({
    ...approvedDepartmentRequestsQueryOptions({
      page: drPage,
      page_size: PAGE_SIZE,
      ordering: toOrdering(drSort.sortBy, drSort.sortDir) ?? '-id',
      department: values.dr_department || undefined,
      priority: values.dr_priority || undefined,
      requestor: values.dr_requestor || undefined,
    }),
    placeholderData: keepPreviousData,
  });

  const erpPage = positiveInt(values.erp_page, 1);
  const erpSort = fromOrdering(values.erp_ordering || '-id');
  const pendingErp = useQuery({
    ...planningRequestsQueryOptions({
      page: erpPage,
      page_size: PAGE_SIZE,
      ordering: toOrdering(erpSort.sortBy, erpSort.sortDir) ?? '-id',
      status: 'pending_erp_entry',
      priority: values.erp_priority || undefined,
      created_by: values.erp_created_by || undefined,
      department_request: values.erp_department_request.trim() || undefined,
    }),
    placeholderData: keepPreviousData,
  });

  const prPage = positiveInt(values.pr_page, 1);
  const prSort = fromOrdering(values.pr_ordering || '-id');
  const planning = useQuery({
    ...planningRequestsQueryOptions({
      page: prPage,
      page_size: PAGE_SIZE,
      ordering: toOrdering(prSort.sortBy, prSort.sortDir) ?? '-id',
      status: values.pr_status || undefined,
      priority: values.pr_priority || undefined,
      created_by: values.pr_created_by || undefined,
      department_request: values.pr_department_request.trim() || undefined,
      request_number: values.pr_request_number.trim() || undefined,
    }),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (approved.isError) {
      notify.error(`Departman talepleri yüklenirken hata oluştu: ${errorMessage(approved.error)}`);
    }
  }, [approved.isError, approved.errorUpdatedAt, approved.error]);
  useEffect(() => {
    if (pendingErp.isError) {
      notify.error(`Planlama talepleri yüklenirken hata oluştu: ${errorMessage(pendingErp.error)}`);
    }
  }, [pendingErp.isError, pendingErp.errorUpdatedAt, pendingErp.error]);
  useEffect(() => {
    if (planning.isError) {
      notify.error(`Planlama talepleri yüklenirken hata oluştu: ${errorMessage(planning.error)}`);
    }
  }, [planning.isError, planning.errorUpdatedAt, planning.error]);

  // ---- department request details (?request=<id>) ----
  const detailId = values.request;
  const departmentDetail = useQuery({
    ...departmentRequestQueryOptions(detailId || 0),
    enabled: Boolean(detailId),
  });
  useEffect(() => {
    if (!detailId || !departmentDetail.isError) return;
    notify.error(
      `Talep detayları yüklenirken hata oluştu: ${errorMessage(departmentDetail.error)}`,
    );
    apply({ request: '' });
  }, [detailId, departmentDetail.isError, departmentDetail.error, apply]);

  // ---- planning request details ----
  // Opens once the record is loaded (legacy fetched, then showed the modal).
  const [planningDetailId, setPlanningDetailId] = useState<number | null>(null);
  const planningDetail = useQuery({
    ...planningRequestQueryOptions(planningDetailId ?? 0),
    enabled: planningDetailId !== null,
    staleTime: 10_000,
  });
  const openPlanningDetail = async (id: number) => {
    try {
      await queryClient.fetchQuery({ ...planningRequestQueryOptions(id), staleTime: 0 });
      setPlanningDetailId(id);
    } catch (error) {
      notify.error(`Planlama talebi detayları yüklenirken hata oluştu: ${errorMessage(error)}`);
    }
  };
  const closePlanningDetail = () => {
    setPlanningDetailId(null);
    if (values.talep) apply({ talep: '' });
  };

  // ?talep=<request number>: a planning request by number, else an approved
  // department request found by search (legacy openModalFromTalepNo).
  const resolvedTalep = useRef('');
  const talep = values.talep;
  useEffect(() => {
    if (!talep || resolvedTalep.current === talep) return;
    resolvedTalep.current = talep;
    void (async () => {
      try {
        const planningMatches = await queryClient.fetchQuery(
          planningRequestsQueryOptions({ request_number: talep }),
        );
        const match = planningMatches.results.find((r) => r.request_number === talep);
        if (match) {
          await queryClient.fetchQuery(planningRequestQueryOptions(match.id));
          setPlanningDetailId(match.id);
          return;
        }
        const departmentMatches = await queryClient.fetchQuery(
          approvedDepartmentRequestsQueryOptions({ search: talep }),
        );
        const department = departmentMatches.results[0];
        if (department) apply({ request: String(department.id) });
        else notify.error(`Talep ${talep} bulunamadı`);
      } catch (error) {
        notify.error(`Talep ${talep} açılırken hata oluştu: ${errorMessage(error)}`);
      }
    })();
  }, [talep, queryClient, apply]);

  // ---- create / edit / transfer ----
  const [formMode, setFormMode] = useState<PlanningRequestFormMode | null>(null);
  const [workflow, setWorkflow] = useState<{
    request: PlanningRequestInput;
    departmentRequestId?: number;
  } | null>(null);
  const [transferring, setTransferring] = useState(false);

  const transfer = async (id: number) => {
    setTransferring(true);
    try {
      const request = await queryClient.fetchQuery({
        ...departmentRequestQueryOptions(id),
        staleTime: 0,
      });
      apply({ request: '', talep: '' });
      setFormMode({ kind: 'create', departmentRequest: request });
    } catch (error) {
      notify.error(`Departman talebi yüklenirken hata oluştu: ${errorMessage(error)}`);
    } finally {
      setTransferring(false);
    }
  };

  const edit = async (id: number) => {
    try {
      const request = await queryClient.fetchQuery({
        ...planningRequestQueryOptions(id),
        staleTime: 0,
      });
      setFormMode({ kind: 'edit', request });
    } catch (error) {
      notify.error(`Planlama talebi düzenlenirken hata oluştu: ${errorMessage(error)}`);
    }
  };

  const cancel = async (id: number) => {
    let request: PlanningRequest;
    try {
      request = await queryClient.fetchQuery({ ...planningRequestQueryOptions(id), staleTime: 0 });
    } catch (error) {
      notify.error(`Planlama talebi iptal edilirken hata oluştu: ${errorMessage(error)}`);
      return;
    }
    if (request.status === 'cancelled') {
      notify.warning('Bu planlama talebi zaten iptal edilmiş');
      return;
    }
    if (!canCancelPlanningRequest(request.status)) {
      notify.error('Dönüştürülmüş veya tamamlanmış planlama talepleri iptal edilemez');
      return;
    }
    const ok = await confirm({
      title: 'Planlama Talebi İptali',
      icon: 'fas fa-times-circle',
      message: 'Bu planlama talebini iptal etmek istediğinizden emin misiniz?',
      description: 'İptal edilen talepler geri alınamaz.',
      details: (
        <SimpleGrid cols={2} spacing={4}>
          <Text size="sm">
            <strong>Talep No:</strong> #{request.id}
          </Text>
          <Text size="sm">
            <strong>Talep Numarası:</strong> {request.request_number || '-'}
          </Text>
          <Text size="sm" style={{ gridColumn: '1 / -1' }}>
            <strong>Başlık:</strong> {request.title || '-'}
          </Text>
          <Text size="sm" component="div">
            <strong>Durum:</strong> <PlanningStatusBadge row={request} />
          </Text>
          <Text size="sm">
            <strong>Ürün Sayısı:</strong> {request.items?.length || 0} ürün
          </Text>
        </SimpleGrid>
      ),
      confirmLabel: 'Evet, İptal Et',
      cancelLabel: 'Vazgeç',
      danger: true,
    });
    if (!ok) return;
    try {
      await cancelPlanningRequest(id);
      notify.success('Planlama talebi başarıyla iptal edildi');
      await queryClient.invalidateQueries({ queryKey: planningRequestKeys.all });
    } catch (error) {
      notify.error(`Planlama talebi iptal edilirken hata oluştu: ${errorMessage(error)}`);
    }
  };

  // ---- row actions ----
  const approvedActions = (row: DepartmentRequest): RowAction<DepartmentRequest>[] => [
    {
      key: 'view',
      label: 'Detayları Görüntüle',
      icon: 'fas fa-eye',
      color: 'primary',
      onClick: () => apply({ request: String(row.id) }),
    },
    {
      key: 'transfer',
      label: 'Transfer Et',
      icon: 'fas fa-exchange-alt',
      color: 'info',
      onClick: () => void transfer(row.id),
      hidden: row.status !== 'approved',
    },
  ];
  const planningActions = (row: PlanningRequest): RowAction<PlanningRequest>[] => [
    {
      key: 'view',
      label: 'Detayları Görüntüle',
      icon: 'fas fa-eye',
      color: 'primary',
      onClick: () => void openPlanningDetail(row.id),
    },
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'success',
      onClick: () => void edit(row.id),
    },
    {
      key: 'cancel',
      label: 'İptal Et',
      icon: 'fas fa-times-circle',
      color: 'danger',
      onClick: () => void cancel(row.id),
      hidden: !canCancelPlanningRequest(row.status),
    },
  ];
  const pendingErpActions = (row: PlanningRequest): RowAction<PlanningRequest>[] => [
    {
      key: 'view',
      label: 'Detayları Görüntüle',
      icon: 'fas fa-eye',
      color: 'primary',
      onClick: () => void openPlanningDetail(row.id),
    },
  ];

  const filtersCleared = () => notify.info('Filtreler temizlendi');

  return (
    <>
      <PageHeader
        title="Aktarılacak Departman Talepleri"
        subtitle="Aktarılacak departman talepleri ve planlama talepleri listesi"
        icon="boxes"
        backTo="/planning"
        actions={
          <Button
            leftSection={<FaIcon icon="fas fa-plus" />}
            onClick={() => setFormMode({ kind: 'create' })}
          >
            Yeni Planlama Talebi
          </Button>
        }
      />

      <Stack gap="lg">
        {/* Legacy put the first two side by side; at half width the actions scroll out of view. */}
        <Stack gap="sm">
          <FilterBar
            title="Departman Talepleri Filtreleri"
            filters={drFilters}
            values={pick(values, DR_KEYS)}
            onApply={(next) => apply({ ...next, dr_page: '1' })}
            onClear={() => {
              apply({ dr_department: '', dr_priority: '', dr_requestor: '', dr_page: '1' });
              filtersCleared();
            }}
          />
          <DataTable
            title="Aktarılacak Departman Talepleri"
            icon="fas fa-check-circle"
            data={approved.data?.results ?? EMPTY_DEPARTMENT}
            columns={approvedRequestColumns}
            getRowId={(row) => String(row.id)}
            loading={approved.isFetching}
            sort={{
              sortBy: drSort.sortBy,
              sortDir: drSort.sortDir,
              onSortChange: (sortBy, sortDir) =>
                apply({ dr_ordering: toOrdering(sortBy, sortDir) ?? '-id', dr_page: '1' }),
            }}
            pagination={{
              page: drPage,
              pageSize: PAGE_SIZE,
              total: approved.data?.count ?? 0,
              onPageChange: (next) => apply({ dr_page: String(next) }),
            }}
            rowActions={approvedActions}
            emptyMessage="Aktarılacak departman talebi bulunamadı."
            onRefresh={() => void approved.refetch()}
          />
        </Stack>
        <Stack gap="sm">
          <FilterBar
            title="ERP Girişi Bekleyen Planlama Talepleri Filtreleri"
            filters={erpFilters}
            values={pick(values, ERP_KEYS)}
            onApply={(next) => apply({ ...next, erp_page: '1' })}
            onClear={() => {
              apply({
                erp_priority: '',
                erp_created_by: '',
                erp_department_request: '',
                erp_page: '1',
              });
              filtersCleared();
            }}
          />
          <DataTable
            title="ERP Girişi Bekleyen Planlama Talepleri"
            icon="fas fa-clock"
            data={pendingErp.data?.results ?? EMPTY_PLANNING}
            columns={planningRequestColumns}
            getRowId={(row) => String(row.id)}
            loading={pendingErp.isFetching}
            sort={{
              sortBy: erpSort.sortBy,
              sortDir: erpSort.sortDir,
              onSortChange: (sortBy, sortDir) =>
                apply({ erp_ordering: toOrdering(sortBy, sortDir) ?? '-id', erp_page: '1' }),
            }}
            pagination={{
              page: erpPage,
              pageSize: PAGE_SIZE,
              total: pendingErp.data?.count ?? 0,
              onPageChange: (next) => apply({ erp_page: String(next) }),
            }}
            rowActions={pendingErpActions}
            emptyMessage="ERP girişi bekleyen planlama talebi bulunamadı."
            onRefresh={() => void pendingErp.refetch()}
          />
        </Stack>

        <FilterBar
          title="Planlama Talepleri Filtreleri"
          filters={prFilters}
          values={pick(values, PR_KEYS)}
          onApply={(next) => apply({ ...next, pr_page: '1' })}
          onClear={() => {
            apply({
              pr_request_number: '',
              pr_status: '',
              pr_priority: '',
              pr_created_by: '',
              pr_department_request: '',
              pr_page: '1',
            });
            filtersCleared();
          }}
        />
        <DataTable
          title="Planlama Talepleri"
          icon="fas fa-clipboard-list"
          data={planning.data?.results ?? EMPTY_PLANNING}
          columns={planningRequestColumns}
          getRowId={(row) => String(row.id)}
          loading={planning.isFetching}
          sort={{
            sortBy: prSort.sortBy,
            sortDir: prSort.sortDir,
            onSortChange: (sortBy, sortDir) =>
              apply({ pr_ordering: toOrdering(sortBy, sortDir) ?? '-id', pr_page: '1' }),
          }}
          pagination={{
            page: prPage,
            pageSize: PAGE_SIZE,
            total: planning.data?.count ?? 0,
            onPageChange: (next) => apply({ pr_page: String(next) }),
          }}
          rowActions={planningActions}
          emptyMessage="Planlama talebi bulunamadı."
          onRefresh={() => void planning.refetch()}
        />
      </Stack>

      {detailId ? (
        <DepartmentRequestDetailModal
          request={departmentDetail.data}
          loading={departmentDetail.isFetching}
          onClose={() => apply({ request: '', talep: '' })}
          onTransfer={(request) => void transfer(request.id)}
          transferring={transferring}
        />
      ) : null}

      {planningDetailId !== null ? (
        <PlanningRequestDetailModal
          request={planningDetail.data}
          loading={planningDetail.isFetching}
          onClose={closePlanningDetail}
        />
      ) : null}

      {formMode ? (
        <PlanningRequestFormModal
          key={formMode.kind === 'edit' ? `edit-${formMode.request.id}` : 'create'}
          mode={formMode}
          onClose={() => setFormMode(null)}
          onCreateReady={(request, departmentRequestId) =>
            setWorkflow({ request, departmentRequestId })
          }
        />
      ) : null}

      {workflow ? (
        <TransferWorkflowModal
          request={workflow.request}
          departmentRequestId={workflow.departmentRequestId}
          onClose={() => setWorkflow(null)}
        />
      ) : null}
    </>
  );
}
