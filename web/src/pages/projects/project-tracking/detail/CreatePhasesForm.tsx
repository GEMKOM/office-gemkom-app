import { ActionIcon, Alert, Button, Group, NumberInput, Paper, Table, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import {
  createJobOrderPhases,
  useInvalidateJobOrders,
  type PhaseAllocation,
  type PhaseInput,
} from '@/api/projects/jobOrders';
import { FaIcon, notify } from '@/ui';
import type { ChildJob } from './GenelTab';
import css from './JobOrderDetail.module.css';

interface PhaseDraft {
  title: string;
  date: string;
}

const sum = (list: number[]) => list.reduce((a, b) => a + (b || 0), 0);

/**
 * Legacy showCreatePhasesForm: phases are the columns, each product's quantity
 * is split across them in its row, and every row must add up (Kalan = 0).
 */
export function CreatePhasesForm({
  jobNo,
  masters,
  onDone,
}: {
  jobNo: string;
  masters: ChildJob[];
  onDone: () => void;
}) {
  const invalidateJobOrders = useInvalidateJobOrders();
  const [phases, setPhases] = useState<PhaseDraft[]>([
    { title: '', date: '' },
    { title: '', date: '' },
  ]);
  // Per product: one quantity per phase, aligned with `phases`.
  const [alloc, setAlloc] = useState<Record<string, number[]>>(() =>
    Object.fromEntries(masters.map((m) => [m.job_no, [0, 0]])),
  );
  const [busy, setBusy] = useState(false);

  const row = (jobNoKey: string) => {
    const list = alloc[jobNoKey] ?? [];
    return phases.map((_, i) => list[i] ?? 0);
  };

  const setPhase = (index: number, patch: Partial<PhaseDraft>) =>
    setPhases((list) => list.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  const addPhase = () => setPhases((list) => [...list, { title: '', date: '' }]);

  const removePhase = (index: number) => {
    setPhases((list) => list.filter((_, i) => i !== index));
    setAlloc((current) =>
      Object.fromEntries(
        Object.entries(current).map(([key, list]) => [key, list.filter((_, i) => i !== index)]),
      ),
    );
  };

  const setQty = (masterNo: string, index: number, value: number | string) => {
    const parsed = Number.parseInt(String(value), 10);
    setAlloc((current) => {
      const list = phases.map((_, i) => current[masterNo]?.[i] ?? 0);
      list[index] = Number.isNaN(parsed) ? 0 : parsed;
      return { ...current, [masterNo]: list };
    });
  };

  const submit = async () => {
    // Every product's phase quantities must sum exactly to its quantity.
    const errors: string[] = [];
    for (const m of masters) {
      const total = sum(row(m.job_no));
      if (total !== m.quantity) errors.push(`${m.job_no} (${total}/${m.quantity})`);
    }
    if (errors.length) {
      notify.error(`Şu ürünlerin faz miktarları toplamı hatalı: ${errors.join(', ')}`);
      return;
    }

    const phasesPayload: PhaseInput[] = phases.map((p, i) => {
      const spec: Record<string, unknown> = { phase_number: i + 1 };
      if (p.title.trim()) spec.title = p.title.trim();
      if (p.date) spec.target_completion_date = p.date;
      return spec as unknown as PhaseInput;
    });
    const allocPayload: PhaseAllocation[] = masters
      .map((m) => {
        const quantities: Record<number, number> = {};
        row(m.job_no).forEach((v, i) => {
          if (v > 0) quantities[i + 1] = v;
        });
        return { product_job_no: m.job_no, quantities };
      })
      .filter((a) => Object.keys(a.quantities).length > 0);

    setBusy(true);
    try {
      const result = await createJobOrderPhases(jobNo, phasesPayload, allocPayload);
      notify.success(result?.message || 'Üretim fazları oluşturuldu.');
      await invalidateJobOrders();
      onDone();
    } catch (error) {
      console.error('Error creating phases:', error);
      notify.error(error, { fallback: 'Fazlar oluşturulurken hata oluştu.' });
      setBusy(false);
    }
  };

  return (
    <Paper withBorder p="md" mb="md">
      <Text fw={600} mb="sm">
        <FaIcon icon="fas fa-plus-circle" /> Üretim Fazları Oluştur
      </Text>
      <Alert color="gray" variant="light" mb="sm" fz="sm">
        Her faz <strong>{jobNo}/P{'{n}'}</strong> teslimat düğümü olarak; her ürün miktarı da{' '}
        <strong>
          {jobNo}-XX/P{'{n}'}
        </strong>{' '}
        alt işi olarak oluşturulur. Her ürünün faz miktarları toplamı, ürün miktarına eşit
        olmalıdır (<strong>Kalan = 0</strong>).
      </Alert>

      <div className={css.phaseDefs}>
        {phases.map((p, i) => (
          <div key={i} className={css.phaseDef}>
            <Group justify="space-between" mb={4}>
              <Text size="sm" fw={700}>
                Faz P{i + 1}
              </Text>
              {phases.length > 1 ? (
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="sm"
                  aria-label="Fazı kaldır"
                  title="Fazı kaldır"
                  onClick={() => removePhase(i)}
                >
                  <FaIcon icon="fas fa-times" />
                </ActionIcon>
              ) : null}
            </Group>
            <TextInput
              size="xs"
              mb={4}
              aria-label={`Faz P${i + 1} başlık`}
              placeholder="Başlık (örn. Faz 1 - Acil)"
              value={p.title}
              onChange={(e) => setPhase(i, { title: e.currentTarget.value })}
            />
            <TextInput
              size="xs"
              type="date"
              aria-label={`Faz P${i + 1} hedef tarih`}
              value={p.date}
              onChange={(e) => setPhase(i, { date: e.currentTarget.value })}
            />
          </div>
        ))}
        <Button
          size="xs"
          variant="outline"
          color="gray"
          leftSection={<FaIcon icon="fas fa-plus" />}
          onClick={addPhase}
        >
          Faz Ekle
        </Button>
      </div>

      <div className={css.phaseTable}>
        <Table withTableBorder withColumnBorders verticalSpacing={4} fz="sm" stickyHeader>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ürün</Table.Th>
              <Table.Th ta="center">Miktar</Table.Th>
              {phases.map((_, i) => (
                <Table.Th key={i} ta="center">
                  P{i + 1}
                </Table.Th>
              ))}
              <Table.Th ta="center">Kalan</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {masters.map((m) => {
              const values = row(m.job_no);
              const remaining = (m.quantity ?? 0) - sum(values);
              return (
                <Table.Tr key={m.job_no}>
                  <Table.Td>
                    <strong>{m.job_no}</strong>
                    <Text size="xs" c="dimmed">
                      {m.title || ''}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="center" fw={700}>
                    {m.quantity}
                  </Table.Td>
                  {values.map((v, i) => (
                    <Table.Td key={i} ta="center">
                      <NumberInput
                        size="xs"
                        w={72}
                        mx="auto"
                        min={0}
                        hideControls
                        allowDecimal={false}
                        aria-label={`${m.job_no} P${i + 1}`}
                        value={v}
                        onChange={(value) => setQty(m.job_no, i, value)}
                      />
                    </Table.Td>
                  ))}
                  <Table.Td ta="center" className={remaining === 0 ? css.ok : css.bad}>
                    {remaining}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </div>

      <Group justify="flex-end" mt="md" gap="xs">
        <Button size="xs" variant="default" disabled={busy} onClick={onDone}>
          İptal
        </Button>
        <Button
          size="xs"
          loading={busy}
          leftSection={<FaIcon icon="fas fa-check" />}
          onClick={() => void submit()}
        >
          Oluştur
        </Button>
      </Group>
    </Paper>
  );
}
