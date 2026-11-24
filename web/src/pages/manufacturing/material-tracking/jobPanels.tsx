import { Button, Checkbox, Text } from '@mantine/core';
import type { MaterialPullRequest } from '@/api/materialTracking/pullRequests';
import type { PlanningItem } from '@/api/planning/planningItems';
import { formatDate, formatDateTime, toNumber } from '@/lib/format';
import { DataTable, FaIcon, SizeNote, StatusBadge, type DataTableColumn } from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import { fmtQty } from './deliveryState';
import { amountText, arrivalState, canRequest, lotsText, type JobStockRow } from './jobStock';
import { DestinationCell, PullRequestStatusBadge } from './pullRequestShared';

const Code = ({ value }: { value: string | null | undefined }) =>
  value ? <span className={uiClasses.code}>{value}</span> : <>-</>;

// ---- İş Emri stoğu ---------------------------------------------------------

const stockColumns: DataTableColumn<JobStockRow>[] = [
  { key: 'item_code', header: 'Kod', render: (row) => <Code value={row.item_code} /> },
  {
    key: 'item_name',
    header: 'Ad',
    render: (row) => (
      <>
        {row.item_name || '-'}
        {row.kind !== 'card' ? <SizeNote text={lotsText(row)} /> : null}
      </>
    ),
    exportValue: (row) =>
      [row.item_name, row.kind !== 'card' ? lotsText(row) : ''].filter(Boolean).join(' · '),
  },
  {
    key: 'onHand',
    header: 'Stokta',
    align: 'right',
    render: (row) => amountText(row, row.onHand),
    exportValue: (row) => row.onHand,
  },
  {
    key: 'held',
    header: 'Bekleyen Talepte',
    align: 'right',
    render: (row) =>
      row.held > 0 ? (
        <Text span inherit c="orange.8">
          {amountText(row, row.held)}
        </Text>
      ) : (
        '–'
      ),
    exportValue: (row) => row.held,
  },
  {
    key: 'available',
    header: 'Çıkabilir',
    align: 'right',
    render: (row) =>
      row.kind === 'plate' ? (
        <Text
          span
          size="xs"
          c="dimmed"
          title="Sac imalata çıkış talebine alınmaz: CNC kesime gider, kesilip istasyona teslim edilir."
        >
          CNC kesime gider
        </Text>
      ) : (
        <Text span inherit c={row.available > 0 ? 'green.7' : 'dimmed'} fw={500}>
          {amountText(row, row.available)}
        </Text>
      ),
    exportValue: (row) => (row.kind === 'plate' ? 'CNC kesime gider' : row.available),
  },
];

export function JobStockPanel({
  jobNo,
  rows,
  loading,
  selectedKeys,
  onSelect,
  onCreate,
  onRefresh,
}: {
  jobNo: string;
  rows: JobStockRow[];
  loading: boolean;
  selectedKeys: string[];
  onSelect: (keys: string[]) => void;
  onCreate: () => void;
  onRefresh: () => void;
}) {
  const picked = rows.filter((row) => selectedKeys.includes(row.key) && canRequest(row));
  return (
    <DataTable
      columnsKey="material-tracking-job-stock"
      title="İş Emri Stoğu"
      icon="fas fa-clipboard-list"
      data={rows}
      columns={stockColumns}
      getRowId={(row) => row.key}
      loading={loading}
      selection={{
        selectedIds: picked.map((row) => row.key),
        onChange: onSelect,
        isRowSelectable: canRequest,
      }}
      toolbar={
        <>
          {picked.length > 0 ? (
            <Text size="sm" c="dimmed">
              {picked.length} kalem seçildi
            </Text>
          ) : null}
          <Button size="xs" leftSection={<FaIcon icon="fas fa-dolly" />} onClick={onCreate}>
            İmalata Çıkış Talebi Oluştur
          </Button>
        </>
      }
      onRefresh={onRefresh}
      emptyMessage={`${jobNo} iş emri stoğunda malzeme yok.`}
      exportable={{ fileName: `is_emri_stogu_${jobNo.replace(/[^\w-]+/g, '_')}` }}
    />
  );
}

// ---- Bu işin çıkış talepleri -----------------------------------------------

