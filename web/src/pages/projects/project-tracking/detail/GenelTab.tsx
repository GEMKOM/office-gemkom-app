import { Alert, Anchor, Button, Table } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  activateJobOrderPhase,
  jobOrderPhasesQueryOptions,
  useInvalidateJobOrders,
  type JobOrder,
  type TargetDateRevision,
} from '@/api/projects/jobOrders';
import { extractResults } from '@/api/types';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { confirm, DataTable, FaIcon, notify, type DataTableColumn, type RowAction } from '@/ui';
import { useJobOrderActions, useJobOrderPermissions } from '../jobOrderActions';
import { CreatePhasesForm } from './CreatePhasesForm';
import css from './JobOrderDetail.module.css';
import {
  ErrorState,
  FieldRow,
  FieldSection,
  JobStatusBadge,
  LoadingState,
  percentText,
  Section,
} from './parts';

/** A row of the detail payload's `children` and of `/phases/`. */
export type ChildJob = JobOrder & {
  is_phase_job?: boolean;
  source_job_order?: string | null;
};

const dash = (value: unknown) =>
  value === null || value === undefined || value === '' ? '-' : String(value);

function PhaseBanner({ job }: { job: ChildJob & { has_phases?: boolean } }) {
  const actions = useJobOrderActions();
  if (job.is_phase_job) {
    return (
      <Alert color="blue" variant="light" mb="md" icon={<FaIcon icon="fas fa-layer-group" />}>
        Bu bir <strong>üretim fazıdır</strong>
        {job.phase_number ? ` (Faz ${job.phase_number})` : ''}.{' '}
        {job.source_job_order ? (
          <>
            Kaynak mühendislik iş emri:{' '}
            <Anchor
              component="button"
              type="button"
              fw={700}
              onClick={() => actions.view(String(job.source_job_order))}
            >
              {job.source_job_order}
            </Anchor>
          </>
        ) : null}
      </Alert>
    );
  }
  if (job.has_phases) {
    return (
      <Alert color="gray" variant="light" mb="md" icon={<FaIcon icon="fas fa-layer-group" />}>
        Bu iş emri <strong>üretim fazlarına</strong> bölünmüştür. Fazları &quot;Fazlar&quot;
        sekmesinden görüntüleyebilirsiniz.
      </Alert>
    );
  }
  return null;
}

/** Legacy temelBilgilerHtml: the job's fields in five titled blocks. */
function JobInfo({ job }: { job: ChildJob }) {
  const actions = useJobOrderActions();
  const { canEdit } = useJobOrderPermissions();
  const editable =
    !actions.hideActions && canEdit && job.status !== 'completed' && job.status !== 'cancelled';
  const customer = job.customer_short_name || job.customer_name;
  const weight = job.total_weight_kg;

  return (
    <div>
      <PhaseBanner job={job} />
      <FieldSection
        title="Genel Bilgiler"
        icon="fas fa-info-circle"
        action={
          editable ? (
            <Button
              size="xs"
              variant="outline"
              leftSection={<FaIcon icon="fas fa-edit" />}
              onClick={() => actions.edit(job.job_no)}
            >
              Düzenle
            </Button>
          ) : null
        }
      >
        <FieldRow label="İş Emri No" icon="fas fa-barcode">
          <strong>{dash(job.job_no)}</strong>
        </FieldRow>
        <FieldRow label="Başlık" icon="fas fa-heading">
          {dash(job.title)}
        </FieldRow>
        {job.description ? (
          <FieldRow label="Açıklama" icon="fas fa-align-left" multiline>
            <span className={css.preWrap}>{job.description}</span>
          </FieldRow>
        ) : null}
      </FieldSection>

      <FieldSection title="Müşteri Bilgileri" icon="fas fa-users">
        <FieldRow label="Müşteri" icon="fas fa-users">
          {customer ? `${customer}${job.customer_code ? ` (${job.customer_code})` : ''}` : '-'}
        </FieldRow>
        <FieldRow label="Müşteri Sipariş No" icon="fas fa-file-invoice">
          {dash(job.customer_order_no)}
        </FieldRow>
        <FieldRow label="ERP Ürün Kodları" icon="fas fa-barcode" multiline>
          <span className={css.preWrap}>{dash(job.erp_product_codes)}</span>
        </FieldRow>
        <FieldRow label="Kaynak Teklif No" icon="fas fa-tag">
          {dash(job.source_offer_no)}
        </FieldRow>
      </FieldSection>

      <FieldSection title="Sipariş Detayları" icon="fas fa-clipboard-list">
        <FieldRow label="Miktar" icon="fas fa-hashtag">
          {job.quantity || job.quantity === 0 ? job.quantity : '-'}
        </FieldRow>
        <FieldRow label="Teslim Şekli" icon="fas fa-globe">
          {dash(job.incoterms)}
        </FieldRow>
        {weight ? (
          <FieldRow label="Toplam Ağırlık" icon="fas fa-weight">
            {formatNumber(weight as string, { maximumFractionDigits: 2 })} kg
          </FieldRow>
        ) : null}
      </FieldSection>

      <FieldSection title="Tarih Bilgileri" icon="fas fa-calendar-alt">
        <FieldRow label="Hedef Tamamlanma" icon="fas fa-calendar-check">
          <strong>
            {job.target_completion_date ? formatDate(job.target_completion_date) : '-'}
          </strong>
          {!actions.hideActions ? (
            <Button
              size="xs"
              variant="outline"
              onClick={() => actions.reviseTargetDate(job.job_no, job.target_completion_date)}
            >
              Revize Et
            </Button>
          ) : null}
        </FieldRow>
        <FieldRow label="Başlangıç Tarihi" icon="fas fa-play-circle">
          {job.started_at ? formatDateTime(job.started_at) : '-'}
        </FieldRow>
        {job.completed_at ? (
          <FieldRow label="Tamamlanma Tarihi" icon="fas fa-check-circle">
            {formatDateTime(job.completed_at)}
          </FieldRow>
        ) : null}
      </FieldSection>

      <FieldSection title="Sistem Bilgileri" icon="fas fa-info-circle" muted>
        <FieldRow label="Oluşturulma Tarihi" icon="fas fa-calendar-plus">
          {job.created_at ? formatDateTime(job.created_at) : '-'}
        </FieldRow>
        <FieldRow label="Oluşturan" icon="fas fa-user">
          {dash(job.created_by_name)}
        </FieldRow>
        <FieldRow label="Güncellenme Tarihi" icon="fas fa-calendar-edit">
          {job.updated_at ? formatDateTime(job.updated_at) : '-'}
        </FieldRow>
        {job.completed_by_name ? (
          <FieldRow label="Tamamlayan" icon="fas fa-user-check">
            {String(job.completed_by_name)}
          </FieldRow>
        ) : null}
      </FieldSection>
    </div>
  );
}

