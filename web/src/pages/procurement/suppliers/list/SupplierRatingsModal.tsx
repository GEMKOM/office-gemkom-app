import { Group, Loader, Table, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  supplierEvaluationsQueryOptions,
  supplierReadErrorMessage,
  supplierStatusHistoryQueryOptions,
  type Supplier,
} from '@/api/procurement/suppliers';
import { formatDate } from '@/lib/format';
import { DetailModal } from '@/ui';
import { OnTimePct, StarRating, SupplierStatusBadge, supplierStatusLabel } from './supplierBadges';

export function ModalLoading() {
  return (
    <Group justify="center" gap="xs" py="lg">
      <Loader size="sm" />
      <Text size="sm">Yükleniyor...</Text>
    </Group>
  );
}

export function ModalError({ message }: { message: string }) {
  return (
    <Text c="red" size="sm">
      Yüklenirken hata oluştu: {message}
    </Text>
  );
}

function SectionTitle({ children, mt }: { children: ReactNode; mt: string }) {
  return (
    <Title order={6} c="var(--mantine-primary-color-filled)" mt={mt} mb="xs">
      {children}
    </Title>
  );
}

export interface SupplierRatingsModalProps {
  supplierId: number;
  /** The row the modal was opened from (legacy read it from the loaded list). */
  supplier?: Supplier;
  onClose: () => void;
}

/** Port of viewSupplierRatings: evaluations and status history, read-only. */
export function SupplierRatingsModal({ supplierId, supplier, onClose }: SupplierRatingsModalProps) {
  const evaluations = useQuery(supplierEvaluationsQueryOptions(supplierId));
  const history = useQuery(supplierStatusHistoryQueryOptions(supplierId));

  let content: ReactNode;
  // Legacy awaited both with Promise.all: the first failure replaces the content.
  const failed = evaluations.error ?? history.error;
  if (failed) {
    const fallback = evaluations.error
      ? 'Değerlendirmeler yüklenirken hata oluştu'
      : 'Durum geçmişi yüklenirken hata oluştu';
    content = <ModalError message={supplierReadErrorMessage(failed, fallback)} />;
  } else if (!evaluations.data || !history.data) {
    content = <ModalLoading />;
  } else {
    const evals = evaluations.data;
    const changes = history.data;
    content = (
      <>
        {supplier ? (
          <Group gap="sm" mb="md" wrap="wrap">
            <span>
              <StarRating score={supplier.rating_score} compact />
            </span>
            <SupplierStatusBadge status={supplier.status} />
            <Text span size="xs" c="dimmed">
              Zamanında Teslimat: <OnTimePct pct={supplier.on_time_delivery_pct} />
            </Text>
          </Group>
        ) : null}

        {evals.length ? (
          <>
            <SectionTitle mt="xs">Değerlendirmeler</SectionTitle>
            <Table.ScrollContainer minWidth={640}>
              <Table striped verticalSpacing={4} fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Sipariş</Table.Th>
                    <Table.Th ta="center">Kalite</Table.Th>
                    <Table.Th ta="center">Teslimat</Table.Th>
                    <Table.Th ta="center">Fiyat</Table.Th>
                    <Table.Th ta="center">Servis</Table.Th>
                    <Table.Th ta="center">Puan</Table.Th>
                    <Table.Th>Yorum</Table.Th>
                    <Table.Th>Değerlendiren</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {evals.map((e, i) => (
                    <Table.Tr key={e.id ?? i}>
                      <Table.Td>{e.po_number || `PO-${e.purchase_order}`}</Table.Td>
                      <Table.Td ta="center">{e.quality_score}</Table.Td>
                      <Table.Td ta="center">{e.delivery_score}</Table.Td>
                      <Table.Td ta="center">{e.price_score}</Table.Td>
                      <Table.Td ta="center">{e.service_score}</Table.Td>
                      <Table.Td ta="center">
                        <strong>{Number(e.composite_score).toFixed(2)}</strong>
                      </Table.Td>
                      <Table.Td>{e.comment || ''}</Table.Td>
                      <Table.Td>
                        <Text span size="xs" c="dimmed">
                          {e.evaluated_by_username || ''} · {formatDate(e.created_at)}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </>
        ) : (
          <Text c="dimmed" size="sm">
            Henüz değerlendirme yok.
          </Text>
        )}

        {changes.length ? (
          <>
            <SectionTitle mt="md">Durum Geçmişi</SectionTitle>
            <Table.ScrollContainer minWidth={480}>
              <Table striped verticalSpacing={4} fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Değişiklik</Table.Th>
                    <Table.Th>Gerekçe</Table.Th>
                    <Table.Th>Değiştiren</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {changes.map((h, i) => (
                    <Table.Tr key={h.id ?? i}>
                      <Table.Td>
                        {supplierStatusLabel(h.previous_status)} →{' '}
                        <strong>{supplierStatusLabel(h.new_status)}</strong>
                      </Table.Td>
                      <Table.Td>{h.reason || ''}</Table.Td>
                      <Table.Td>
                        <Text span size="xs" c="dimmed">
                          {h.changed_by_username || ''} · {formatDate(h.changed_at)}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </>
        ) : null}
      </>
    );
  }

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`Değerlendirmeler — ${supplier?.name ?? ''}`}
      icon="fas fa-star"
      size="lg"
      sections={[{ content }]}
    />
  );
}
