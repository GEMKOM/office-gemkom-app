import { Alert, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { COMPONENT_LABELS, periodCostReconcileQueryOptions } from '@/api/accounting/periodCost';
import { formatCurrency } from '@/lib/format';
import { DetailModal, errorMessage } from '@/ui';
import { monthLabel, num } from './periodCostRows';

const euro = (value: string) => formatCurrency(num(value), 'EUR', 2);

/**
 * One job's months against the cost table: lifetime figure, the sum of every
 * month, what belongs to no month yet, and the difference left over.
 */
export function ReconcileModal({ jobNo, onClose }: { jobNo: string | null; onClose: () => void }) {
  const query = useQuery({
    ...periodCostReconcileQueryOptions(jobNo ?? ''),
    enabled: jobNo !== null,
  });
  const data = query.data;
  const anyDifference = data?.components.some((c) => num(c.difference) !== 0) ?? false;

  const content = query.isError ? (
    <Alert color="red">{errorMessage(query.error)}</Alert>
  ) : data ? (
    <>
      <Text size="sm" c="dimmed" mb="xs">
        {data.first_month
          ? `Kayıtlı aylar: ${monthLabel(data.first_month)} – ${monthLabel(data.last_month ?? data.first_month)}`
          : 'Bu iş emrinde aya yazılmış maliyet yok.'}
        {data.job_nos.length > 1 ? ` · ${data.job_nos.length - 1} alt iş emri dahil` : ''}
      </Text>
      <Table striped withTableBorder fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Kalem</Table.Th>
            <Table.Th style={{ textAlign: 'right' }}>Maliyet Tablosu</Table.Th>
            <Table.Th style={{ textAlign: 'right' }}>Aylar Toplamı</Table.Th>
            <Table.Th style={{ textAlign: 'right' }}>Henüz Aya Yazılmayan</Table.Th>
            <Table.Th style={{ textAlign: 'right' }}>Fark</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.components.map((c) => (
            <Table.Tr key={c.component}>
              <Table.Td>{COMPONENT_LABELS[c.component]}</Table.Td>
              <Table.Td style={{ textAlign: 'right' }}>{euro(c.lifetime)}</Table.Td>
              <Table.Td style={{ textAlign: 'right' }}>{euro(c.dated)}</Table.Td>
              <Table.Td style={{ textAlign: 'right' }}>
                {num(c.not_dated) ? euro(c.not_dated) : '-'}
              </Table.Td>
              <Table.Td
                style={{ textAlign: 'right' }}
                c={num(c.difference) ? 'red' : undefined}
                fw={num(c.difference) ? 600 : undefined}
              >
                {num(c.difference) ? euro(c.difference) : '-'}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Text size="xs" c="dimmed" mt="sm">
        Henüz aya yazılmayan: teslim alınmamış veya talebe bağlı olmayan malzeme ve henüz
        üretilmemiş kısmın genel gideri. Fark: maliyet tablosu son hesaplandığından beri değişen
        kayıtlar (işçilik toplamları, kur) ve kuruş yuvarlaması.
      </Text>
      {anyDifference ? (
        <Alert color="yellow" mt="sm" variant="light">
          Fark varsa maliyet tablosu bu iş emri için yeniden hesaplanınca kapanması beklenir.
        </Alert>
      ) : null}
    </>
  ) : null;

  return (
    <DetailModal
      opened={jobNo !== null}
      onClose={onClose}
      title={`Mutabakat · ${jobNo ?? ''}`}
      subtitle="Aylara dağıtılan maliyet ile maliyet tablosunun karşılaştırması"
      icon="fas fa-balance-scale"
      size="xl"
      loading={query.isFetching && !data}
      sections={[{ content }]}
    />
  );
}