function useChildColumns(withPhase: boolean) {
  return useMemo<DataTableColumn<ChildJob>[]>(
    () => [
      ...(withPhase
        ? [
            {
              key: 'phase_number',
              header: 'Faz',
              render: (row: ChildJob) =>
                row.phase_number != null ? <strong>P{row.phase_number}</strong> : '-',
            },
          ]
        : []),
      {
        key: 'job_no',
        header: 'İş Emri No',
        render: (row) => <strong>{row.job_no || '-'}</strong>,
      },
      { key: 'title', header: 'Başlık', render: (row) => row.title || '-' },
      {
        key: 'status_display',
        header: 'Durum',
        render: (row) => <JobStatusBadge row={row} />,
      },
      {
        key: 'completion_percentage',
        header: 'Tamamlanma',
        accessor: (row) => Number.parseFloat(String(row.completion_percentage ?? 0)) || 0,
        render: (row) => percentText(row.completion_percentage),
      },
    ],
    [withPhase],
  );
}

/** Legacy loadChildrenTab: the detail payload already carries `children`. */
function ChildrenSection({ job }: { job: ChildJob }) {
  const actions = useJobOrderActions();
  const columns = useChildColumns(false);
  const rows = Array.isArray(job.children) ? (job.children as ChildJob[]) : [];
  return (
    <Section title="Alt İş Emirleri" icon="fas fa-sitemap">
      {rows.length === 0 ? (
        <p className={css.state}>Alt iş emri bulunamadı.</p>
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(row) => row.job_no}
          sortable
          striped
          emptyMessage="Alt iş emri bulunamadı"
          rowActions={() => [
            {
              key: 'view',
              label: 'Detay',
              icon: 'fas fa-eye',
              color: 'cyan',
              onClick: (row) => actions.view(row.job_no),
            },
          ]}
        />
      )}
    </Section>
  );
}

