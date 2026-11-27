import {
  Alert,
  Button,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  fasonJobQueryOptions,
  fasonJobsQueryOptions,
  useFasonAction,
  type FasonJob,
  type FasonJobDetail,
  type FasonMaterialStep,
  type FasonPurchaseStep,
  type FasonTab,
} from '@/api/fason/jobs';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  DataTable,
  DetailModal,
  FaIcon,
  FilterBar,
  FormModal,
  notify,
  PageHeader,
  StatusBadge,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
  type StatusFamily,
} from '@/ui';
import { TopicDiscussion } from '../../shared/topic-discussion/TopicDiscussion';
import { FasonRequestFormModal } from './FasonRequestFormModal';

// `new=1` opens Yeni Fason Talebi (Departman Talepleri's form links here).
// An empty tab is the view's first one.
const URL_DEFAULTS = { tab: '', search: '', job: '', new: '' };
const EMPTY: FasonJob[] = [];

/**
 * Who reads the page: the requester (Talepler → Fason Talepleri), the
 * warehouse (Depo → Fason Sevkiyatı) or procurement (Satın Alma → Fason
 * Takibi). Same jobs and job window (discussion included); each its own tabs.
 */
export type FasonView = 'requester' | 'warehouse' | 'procurement';

interface ViewConfig {
  title: string;
  subtitle: string;
  icon: string;
  tabs: { value: FasonTab; label: string }[];
  /** Yeni Fason Talebi: the requester's page only. */
  canCreate: boolean;
}

const VIEWS: Record<FasonView, ViewConfig> = {
  requester: {
    title: 'Fason Talepleri',
    subtitle:
      'Atölyenin fason işleri: departman onayından sonra malzeme depoya, depodan tedarikçiye gider, döner',
    icon: 'people-carry',
    tabs: [
      { value: 'open', label: 'Açık' },
      { value: 'warehouse', label: 'Depoda' },
      { value: 'at_supplier', label: 'Fasonda' },
      { value: 'done', label: 'Tamamlanan' },
      { value: 'all', label: 'Tümü' },
    ],
    canCreate: true,
  },
  warehouse: {
    title: 'Fason Sevkiyatı',
    subtitle:
      'Onaylı fason işlerinin malzemesi: imalattan teslim alın, sipariş verilince tedarikçiye gönderin; dönüş Mal Kabul ile',
    icon: 'truck-loading',
    tabs: [
      { value: 'to_receive', label: 'Teslim Alınacak' },
      { value: 'to_send', label: 'Gönderilecek' },
      { value: 'at_supplier', label: 'Fasonda' },
      { value: 'all', label: 'Tümü' },
    ],
    canCreate: false,
  },
  procurement: {
    title: 'Fason Takibi',
    subtitle:
      'Fason işlerinin satınalma ve malzeme durumu; malzeme depoya gelince gönderimi depo ya da satınalma işaretler',
    icon: 'people-carry',
    tabs: [
      { value: 'open', label: 'Açık' },
      { value: 'to_send', label: 'Gönderilecek' },
      { value: 'at_supplier', label: 'Fasonda' },
      { value: 'done', label: 'Tamamlanan' },
      { value: 'all', label: 'Tümü' },
    ],
    canCreate: false,
  },
};

const PURCHASE_COLOR: Record<FasonPurchaseStep, StatusFamily> = {
  request: 'yellow',
  approved: 'blue',
  planning: 'blue',
  purchase_request: 'blue',
  pr_approved: 'orange',
  ordered: 'green',
  cancelled: 'red',
};

const MATERIAL_COLOR: Record<FasonMaterialStep, StatusFamily> = {
  waiting: 'yellow',
  handed_over: 'orange',
  received: 'blue',
  sent: 'purple',
  returned: 'green',
  pulled: 'grey',
};

const filters: FilterConfig<'search'>[] = [
  {
    type: 'text',
    key: 'search',
    label: 'Ara',
    placeholder: 'Talep no, başlık, parça, malzeme…',
    span: 3,
  },
];

