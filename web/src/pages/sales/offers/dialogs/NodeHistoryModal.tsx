import { Modal, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import {
  nodeJobHistoryQueryOptions,
  type NodeJobHistory,
  type OfferItem,
} from '@/api/sales/offers';
import { ModalBody, ModalHeader, modalClassNames } from '@/ui';
import { itemNodeId, itemTitle, money, parseNum } from '../logic';
import { EmptyState, ErrorText, LoadingText } from '../parts';

const JOB_ORDER_STATUS_LABELS: Record<string, string> = {
  draft: 'Taslak',
  planned: 'Planlandı',
  in_progress: 'Devam Ediyor',
  on_hold: 'Beklemede',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
};

const amount = (value: unknown, currency?: string | null) => {
  const n = parseNum(value);
  return n === null ? '-' : money(n, currency || 'EUR', 2);
};

function day(value: string | null | undefined) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('tr-TR');
}

function HistoryRows({ job, depth }: { job: NodeJobHistory; depth: number }) {
  const cur = job.cost_summary?.selling_price_currency || 'EUR';
  return (
    <>
      <Table.Tr>
        <Table.Td style={{ paddingLeft: depth * 20 + 10 }}>
          {depth > 0 ? (
            <Text span c="dimmed" mr={4}>
              └─
            </Text>
          ) : null}
          <strong>{job.job_no || '-'}</strong>
        </Table.Td>
        <Table.Td>
          <Text fw={600} size="sm">
            {job.title || '-'}
          </Text>
          <Text size="xs" c="dimmed">
            {job.customer_name || '-'}
          </Text>
        </Table.Td>
        <Table.Td>{JOB_ORDER_STATUS_LABELS[job.status ?? ''] || job.status || '-'}</Table.Td>
        <Table.Td>{day(job.target_completion_date)}</Table.Td>
        <Table.Td ta="right">{amount(job.estimated_cost)}</Table.Td>
        <Table.Td ta="right">{amount(job.offer_unit_price)}</Table.Td>
        <Table.Td ta="right">{amount(job.cost_summary?.actual_total_cost, cur)}</Table.Td>
        <Table.Td ta="right">{amount(job.cost_summary?.selling_price, cur)}</Table.Td>
      </Table.Tr>
      {(job.children ?? []).map((child, i) => (
        <HistoryRows key={`${child.job_no ?? ''}-${i}`} job={child} depth={depth + 1} />
      ))}
    </>
  );
}

/** Legacy showPricingNodeHistoryModal: past job orders made from the item's catalog node. */
export function NodeHistoryModal({
  item,
  offerId,
  onClose,
}: {
  item: OfferItem;
  offerId: number;
  onClose: () => void;
}) {
  const nodeId = itemNodeId(item) ?? 0;
  const history = useQuery(nodeJobHistoryQueryOptions(nodeId, offerId));
  const title = itemTitle(item) !== '-' ? itemTitle(item) : `Node #${nodeId}`;

  return (
    <Modal opened onClose={onClose} size="xl" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader title={`${title} - Geçmiş İş Emirleri`} icon="fas fa-clock-rotate-left" />
      <ModalBody>
        {history.isPending ? (
          <LoadingText>Geçmiş yükleniyor...</LoadingText>
        ) : history.isError ? (
          <ErrorText>Geçmiş yüklenirken hata oluştu.</ErrorText>
        ) : !history.data.length ? (
          <EmptyState icon="fas fa-clock-rotate-left">
            Bu kalem için geçmiş iş emri bulunamadı.
          </EmptyState>
        ) : (
          <>
            <Text size="sm" c="dimmed" mb="xs">
              Kalem: <strong>{title}</strong> · Node ID: <strong>{nodeId}</strong>
            </Text>
            <Table.ScrollContainer minWidth={1000}>
              <Table withTableBorder withColumnBorders fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={130}>İş Emri</Table.Th>
                    <Table.Th>Başlık / Müşteri</Table.Th>
                    <Table.Th w={130}>Durum</Table.Th>
                    <Table.Th w={135}>Hedef Termin</Table.Th>
                    <Table.Th w={160} ta="right">
                      Tahmini Maliyet
                    </Table.Th>
                    <Table.Th w={160} ta="right">
                      Teklif Birim Fiyat
                    </Table.Th>
                    <Table.Th w={160} ta="right">
                      Gerçek Toplam
                    </Table.Th>
                    <Table.Th w={160} ta="right">
                      Satış Fiyatı
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {history.data.map((job, i) => (
                    <HistoryRows key={`${job.job_no ?? ''}-${i}`} job={job} depth={0} />
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </>
        )}
      </ModalBody>
    </Modal>
  );
}