/** Legacy loadPhasesTab / renderPhasesTab: the table, Faz Oluştur and Etkinleştir. */
function PhasesSection({ job }: { job: ChildJob }) {
  const actions = useJobOrderActions();
  const { canEdit } = useJobOrderPermissions();
  const invalidateJobOrders = useInvalidateJobOrders();
  const query = useQuery(jobOrderPhasesQueryOptions<unknown>(job.job_no));
  const phases = useMemo(
    () => (Array.isArray(query.data) ? (query.data as ChildJob[]) : extractResults<ChildJob>(query.data)),
    [query.data],
  );
  const columns = useChildColumns(true);
  const [creating, setCreating] = useState(false);

  // Product masters = direct children that are not themselves phase mirrors.
  const masters = useMemo(
    () =>
      (Array.isArray(job.children) ? (job.children as ChildJob[]) : []).filter(
        (c) => !c.is_phase_job && !c.source_job_order,
      ),
    [job.children],
  );

  const openForm = () => {
    if (masters.length === 0) {
      notify.error('Bu iş emrinin fazlanacak ürün alt işi bulunamadı.');
      return;
    }
    setCreating(true);
  };

  const activate = async (phaseJobNo: string) => {
    if (!(await confirm({ message: `${phaseJobNo} fazı etkinleştirilecek. Devam edilsin mi?` })))
      return;
    try {
      const result = await activateJobOrderPhase(phaseJobNo);
      notify.success(result?.message || 'Üretim fazı etkinleştirildi.');
      await invalidateJobOrders();
    } catch (error) {
      console.error('Error activating phase:', error);
      notify.error(error, { fallback: 'Faz etkinleştirilirken hata oluştu.' });
    }
  };

  const rowActions = (row: ChildJob): RowAction<ChildJob>[] => [
    {
      key: 'activate',
      label: 'Etkinleştir',
      icon: 'fas fa-play',
      color: 'green',
      hidden: !(canEdit && row.status === 'draft'),
      onClick: (r) => void activate(r.job_no),
    },
    {
      key: 'view',
      label: 'Detay',
      icon: 'fas fa-eye',
      color: 'cyan',
      onClick: (r) => actions.view(r.job_no),
    },
  ];

  // Phases are defined once; only offer creation when none exist yet.
  const showCreate = query.isSuccess && canEdit && phases.length === 0;

  return (
    <Section
      title="Üretim Fazları"
      icon="fas fa-layer-group"
      action={
        showCreate ? (
          <Button size="xs" leftSection={<FaIcon icon="fas fa-plus" />} onClick={openForm}>
            Faz Oluştur
          </Button>
        ) : null
      }
    >
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState>Fazlar yüklenirken hata oluştu.</ErrorState>
      ) : (
        <>
          {creating ? (
            <CreatePhasesForm
              jobNo={job.job_no}
              masters={masters}
              onDone={() => setCreating(false)}
            />
          ) : null}
          {phases.length === 0 ? (
            <p className={css.state}>Bu iş emri için henüz üretim fazı oluşturulmamış.</p>
          ) : (
            <DataTable
              data={phases}
              columns={columns}
              getRowId={(row) => row.job_no}
              sortable
              striped
              emptyMessage="Üretim fazı bulunamadı"
              rowActions={rowActions}
              extraData={canEdit}
            />
          )}
        </>
      )}
    </Section>
  );
}

function RevisionsSection({ revisions }: { revisions: TargetDateRevision[] | undefined }) {
  const items = Array.isArray(revisions) ? revisions : [];
  return (
    <Section title="Hedef Tarih Revizyonları" icon="fas fa-history">
      {items.length === 0 ? (
        <p className={css.state}>Hedef tarih revizyonu bulunamadı.</p>
      ) : (
        <Table.ScrollContainer minWidth={600}>
          <Table striped highlightOnHover verticalSpacing="xs" fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={60}>#</Table.Th>
                <Table.Th>Önceki</Table.Th>
                <Table.Th>Yeni</Table.Th>
                <Table.Th>Neden</Table.Th>
                <Table.Th>Değiştiren</Table.Th>
                <Table.Th>Tarih</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((r, i) => (
                <Table.Tr key={String(r.id ?? i)}>
                  <Table.Td>{dash(r.id)}</Table.Td>
                  <Table.Td>{r.previous_date ? formatDate(r.previous_date) : '-'}</Table.Td>
                  <Table.Td fw={600}>{r.new_date ? formatDate(r.new_date) : '-'}</Table.Td>
                  <Table.Td>{r.reason || '-'}</Table.Td>
                  <Table.Td>
                    {r.changed_by_name || (r.changed_by ? `#${String(r.changed_by)}` : '-')}
                  </Table.Td>
                  <Table.Td>{r.changed_at ? formatDateTime(r.changed_at) : '-'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Section>
  );
}

/** Genel: the job's fields, its sub-jobs, its production phases, target date history. */
export function GenelTab({ job }: { job: ChildJob }) {
  return (
    <>
      <section className={css.section}>
        <JobInfo job={job} />
      </section>
      {job.children_count && job.children_count > 0 ? <ChildrenSection job={job} /> : null}
      {!job.is_phase_job ? <PhasesSection job={job} /> : null}
      <RevisionsSection revisions={job.target_date_revisions} />
    </>
  );
}
