import { Button, Stack, Tabs, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  approvalPoliciesQueryOptions,
  useApprovalSubjectTypes,
  useApprovalUserGroups,
  useDeletePolicy,
  type ApprovalPolicy,
} from '@/api/it/approvalPolicies';
import {
  DataTable,
  FaIcon,
  notify,
  PageHeader,
  Panel,
  StatusBadge,
  type DataTableColumn,
  type RowAction,
} from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import css from './ApprovalsPage.module.css';
import { PURCHASE_REQUEST, subjectTypeLabel } from './approvalsMeta';
import { confirmDelete, PolicyPanel } from './PolicyPanel';
import { PolicyFormModal } from './PolicyFormModal';

const EMPTY_POLICIES: ApprovalPolicy[] = [];

const count = (value: number | null | undefined) => <span className={css.count}>{Number(value || 0)}</span>;

// Legacy columns; all sort the loaded rows.
const policyColumns: DataTableColumn<ApprovalPolicy>[] = [
  {
    key: 'name',
    header: 'Ad',
    render: (row) => (
      <>
        <Text fw={600} size="sm">
          {row.name}
        </Text>
        {row.subject_type === PURCHASE_REQUEST && (row.min_amount_eur != null || row.max_amount_eur != null) ? (
          <Text size="xs" c="dimmed">
            {row.min_amount_eur != null ? `≥ €${row.min_amount_eur}` : ''}
            {row.max_amount_eur != null ? ` – ≤ €${row.max_amount_eur}` : ''}
          </Text>
        ) : null}
      </>
    ),
  },
  {
    key: 'subject_type',
    header: 'Konu',
    accessor: (row) => subjectTypeLabel(row.subject_type),
  },
  {
    key: 'is_active',
    header: 'Durum',
    width: 90,
    render: (row) =>
      row.is_active ? <StatusBadge color="green">Aktif</StatusBadge> : <StatusBadge color="grey">Pasif</StatusBadge>,
  },
  { key: 'selection_priority', header: 'Öncelik', width: 80, render: (row) => row.selection_priority ?? '-' },
  {
    key: 'stage_count',
    header: 'Aşama',
    width: 70,
    accessor: (row) => (Array.isArray(row.stages) ? row.stages.length : 0),
    render: (row) => count(Array.isArray(row.stages) ? row.stages.length : 0),
  },
  {
    key: 'live_workflow_count',
    header: 'Canlı',
    width: 70,
    accessor: (row) => Number(row.live_workflow_count || 0),
    render: (row) => count(row.live_workflow_count),
  },
  {
    key: 'total_workflow_count',
    header: 'Toplam',
    width: 80,
    accessor: (row) => Number(row.total_workflow_count || 0),
    render: (row) => count(row.total_workflow_count),
  },
  {
    key: 'climb_levels',
    header: 'Kademe',
    width: 80,
    render: (row) =>
      row.climb_levels == null ? (
        <Text span c="dimmed">
          —
        </Text>
      ) : (
        row.climb_levels
      ),
  },
];

interface SubjectTypeRow {
  value: string;
  label: string;
}

const subjectTypeColumns: DataTableColumn<SubjectTypeRow>[] = [
  { key: 'label', header: 'Ad', render: (row) => <strong>{row.label || '-'}</strong> },
  { key: 'value', header: 'Kod', render: (row) => <span className={uiClasses.code}>{row.value || '-'}</span> },
];

function SubjectTypesTab() {
  const types = useApprovalSubjectTypes();
  useEffect(() => {
    if (types.isError) notify.error(types.error, { fallback: 'Konu türleri yüklenemedi.' });
  }, [types.isError, types.error]);
  const rows: SubjectTypeRow[] = (types.data ?? []).map((st) => ({
    value: String(st.value ?? ''),
    label: String(st.label || st.name || st.title || st.value || '-'),
  }));
  return (
    <DataTable
      title="Konu Türleri"
      icon="fas fa-tags"
      data={rows}
      columns={subjectTypeColumns}
      getRowId={(row, index) => row.value || String(index)}
      loading={types.isFetching}
      sortable
      emptyMessage="Konu türü bulunamadı."
      onRefresh={() => void types.refetch()}
    />
  );
}