const columns: DataTableColumn<FasonJob>[] = [
  {
    key: 'number',
    header: 'Talep',
    render: (row) => (
      <div>
        <Text size="sm" fw={600}>
          {row.department_request.number}
        </Text>
        <Text size="xs" c="dimmed">
          {row.department_request.title}
        </Text>
      </div>
    ),
  },
  { key: 'operations', header: 'İşlem', render: (row) => row.operations.join(', ') || '-' },
  { key: 'job_nos', header: 'İş No', render: (row) => row.job_nos.join(', ') || '-' },
  {
    key: 'requestor',
    header: 'Talep Eden',
    render: (row) => row.department_request.requestor ?? '-',
  },
  {
    key: 'purchase',
    header: 'Satınalma',
    render: (row) => (
      <StatusBadge color={PURCHASE_COLOR[row.purchase_step]}>{row.purchase_label}</StatusBadge>
    ),
  },
  {
    key: 'material',
    header: 'Malzeme',
    render: (row) => (
      <StatusBadge color={MATERIAL_COLOR[row.material_step]}>{row.material_label}</StatusBadge>
    ),
  },
  { key: 'suppliers', header: 'Tedarikçi', render: (row) => row.suppliers.join(', ') || '-' },
  {
    key: 'created_at',
    header: 'Açıldı',
    render: (row) => formatDate(row.department_request.created_at),
  },
];

/**
 * Fason Talepleri: the workshop's outsourced work (büküm, işleme, galvaniz…),
 * asked for here (Yeni Fason Talebi) rather than on Departman Talepleri, which
 * is for material. Each row is one department request; purchasing and the
 * material are followed side by side. The material moves once the department
 * approved; the warehouse takes it in (one step) and the warehouse or
 * procurement marks it sent once there is an order. The warehouse and
 * procurement read the same jobs on their own pages (`view`).
 */
export function FasonPage({ view = 'requester' }: { view?: FasonView } = {}) {
  const config = VIEWS[view];
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const tab = (
    config.tabs.some((t) => t.value === values.tab) ? values.tab : config.tabs[0]!.value
  ) as FasonTab;
  const list = useQuery({
    ...fasonJobsQueryOptions({ tab, search: values.search || undefined }),
    placeholderData: keepPreviousData,
  });
  const openId = Number.parseInt(values.job, 10);

  return (
    <>
      <PageHeader
        title={config.title}
        subtitle={config.subtitle}
        icon={config.icon}
        actions={
          config.canCreate ? (
            <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => apply({ new: '1' })}>
              Yeni Fason Talebi
            </Button>
          ) : undefined
        }
      />
      <DataTable
        title={config.title}
        icon={`fas fa-${config.icon}`}
        toolbar={
          <SegmentedControl
            size="xs"
            value={tab}
            onChange={(next) => apply({ tab: next })}
            data={config.tabs}
          />
        }
        filters={
          <FilterBar
            inline
            filters={filters}
            values={{ search: values.search }}
            onApply={(next) => apply(next)}
            onClear={() => apply({ search: '' })}
          />
        }
        data={list.data?.results ?? EMPTY}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        onRowClick={(row) => apply({ job: String(row.id) })}
        emptyMessage="Bu sekmede fason işi yok"
      />
      {config.canCreate && values.new ? (
        <FasonRequestFormModal
          onClose={() => apply({ new: '' })}
          onCreated={(jobId) => apply({ new: '', ...(jobId ? { job: String(jobId) } : {}) })}
        />
      ) : null}
      {Number.isFinite(openId) && openId > 0 ? (
        <FasonJobModal key={openId} jobId={openId} onClose={() => apply({ job: '' })} />
      ) : null}
    </>
  );
}

/** Depo → Fason Sevkiyatı. */
export function WarehouseFasonPage() {
  return <FasonPage view="warehouse" />;
}

/** Satın Alma → Fason Takibi. */
export function ProcurementFasonPage() {
  return <FasonPage view="procurement" />;
}

