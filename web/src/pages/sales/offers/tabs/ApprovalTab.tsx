import { Badge, Button, Group, SimpleGrid, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  approvalStatusQueryOptions,
  CURRENCY_SYMBOLS,
  type ApprovalStatus,
} from '@/api/sales/offers';
import { DataTable, FaIcon, StatusBadge, type DataTableColumn } from '@/ui';
import { useOffers } from '../context';
import {
  approvalItemRows,
  parseNum,
  shortDateTime,
  tr2,
  workflowRows,
  type WorkflowRow,
} from '../logic';
import type { TabProps } from '../OfferModal';
import { EmptyState, ErrorText, LoadingText } from '../parts';
import css from '../OffersPage.module.css';

const workflowColumns: DataTableColumn<WorkflowRow>[] = [
  {
    key: 'created_at',
    header: 'Oluşturma',
    width: 160,
    render: (r) => shortDateTime(r.created_at),
  },
  {
    key: 'round',
    header: 'Tur',
    width: 70,
    render: (r) =>
      r.round != null ? (
        <Badge variant="outline" color="gray">
          R{r.round}
        </Badge>
      ) : (
        '-'
      ),
  },
  {
    key: 'status',
    header: 'Durum',
    width: 120,
    render: (r) => <StatusBadge color={r.status.family}>{r.status.label}</StatusBadge>,
  },
  { key: 'stage', header: 'Aşama', width: 180 },
  {
    key: 'approved',
    header: 'Onay',
    width: 90,
    render: (r) => {
      const a = r.approved ?? 0;
      const req = r.required ?? 0;
      return (
        <Text
          span
          size="sm"
          c={req > 0 && a >= req ? 'green' : 'dimmed'}
          fw={req > 0 && a >= req ? 600 : undefined}
        >
          {a}/{req}
        </Text>
      );
    },
  },
  {
    key: 'approvers',
    header: 'Onaylayıcılar',
    width: 240,
    render: (r) =>
      r.approvers ? (
        <div className={css.truncate} title={r.approvers}>
          {r.approvers}
        </div>
      ) : (
        '-'
      ),
  },
  {
    key: 'amount',
    header: 'Tutar',
    width: 140,
    render: (r) => {
      const n = parseNum(r.amount);
      if (r.amount === null || r.amount === '') return '-';
      return n === null ? (
        String(r.amount)
      ) : (
        <strong>
          {tr2(n)} {r.currency}
        </strong>
      );
    },
  },
  {
    key: 'last_decision',
    header: 'Son Karar',
    width: 110,
    render: (r) =>
      r.lastDecision ? (
        <StatusBadge color={r.lastDecision.family}>{r.lastDecision.label}</StatusBadge>
      ) : (
        '-'
      ),
  },
  { key: 'last_decision_by', header: 'Karar Veren', width: 160, render: (r) => r.lastDecisionBy },
  {
    key: 'last_decision_at',
    header: 'Karar Zamanı',
    width: 160,
    render: (r) =>
      r.lastDecisionAt ? (
        <Text span size="sm" c="dimmed" fw={500}>
          {shortDateTime(r.lastDecisionAt)}
        </Text>
      ) : (
        '-'
      ),
  },
  {
    key: 'comment',
    header: 'Yorum',
    render: (r) =>
      r.comment ? (
        <div className={css.truncateWide} title={r.comment}>
          {r.comment}
        </div>
      ) : (
        '-'
      ),
  },
];

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className={css.figure}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={600} className={css.num}>
        {value}
      </Text>
    </div>
  );
}