/** Port of it/approvals (approvals.js): approval policies, their stages and subject types. */
export function ApprovalsPage() {
  const [tab, setTab] = useState<string>('policies');
  const list = useQuery(approvalPoliciesQueryOptions());
  const groups = useApprovalUserGroups();
  const policies = list.data ?? EMPTY_POLICIES;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [policyModal, setPolicyModal] = useState<{ policy: ApprovalPolicy | null } | null>(null);
  const remove = useDeletePolicy();

  useEffect(() => {
    if (list.isError) notify.error(list.error, { fallback: 'Politikalar yüklenemedi.' });
  }, [list.isError, list.error]);

  const deletePolicy = async (policy: ApprovalPolicy) => {
    const ok = await confirmDelete(
      `"${policy.name}" politikasını silmek istediğinize emin misiniz? Canlı iş akışı varsa silinmez.`,
    );
    if (!ok) return;
    try {
      await remove.mutateAsync(policy.id);
      notify.success('Politika silindi.');
      if (selectedId === policy.id) setSelectedId(null);
    } catch (error) {
      notify.error(error, { fallback: 'Silinemedi.' });
    }
  };

  const rowActions = (): RowAction<ApprovalPolicy>[] => [
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'primary',
      onClick: (row) => setPolicyModal({ policy: row }),
    },
    { key: 'delete', label: 'Sil', icon: 'fas fa-trash', color: 'danger', onClick: (row) => void deletePolicy(row) },
  ];

  const userGroups = groups.data ?? [];

  return (
    <>
      <PageHeader
        title="Onay Yönetimi"
        subtitle="Onay politikalarını ve canlı iş akışlarını yönetin"
        icon="fas fa-check-double"
        backTo="/it/"
        stats={[
          { id: 'policy-count', label: 'Politika', value: list.isPending ? '–' : policies.length },
          {
            id: 'active-policy-count',
            label: 'Aktif',
            value: list.isPending ? '–' : policies.filter((p) => p.is_active).length,
          },
        ]}
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setPolicyModal({ policy: null })}>
            Yeni Politika
          </Button>
        }
      />

      <Panel>
        <Tabs value={tab} onChange={(value) => setTab(value ?? 'policies')} keepMounted={false}>
          <Tabs.List mb="md">
            <Tabs.Tab value="policies" leftSection={<FaIcon icon="fas fa-layer-group" />}>
              Politikalar
            </Tabs.Tab>
            <Tabs.Tab value="subject-types" leftSection={<FaIcon icon="fas fa-tags" />}>
              Konu Türleri
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="policies">
            <div className={css.layout}>
              <DataTable
                title="Onay Politikaları"
                icon="fas fa-layer-group"
                data={policies}
                columns={policyColumns}
                getRowId={(row) => String(row.id)}
                loading={list.isFetching}
                sortable
                rowActions={rowActions}
                onRowClick={(row) => setSelectedId(row.id)}
                emptyMessage="Politika bulunamadı."
                onRefresh={() => void list.refetch()}
              />
              {selectedId !== null ? (
                <PolicyPanel
                  key={selectedId}
                  policyId={selectedId}
                  groups={userGroups}
                  onEditPolicy={(policy) => setPolicyModal({ policy })}
                  onDeletePolicy={(policy) => void deletePolicy(policy)}
                />
              ) : (
                <Panel>
                  <Stack align="center" gap={6} py="lg" c="dimmed">
                    <FaIcon icon="fas fa-mouse-pointer" style={{ fontSize: 22 }} />
                    <Text size="sm">Aşamaları görmek için listeden bir politika seçin.</Text>
                  </Stack>
                </Panel>
              )}
            </div>
          </Tabs.Panel>
          <Tabs.Panel value="subject-types">
            <SubjectTypesTab />
          </Tabs.Panel>
        </Tabs>
      </Panel>

      {policyModal ? (
        <PolicyFormModal
          key={policyModal.policy?.id ?? 'new'}
          policy={policyModal.policy}
          onClose={() => setPolicyModal(null)}
        />
      ) : null}
    </>
  );
}
