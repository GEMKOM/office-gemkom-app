import { Alert, Group, Modal, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { cutBreakdownQueryOptions, type CutBreakdownRow } from '@/api/planning/procurementLines';
import { formatNumber } from '@/lib/format';
import {
  DataTable,
  errorMessage,
  FaIcon,
  ModalBody,
  ModalHeader,
  modalClassNames,
  type DataTableColumn,
} from '@/ui';
import { formatPriceDate, formatPriceSource } from './lines';

// What a plate line's kg is made of: the job's parts on each finished CNC cut,
// each part's share of the cut's fire, the lot the sheet came from and the
// price used. (Backend: /projects/procurement-lines/cut-breakdown/.)

const kg = (value: string | number) => `${formatNumber(Number(value), 2)} kg`;

const COLUMNS: DataTableColumn<CutBreakdownRow>[] = [
  {
    key: 'cnc_task',
    header: 'Kesim',
    render: (r) => `${r.cnc_task}${r.nesting_id ? ` · ${r.nesting_id}` : ''}`,
  },
  { key: 'finished_on', header: 'Bitiş', render: (r) => formatPriceDate(r.finished_on) },
  { key: 'lot', header: 'Sac Partisi', render: (r) => r.lot || '–' },
  {
    key: 'image_no',
    header: 'Parça',
    render: (r) => [r.image_no, r.position_no].filter(Boolean).join(' / ') || '–',
  },
  { key: 'parts_kg', header: 'Parça kg', align: 'right', render: (r) => kg(r.parts_kg) },
  {
    key: 'fire_kg',
    header: 'Fire payı',
    align: 'right',
    render: (r) => `${kg(r.fire_kg)}${r.fire_estimated ? ' (tahmini)' : ''}`,
  },
  { key: 'kg', header: 'Toplam', align: 'right', render: (r) => kg(r.kg) },
  {
    key: 'unit_price_eur',
    header: 'Birim Fiyat (EUR/kg)',
    align: 'right',
    render: (r) => (r.unit_price_eur === null ? '–' : formatNumber(Number(r.unit_price_eur), 4)),
  },
  {
    key: 'price_source',
    header: 'Fiyat Kaynağı',
    render: (r) => formatPriceSource(r.price_source),
  },
];

const EMPTY: CutBreakdownRow[] = [];

export function CutBreakdownModal({
  jobNo,
  item,
  label,
  onClose,
}: {
  jobNo: string;
  /** The card id, or null for cuts without a card. */
  item: number | null;
  label: string;
  onClose: () => void;
}) {
  const rows = useQuery(cutBreakdownQueryOptions(jobNo, item));
  const data = rows.data ?? EMPTY;
  const total = data.reduce((sum, r) => sum + Number(r.kg), 0);
  const fire = data.reduce((sum, r) => sum + Number(r.fire_kg), 0);
  return (
    <Modal opened onClose={onClose} size="90%" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader title="Kesim Dökümü" subtitle={`${jobNo} · ${label}`} icon="fas fa-list" />
      <ModalBody>
        <Text size="sm" c="dimmed" mb="sm">
          Bu işin parçalarının kesildiği saclar: parça ağırlığı ve kesimin firesinden, kesimdeki tüm
          parçalara göre ağırlık oranında düşen pay. Stoğa dönen fire sac hiçbir işe yazılmaz.
        </Text>
        {rows.isError ? (
          <Alert color="red" icon={<FaIcon icon="fas fa-exclamation-circle" />}>
            {errorMessage(rows.error, 'Döküm yüklenemedi')}
          </Alert>
        ) : null}
        <DataTable
          data={data}
          columns={COLUMNS}
          getRowId={(r) => `${r.cnc_task}-${r.part}`}
          loading={rows.isFetching}
          striped
          verticalSpacing="xs"
          emptyMessage="Bu kart için tamamlanmış kesim yok"
        />
        {data.length ? (
          <Group justify="flex-end" mt="sm" gap="xl">
            <Text size="sm">Fire payı: {kg(fire)}</Text>
            <Text size="sm" fw={600}>
              Toplam: {kg(total)}
            </Text>
          </Group>
        ) : null}
      </ModalBody>
    </Modal>
  );
}
