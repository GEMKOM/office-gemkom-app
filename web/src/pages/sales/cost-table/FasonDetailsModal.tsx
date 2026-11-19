import { Accordion, Anchor, Box, Group, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  fasonCostBreakdownQueryOptions,
  type FasonCostFile,
  type FasonCostLine,
} from '@/api/projects/cost';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { num } from '@/pages/management/analytics/analyticsData';
import { Tiles } from '@/pages/management/analytics/modals';
import { DataTable, DetailModal, FaIcon, notify, type DataTableColumn } from '@/ui';

// The Fason column explained: the F-card lines (büküm, lazer kesim,
// galvaniz…) of a job and its descendants, one fold per card, with the
// request, the purchase order and the files behind each line.

export interface FasonDetailsModalProps {
  jobNo: string;
  onClose: () => void;
}

const euro = (value: unknown) => formatCurrency(num(value), 'EUR', 2);

/** The order's own currency under the EUR figure, when it is not EUR. */
function Original({ value, currency }: { value: unknown; currency?: string | null }) {
  if (!currency || currency === 'EUR' || value === null || value === undefined) return null;
  return (
    <Text size="xs" c="dimmed">
      {currency} {formatNumber(num(value), 2)}
    </Text>
  );
}

const FILE_SOURCE: Record<string, string> = {
  purchase_order: 'Sipariş',
  planning_request: 'Planlama talebi',
  department_request: 'Departman talebi',
  planning_item: 'Planlama kalemi',
};

function FileLinks({ files }: { files?: FasonCostFile[] }) {
  if (!files?.length) {
    return (
      <Text c="dimmed" size="sm">
        -
      </Text>
    );
  }
  return (
    <Stack gap={2}>
      {files.map((file) => (
        <Anchor
          key={`${file.source}-${file.id}`}
          href={file.file_url}
          target="_blank"
          rel="noopener noreferrer"
          size="xs"
          display="block"
          maw={220}
          truncate
          title={`${FILE_SOURCE[file.source] ?? file.source}: ${file.file_name}`}
        >
          <FaIcon icon="fas fa-paperclip" /> {file.file_name}
        </Anchor>
      ))}
    </Stack>
  );
}

const lineColumns: DataTableColumn<FasonCostLine>[] = [
  { key: 'job_no', header: 'İş No', accessor: (row) => row.job_no },
  {
    key: 'planning_request_number',
    header: 'Talep No',
    accessor: (row) => row.planning_request_number || row.department_request_number || '',
    render: (row) =>
      row.planning_request_number || row.department_request_number ? (
        <>
          {row.planning_request_number ? <div>{row.planning_request_number}</div> : null}
          {row.department_request_number ? (
            <Text size="xs" c="dimmed">
              {row.department_request_number}
            </Text>
          ) : null}
        </>
      ) : (
        '-'
      ),
  },
  { key: 'part_no', header: 'Parça No', accessor: (row) => row.part_no || '' },
  {
    key: 'quantity',
    header: 'Miktar',
    align: 'right',
    accessor: (row) => num(row.quantity),
    render: (row) => `${formatNumber(num(row.quantity), 2)}${row.unit ? ` ${row.unit}` : ''}`,
  },
  { key: 'supplier_name', header: 'Tedarikçi', accessor: (row) => row.supplier_name || '' },
  { key: 'po_number', header: 'Sipariş No', accessor: (row) => row.po_number || '' },
  {
    key: 'unit_price_eur',
    header: 'Birim Fiyat',
    align: 'right',
    accessor: (row) => num(row.unit_price_eur),
    render: (row) => (
      <>
        {euro(row.unit_price_eur)}
        <Original value={row.original_unit_price} currency={row.original_currency} />
      </>
    ),
  },
  {
    key: 'amount_eur',
    header: 'Tutar',
    align: 'right',
    accessor: (row) => num(row.amount_eur),
    render: (row) => (
      <>
        <strong>{euro(row.amount_eur)}</strong>
        <Original value={row.original_amount} currency={row.original_currency} />
      </>
    ),
  },
  {
    key: 'date',
    header: 'Tarih',
    accessor: (row) => row.date || '',
    render: (row) => (row.date ? formatDate(row.date) : '-'),
  },
  {
    key: 'files',
    header: 'Dosyalar',
    sortable: false,
    accessor: (row) => (row.files ?? []).map((f) => f.file_name).join(', '),
    render: (row) => <FileLinks files={row.files} />,
  },
];

export function FasonDetailsModal({ jobNo, onClose }: FasonDetailsModalProps) {
  const breakdown = useQuery(fasonCostBreakdownQueryOptions(jobNo));
  useEffect(() => {
    if (!breakdown.isError) return;
    notify.error('Fason detayları yüklenirken bir hata oluştu.');
    onClose();
  }, [breakdown.isError, onClose]);

  const data = breakdown.data;
  const groups = data?.groups ?? [];
  const sections = !data
    ? [{ content: <Box mih={200} /> }]
    : [
        {
          title: 'Özet',
          icon: 'fas fa-chart-pie',
          content: (
            <Tiles
              items={[
                { icon: 'fas fa-tags', label: 'F Kartı', value: formatNumber(groups.length) },
                {
                  icon: 'fas fa-list',
                  label: 'Toplam Satır',
                  value: formatNumber(data.line_count ?? 0),
                },
                { icon: 'fas fa-euro-sign', label: 'Toplam Tutar', value: euro(data.total_eur) },
              ]}
            />
          ),
        },
        {
          title: 'F Kartları',
          icon: 'fas fa-table',
          content: groups.length ? (
            <Accordion multiple variant="separated">
              {groups.map((group) => (
                <Accordion.Item key={group.item_id} value={String(group.item_id)}>
                  <Accordion.Control>
                    <Group justify="space-between" wrap="nowrap" pr="sm">
                      <Group gap={8} wrap="nowrap">
                        <Text span fw={600}>
                          {group.item_name}
                        </Text>
                        <Text span size="xs" c="dimmed">
                          {group.item_code} · {group.line_count} satır
                        </Text>
                      </Group>
                      <Text span fw={700}>
                        {euro(group.total_eur)}
                      </Text>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <DataTable
                      data={group.lines}
                      columns={lineColumns}
                      getRowId={(row) => String(row.procurement_line_id)}
                      sortable
                    />
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          ) : (
            <Text c="dimmed" ta="center" py="lg" size="sm">
              <FaIcon icon="fas fa-info-circle" style={{ marginRight: 6 }} />
              Bu iş için fason satırı bulunamadı.
            </Text>
          ),
        },
      ];

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`${jobNo} - Fason Detayları`}
      icon="fas fa-industry"
      size={1240}
      loading={breakdown.isPending}
      sections={sections}
    />
  );
}