function Mark({
  label,
  at,
  by,
  done = Boolean(at),
}: {
  label: string;
  at: string | null;
  by: string | null;
  done?: boolean;
}) {
  return (
    <Group gap="xs" wrap="nowrap">
      <FaIcon
        icon={done ? 'fas fa-check-circle' : 'far fa-circle'}
        style={{ color: done ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-gray-5)' }}
      />
      <Text size="sm" fw={done ? 600 : 400}>
        {label}
      </Text>
      {at ? (
        <Text size="xs" c="dimmed">
          {formatDateTime(at)}
          {by ? ` · ${by}` : ''}
        </Text>
      ) : null}
    </Group>
  );
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'İşlem yapılamadı');

/** One fason job: what goes out, purchasing, the material steps, sending, the discussion. */
export function FasonJobModal({ jobId, onClose }: { jobId: number; onClose: () => void }) {
  const job = useQuery(fasonJobQueryOptions(jobId));
  const act = useFasonAction(jobId);
  const [handing, setHanding] = useState(false);
  const [sending, setSending] = useState(false);
  const data = job.data;

  const run = async (body: Parameters<typeof act.mutateAsync>[0], done: string) => {
    try {
      await act.mutateAsync(body);
      notify.success(done);
      return true;
    } catch (error) {
      notify.error(errorText(error));
      return false;
    }
  };

  return (
    <>
      <DetailModal
        opened
        onClose={onClose}
        size="xl"
        icon="fas fa-people-carry"
        loading={job.isPending}
        title={data ? `Fason · ${data.department_request.number}` : 'Fason'}
        subtitle={data?.department_request.title}
        footerActions={
          data ? (
            <JobActions
              job={data}
              busy={act.isPending}
              run={run}
              onHand={() => setHanding(true)}
              onSend={() => setSending(true)}
            />
          ) : undefined
        }
        sections={
          data
            ? [
                ...(data.awaiting_approval
                  ? [
                      {
                        title: 'Onay',
                        icon: 'fas fa-hourglass-half',
                        content: (
                          <Alert color="yellow" variant="light">
                            Departman onayı bekleniyor. Malzeme onaydan sonra depoya teslim edilir;
                            planlama da talebi onaydan sonra görür.
                          </Alert>
                        ),
                      },
                    ]
                  : []),
                {
                  title: 'Durum',
                  icon: 'fas fa-stream',
                  fields: [
                    {
                      label: 'Satınalma',
                      render: (
                        <StatusBadge color={PURCHASE_COLOR[data.purchase_step]}>
                          {data.purchase_label}
                        </StatusBadge>
                      ),
                    },
                    {
                      label: 'Malzeme',
                      render: (
                        <StatusBadge color={MATERIAL_COLOR[data.material_step]}>
                          {data.material_label}
                        </StatusBadge>
                      ),
                    },
                    { label: 'Talep Eden', value: data.department_request.requestor },
                    { label: 'Talep Durumu', value: data.department_request.status_label },
                    {
                      label: 'İhtiyaç Tarihi',
                      value: data.department_request.needed_date,
                      type: 'date',
                    },
                    { label: 'Gidecek Malzeme', value: data.material_note || '-', span: 12 },
                  ],
                },
                {
                  title: 'Fason Kalemleri',
                  icon: 'fas fa-list',
                  content: <Rows job={data} />,
                },
                {
                  title: 'Malzeme Adımları',
                  icon: 'fas fa-truck-loading',
                  content: <Steps job={data} />,
                },
                {
                  title: 'Tartışma',
                  icon: 'fas fa-comments',
                  content: data.discussion_topic_id ? (
                    <TopicDiscussion topicId={data.discussion_topic_id} showTopicBody={false} />
                  ) : (
                    <Text size="sm" c="dimmed">
                      Bu iş için tartışma konusu yok.
                    </Text>
                  ),
                },
              ]
            : []
        }
      />
      {handing && data ? (
        <HandOverModal
          job={data}
          onClose={() => setHanding(false)}
          onSave={async (note) => {
            if (await run({ action: 'hand_over', note }, 'Malzeme depoya teslim edildi'))
              setHanding(false);
          }}
        />
      ) : null}
      {sending && data ? (
        <SendModal
          job={data}
          onClose={() => setSending(false)}
          onSave={async (body) => {
            if (await run({ action: 'send', ...body }, 'Malzeme gönderildi')) setSending(false);
          }}
        />
      ) : null}
    </>
  );
}

function JobActions({
  job,
  busy,
  run,
  onHand,
  onSend,
}: {
  job: FasonJobDetail;
  busy: boolean;
  run: (body: { action: 'receive' }, done: string) => Promise<boolean>;
  onHand: () => void;
  onSend: () => void;
}) {
  return (
    <Group gap="xs">
      {job.can_hand_over ? (
        <Button
          size="xs"
          onClick={onHand}
          disabled={busy}
          leftSection={<FaIcon icon="fas fa-hand-holding" />}
        >
          Depoya Teslim Et
        </Button>
      ) : null}
      {job.can_receive ? (
        <Button
          size="xs"
          disabled={busy}
          leftSection={<FaIcon icon="fas fa-inbox" />}
          onClick={() => void run({ action: 'receive' }, 'Malzeme teslim alındı; gönderime hazır')}
        >
          Teslim Al
        </Button>
      ) : null}
      {job.can_send ? (
        <Button
          size="xs"
          color="grape"
          disabled={busy}
          onClick={onSend}
          leftSection={<FaIcon icon="fas fa-truck" />}
        >
          Tedarikçiye Gönder
        </Button>
      ) : null}
    </Group>
  );
}

function Rows({ job }: { job: FasonJobDetail }) {
  return (
    <Stack gap="sm">
      <Table striped withTableBorder fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>İşlem</Table.Th>
            <Table.Th>Parça / Açıklama</Table.Th>
            <Table.Th>İş No</Table.Th>
            <Table.Th ta="right">Miktar</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {job.rows.map((row, i) => (
            <Table.Tr key={i}>
              <Table.Td>{row.item_name || row.item_code}</Table.Td>
              <Table.Td>{row.description || '-'}</Table.Td>
              <Table.Td>{row.job_no || '-'}</Table.Td>
              <Table.Td ta="right">
                {row.quantity ?? '-'} {row.unit}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {job.lines.length ? (
        <Table withTableBorder fz="sm" aria-label="Satınalma kalemleri">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Planlama</Table.Th>
              <Table.Th>Kalem</Table.Th>
              <Table.Th>Satınalma</Table.Th>
              <Table.Th>Sipariş</Table.Th>
              <Table.Th ta="right">Dönen / Alınan</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {job.lines.map((line) => (
              <Table.Tr key={line.id}>
                <Table.Td>{line.planning_request}</Table.Td>
                <Table.Td>
                  {line.item_name}
                  {line.description ? ` · ${line.description}` : ''}
                </Table.Td>
                <Table.Td>
                  <StatusBadge color={PURCHASE_COLOR[line.purchase_step]}>
                    {line.purchase_label}
                  </StatusBadge>
                </Table.Td>
                <Table.Td>
                  {line.orders.map((o) => `#${o.id} ${o.supplier}`).join(', ') || '-'}
                </Table.Td>
                <Table.Td ta="right">
                  {Number(line.delivered_quantity ?? 0)} / {Number(line.pulled_quantity ?? 0)}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : null}
    </Stack>
  );
}

function Steps({ job }: { job: FasonJobDetail }) {
  return (
    <Stack gap={6}>
      <Mark
        label="Departman onayladı"
        at={null}
        by={null}
        done={!job.awaiting_approval && job.purchase_step !== 'cancelled'}
      />
      <Mark label="İmalat malzemeyi depoya teslim etti" {...job.steps.handed_over} />
      <Mark label="Depo teslim aldı (gönderime hazır)" {...job.steps.received} />
      {job.shipments.length ? (
        job.shipments.map((s) => (
          <Mark
            key={s.id}
            label={`Gönderildi → ${s.supplier}${s.irsaliye_no ? ` (İrsaliye ${s.irsaliye_no})` : ''}`}
            at={s.sent_at}
            by={s.sent_by}
          />
        ))
      ) : (
        <Mark label="Tedarikçiye gönderildi" at={null} by={null} />
      )}
      <Mark
        label="Döndü (Mal Kabul)"
        at={null}
        by={null}
        done={job.material_step === 'returned' || job.material_step === 'pulled'}
      />
      <Mark
        label="İmalat aldı (İmalata Çıkış)"
        at={null}
        by={null}
        done={job.material_step === 'pulled'}
      />
    </Stack>
  );
}

function HandOverModal({
  job,
  onClose,
  onSave,
}: {
  job: FasonJobDetail;
  onClose: () => void;
  onSave: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState(job.material_note || '');
  return (
    <FormModal
      opened
      onClose={onClose}
      title="Malzemeyi Depoya Teslim Et"
      onSubmit={() => void onSave(note)}
      submitLabel="Teslim Et"
    >
      <Textarea
        label="Giden malzeme"
        description="Parçalar, adetleri, varsa notlar (ör. P-26 × 2, P-40 × 2)"
        rows={3}
        value={note}
        onChange={(e) => setNote(e.currentTarget.value)}
      />
    </FormModal>
  );
}

function SendModal({
  job,
  onClose,
  onSave,
}: {
  job: FasonJobDetail;
  onClose: () => void;
  onSave: (body: { purchase_order: number; irsaliye_no?: string; note?: string }) => Promise<void>;
}) {
  const [po, setPo] = useState<string | null>(
    job.unsent_orders.length === 1 ? String(job.unsent_orders[0]!.id) : null,
  );
  const [irsaliye, setIrsaliye] = useState('');
  const [note, setNote] = useState('');
  return (
    <FormModal
      opened
      onClose={onClose}
      title="Tedarikçiye Gönder"
      submitLabel="Gönder"
      onSubmit={() => {
        if (!po) {
          notify.warning('Sipariş seçin');
          return;
        }
        void onSave({ purchase_order: Number(po), irsaliye_no: irsaliye, note });
      }}
    >
      <Stack gap="sm">
        <Select
          label="Sipariş / Tedarikçi"
          data={job.unsent_orders.map((o) => ({
            value: String(o.id),
            label: `#${o.id} · ${o.supplier}`,
          }))}
          value={po}
          onChange={setPo}
          allowDeselect={false}
        />
        <TextInput
          label="İrsaliye No"
          value={irsaliye}
          onChange={(e) => setIrsaliye(e.currentTarget.value)}
        />
        <Textarea
          label="Not"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
        />
      </Stack>
    </FormModal>
  );
}