function ApprovalPage({ data, offerId }: { data: ApprovalStatus; offerId: number }) {
  const { openDialog } = useOffers();
  const currency = data.current_price?.currency || 'EUR';
  const sym = CURRENCY_SYMBOLS[currency] || currency;
  const totalPrice = parseNum(data.total_price);
  const totalWeight = parseNum(data.total_weight_kg);
  const avgKg =
    totalPrice !== null && totalWeight !== null && totalWeight > 0
      ? totalPrice / totalWeight
      : null;
  const canDecide = data.current_user_can_decide === true;
  const rows = useMemo(
    () => approvalItemRows(data.items ?? [], String(data.pricing_mode || 'flat')),
    [data],
  );
  const workflows = useMemo(() => workflowRows(data.workflows ?? [], currency), [data, currency]);
  const priceText = (n: number | null, dash = '—') => (n !== null ? `${sym} ${tr2(n)}` : dash);

  return (
    <div>
      <Group justify="space-between" align="flex-start" mb="md" wrap="wrap">
        <div>
          <Group gap="xs">
            <Text fw={600}>
              <FaIcon icon="fas fa-clipboard-check" /> Onay
            </Text>
            <Badge color={data.status === 'pending_approval' ? 'blue' : 'gray'}>
              {data.status_display || data.status || '-'}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed" mt={4}>
            <strong>{data.offer_no || '-'}</strong> • {data.customer_name || '-'}{' '}
            {data.customer_code ? (
              <Badge variant="outline" color="gray" size="sm">
                {data.customer_code}
              </Badge>
            ) : null}
          </Text>
        </div>
        {canDecide ? (
          <Group gap="xs">
            <Button
              size="xs"
              color="green"
              leftSection={<FaIcon icon="fas fa-check" />}
              onClick={() => openDialog({ kind: 'approve', offerId })}
            >
              Onayla
            </Button>
            <Button
              size="xs"
              color="red"
              leftSection={<FaIcon icon="fas fa-times" />}
              onClick={() => openDialog({ kind: 'reject', offerId })}
            >
              Reddet
            </Button>
          </Group>
        ) : (
          <Text size="sm" c="dimmed">
            {data.is_rejected ? '' : 'Bu aşamada karar yetkiniz bulunmuyor.'}
          </Text>
        )}
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs" mb="md">
        <Figure label="Toplam Tutar" value={priceText(totalPrice, '-')} />
        <Figure
          label="Toplam Ağırlık"
          value={totalWeight !== null ? `${tr2(totalWeight)} kg` : '-'}
        />
        <Figure
          label="Ortalama Kg Fiyatı"
          value={avgKg !== null ? `${sym} ${tr2(avgKg)} /kg` : '-'}
        />
      </SimpleGrid>

      <Text fw={600} mb={6} c="var(--gk-red-700)">
        <FaIcon icon="fas fa-tag" /> Kalemler (Ağırlık &amp; Fiyat)
      </Text>
      {!rows.length ? (
        <EmptyState>Kalem bulunamadı.</EmptyState>
      ) : (
        <Table.ScrollContainer minWidth={800}>
          <Table withTableBorder withColumnBorders fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w="44%">Kalem</Table.Th>
                <Table.Th w="8%" ta="center">
                  Adet
                </Table.Th>
                <Table.Th w="16%" ta="right">
                  Birim Fiyat
                </Table.Th>
                <Table.Th w="12%" ta="right">
                  Ağırlık (kg)
                </Table.Th>
                <Table.Th w="9%" ta="right">
                  Kg Fiyatı
                </Table.Th>
                <Table.Th w="19%" ta="right">
                  Ara Toplam
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody className={css.num}>
              {rows.map((r) => (
                <Table.Tr key={r.key}>
                  <Table.Td style={{ paddingLeft: r.depth * 20 + 8 }}>
                    {r.depth > 0 ? <span className={css.treePrefix}>└─</span> : null}
                    {r.title}
                  </Table.Td>
                  <Table.Td ta="center">{r.quantity}</Table.Td>
                  <Table.Td ta="right">{priceText(r.unitPrice)}</Table.Td>
                  <Table.Td ta="right">{r.weight !== null ? tr2(r.weight) : '—'}</Table.Td>
                  <Table.Td ta="right">{priceText(r.kgPrice)}</Table.Td>
                  <Table.Td ta="right">{priceText(r.subtotal)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            {totalPrice !== null || totalWeight !== null ? (
              <Table.Tfoot className={css.num}>
                <Table.Tr>
                  <Table.Th colSpan={5} ta="right">
                    Toplam:
                  </Table.Th>
                  <Table.Th ta="right">{priceText(totalPrice)}</Table.Th>
                </Table.Tr>
                <Table.Tr>
                  <Table.Th colSpan={5} ta="right">
                    Toplam Ağırlık:
                  </Table.Th>
                  <Table.Th ta="right">
                    {totalWeight !== null ? `${tr2(totalWeight)} kg` : '—'}
                  </Table.Th>
                </Table.Tr>
                <Table.Tr>
                  <Table.Th colSpan={5} ta="right">
                    Ortalama Kg Fiyatı:
                  </Table.Th>
                  <Table.Th ta="right">
                    {avgKg !== null ? `${sym} ${tr2(avgKg)} /kg` : '—'}
                  </Table.Th>
                </Table.Tr>
              </Table.Tfoot>
            ) : null}
          </Table>
        </Table.ScrollContainer>
      )}

      <div className={css.block} style={{ marginTop: 'var(--mantine-spacing-lg)' }}>
        {!workflows.length ? (
          <Text c="dimmed">Onay süreci bulunamadı.</Text>
        ) : (
          <DataTable
            title="Onay Geçmişi"
            icon="fas fa-route"
            data={workflows}
            columns={workflowColumns}
            getRowId={(r) => r.key}
            withColumnBorders
            verticalSpacing="xs"
            emptyMessage="Onay kaydı bulunamadı"
          />
        )}
      </div>
    </div>
  );
}

/** Legacy Onay tab: the approval-status payload (items, totals, workflows, the right to decide). */
export function ApprovalTab({ offer }: TabProps) {
  const query = useQuery(approvalStatusQueryOptions(offer.id));
  if (query.isPending) {
    return (offer.approval_round ?? 0) > 0 ? (
      <LoadingText />
    ) : (
      <EmptyState>Henüz onay süreci başlatılmamış.</EmptyState>
    );
  }
  if (query.isError) return <ErrorText>Onay durumu yüklenemedi.</ErrorText>;
  if (!query.data) return <Text c="dimmed">Aktif onay süreci bulunamadı.</Text>;
  return <ApprovalPage data={query.data} offerId={offer.id} />;
}
