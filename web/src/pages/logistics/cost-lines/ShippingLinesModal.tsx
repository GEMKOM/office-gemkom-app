import { ActionIcon, Button, Center, Group, Loader, Table, Text, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  shippingCostLinesQueryOptions,
  useSubmitShippingCostLines,
  type ShippingCostLine,
  type ShippingCostLineInput,
} from '@/api/logistics/costLines';
import { FaIcon, FormModal, notify } from '@/ui';

interface EditLine {
  description: string;
  amount_eur: string;
  date: string;
  notes: string;
}

const emptyLine = (): EditLine => ({ description: '', amount_eur: '0.00', date: '', notes: '' });

function toEditLine(line: ShippingCostLine): EditLine {
  return {
    description: line.description ?? '',
    amount_eur: line.amount_eur != null ? String(line.amount_eur) : '0.00',
    date: line.date ? String(line.date).slice(0, 10) : '',
    notes: line.notes ?? '',
  };
}

/** Legacy saveLines: rows without a description are dropped; empty optional fields are left out. */
export function linesForSubmit(lines: EditLine[]): ShippingCostLineInput[] {
  return lines
    .map((line) => ({
      description: (line.description || '').trim(),
      amount_eur: line.amount_eur !== '' ? String(line.amount_eur) : '0.00',
      date: (line.date || '').trim() || undefined,
      notes: (line.notes || '').trim() || undefined,
    }))
    .filter((line) => line.description !== '');
}

export interface ShippingLinesModalProps {
  jobNo: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Port of the lines modal in cost-lines.js: every shipping cost line of a job
 * order, edited as a whole and saved in one submit (the backend replaces them).
 */
export function ShippingLinesModal({ jobNo, onClose, onSaved }: ShippingLinesModalProps) {
  const query = useQuery(shippingCostLinesQueryOptions(jobNo));
  const submit = useSubmitShippingCostLines();
  // What the user changed; until then the editor shows the server lines (or one empty row).
  const [edited, setEdited] = useState<EditLine[] | null>(null);
  const initial = useMemo<EditLine[] | null>(() => {
    if (query.isSuccess) {
      const loaded = query.data.map(toEditLine);
      return loaded.length ? loaded : [emptyLine()];
    }
    return query.isError ? [emptyLine()] : null;
  }, [query.isSuccess, query.isError, query.data]);
  const lines = edited ?? initial;

  useEffect(() => {
    if (!query.isError) return;
    console.error(query.error);
    notify.error(query.error, { fallback: 'Satırlar yüklenemedi' });
  }, [query.isError, query.error]);

  const loading = lines === null;
  const rows = lines ?? [];
  const total = rows.reduce((sum, line) => sum + (Number.parseFloat(line.amount_eur) || 0), 0);

  const change = (fn: (current: EditLine[]) => EditLine[]) =>
    setEdited((prev) => fn(prev ?? initial ?? []));
  const update = (index: number, field: keyof EditLine, value: string) =>
    change((current) =>
      current.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
    );
  const remove = (index: number) =>
    change((current) => {
      const next = current.filter((_, i) => i !== index);
      return next.length ? next : [emptyLine()];
    });

  const save = async () => {
    if (loading) return;
    try {
      await submit.mutateAsync({ jobNo, lines: linesForSubmit(rows) });
      notify.success('Satırlar kaydedildi.');
      onSaved();
      onClose();
    } catch (error) {
      console.error(error);
      notify.error(error, { fallback: 'Kaydetme başarısız' });
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={`Sevkiyat Maliyet Satırları — ${jobNo}`}
      icon="fas fa-truck"
      size="xl"
      cancelLabel="Kapat"
      submitting={submit.isPending}
      submitDisabled={loading}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Group justify="space-between" mb="sm" gap="xs">
        <Button
          size="xs"
          leftSection={<FaIcon icon="fas fa-plus" />}
          disabled={loading}
          onClick={() => change((current) => [...current, emptyLine()])}
        >
          Satır Ekle
        </Button>
        {loading ? null : (
          <Text size="sm" c="dimmed" data-testid="lines-summary">
            {`${rows.length} satır, Toplam: €${total.toFixed(2)}`}
          </Text>
        )}
      </Group>
      <Table.ScrollContainer minWidth={640}>
        <Table withTableBorder withColumnBorders verticalSpacing={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Açıklama</Table.Th>
              <Table.Th>Tutar (EUR)</Table.Th>
              <Table.Th>Tarih</Table.Th>
              <Table.Th>Notlar</Table.Th>
              <Table.Th w={60} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {loading ? (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Center py="sm">
                    <Loader size="sm" />
                    <Text size="sm" c="dimmed" ml="xs">
                      Yükleniyor...
                    </Text>
                  </Center>
                </Table.Td>
              </Table.Tr>
            ) : (
              rows.map((line, index) => (
                <Table.Tr key={index}>
                  <Table.Td>
                    <TextInput
                      size="xs"
                      aria-label={`Açıklama ${index + 1}`}
                      placeholder="Açıklama"
                      value={line.description}
                      onChange={(e) => update(index, 'description', e.currentTarget.value)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      size="xs"
                      w="6rem"
                      aria-label={`Tutar ${index + 1}`}
                      placeholder="0.00"
                      value={line.amount_eur}
                      onChange={(e) => update(index, 'amount_eur', e.currentTarget.value)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      size="xs"
                      w="10rem"
                      type="date"
                      aria-label={`Tarih ${index + 1}`}
                      value={line.date}
                      onChange={(e) => update(index, 'date', e.currentTarget.value)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      size="xs"
                      aria-label={`Notlar ${index + 1}`}
                      placeholder="Notlar"
                      value={line.notes}
                      onChange={(e) => update(index, 'notes', e.currentTarget.value)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      title="Satırı sil"
                      aria-label="Satırı sil"
                      onClick={() => remove(index)}
                    >
                      <FaIcon icon="fas fa-trash" />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </FormModal>
  );
}