const pullColumns: DataTableColumn<MaterialPullRequest>[] = [
  { key: 'number', header: 'Talep No', render: (row) => <Code value={row.number} /> },
  {
    key: 'status',
    header: 'Durum',
    render: (row) => <PullRequestStatusBadge status={row.status} label={row.status_label} />,
    exportValue: (row) => row.status_label || row.status,
  },
  { key: 'destination_name', header: 'Hedef', render: (row) => <DestinationCell request={row} /> },
  { key: 'item_count', header: 'Kalem', align: 'right' },
  {
    key: 'requested_at',
    header: 'Talep',
    render: (row) => (
      <>
        {formatDateTime(row.requested_at)}
        <Text size="xs" c="dimmed">
          {row.requested_by_name || row.requested_by_username || ''}
        </Text>
      </>
    ),
    exportValue: (row) => (row.requested_at ? formatDateTime(row.requested_at) : ''),
  },
  {
    key: 'confirmed_at',
    header: 'Teslim',
    render: (row) => (row.confirmed_at ? formatDateTime(row.confirmed_at) : '–'),
    exportValue: (row) => (row.confirmed_at ? formatDateTime(row.confirmed_at) : ''),
  },
];

export function JobPullsPanel({
  jobNo,
  rows,
  loading,
  onOpen,
}: {
  jobNo: string;
  rows: MaterialPullRequest[];
  loading: boolean;
  onOpen: (id: number) => void;
}) {
  return (
    <DataTable
      columnsKey="material-tracking-job-pulls"
      title="Bu İşin Çıkış Talepleri"
      icon="fas fa-dolly"
      data={rows}
      columns={pullColumns}
      getRowId={(row) => String(row.id)}
      loading={loading}
      onRowClick={(row) => onOpen(row.id)}
      pagination
      emptyMessage={`${jobNo} için imalata çıkış talebi yok.`}
    />
  );
}

// ---- Henüz gelmeyen planlama kalemleri -------------------------------------

export function JobPlanningPanel({
  jobNo,
  rows,
  loading,
  pendingCritical,
  onToggleCritical,
}: {
  jobNo: string;
  rows: PlanningItem[];
  loading: boolean;
  pendingCritical: ReadonlySet<number>;
  onToggleCritical: (row: PlanningItem, critical: boolean) => void;
}) {
  const columns: DataTableColumn<PlanningItem>[] = [
    { key: 'item_code', header: 'Kod', render: (row) => <Code value={row.item_code} /> },
    {
      key: 'item_name',
      header: 'Ad',
      render: (row) => (
        <>
          {row.item_name || '-'}
          <SizeNote text={row.size_summary} />
        </>
      ),
      exportValue: (row) => [row.item_name, row.size_summary].filter(Boolean).join(' · '),
    },
    {
      key: 'planning_request_number',
      header: 'Talep No',
      render: (row) => <Code value={row.planning_request_number} />,
    },
    {
      key: 'quantity',
      header: 'Miktar',
      align: 'right',
      render: (row) => `${fmtQty(row.quantity)} ${row.item_unit || ''}`.trim(),
      exportValue: (row) => toNumber(row.quantity),
    },
    {
      key: 'needed_date',
      header: 'İhtiyaç',
      render: (row) => (row.needed_date ? formatDate(row.needed_date) : '–'),
    },
    {
      key: 'arrival',
      header: 'Durum',
      render: (row) => {
        const state = arrivalState(row);
        return <StatusBadge color={state.tone}>{state.text}</StatusBadge>;
      },
      exportValue: (row) => arrivalState(row).text,
    },
    {
      key: 'is_critical',
      header: 'Kritik',
      // Kritik = imalat bu kalem teslim edilmeden devam edemez: the production
      // forecast holds Üretim's projected start until every critical item of
      // the job is delivered.
      render: (row) => (
        <Checkbox
          aria-label={`Kritik: ${row.item_code || row.id}`}
          title="Kritik: imalat bu kalem teslim edilmeden devam edemez"
          checked={Boolean(row.is_critical)}
          disabled={pendingCritical.has(row.id)}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onToggleCritical(row, event.currentTarget.checked)}
        />
      ),
      exportValue: (row) => (row.is_critical ? 'Evet' : 'Hayır'),
    },
  ];
  return (
    <DataTable
      columnsKey="material-tracking-job-undelivered"
      title="Henüz Gelmeyen Planlama Kalemleri"
      icon="fas fa-clock"
      data={rows}
      columns={columns}
      getRowId={(row) => String(row.id)}
      loading={loading}
      pagination
      emptyMessage={`${jobNo} için beklenen planlama kalemi yok: hepsi teslim alındı.`}
    />
  );
}
