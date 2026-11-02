import { ActionIcon, Button, Group, NumberInput, Select, Table, Text } from '@mantine/core';
import { useMemo } from 'react';
import { isApiError } from '@/api/client';
import type { MachiningPart, PartJobAllocation } from '@/api/manufacturing/machiningParts';
import { useJobOrderOptions } from '@/api/reference/jobOrders';
import { FaIcon } from '@/ui';
import classes from './MachiningParts.module.css';

// Port of components/jobAllocations (a part split across several job orders)
// and the allocation helpers of list.js.

/** Allocation rows of a part, primary first; falls back to the single job_no / quantity. */
export function getPartAllocations(part: MachiningPart | null | undefined): PartJobAllocation[] {
  if (Array.isArray(part?.job_allocations) && part.job_allocations.length > 0) {
    return part.job_allocations;
  }
  if (part?.job_no) return [{ job_no: part.job_no, quantity: part.quantity ?? null, share: 1 }];
  return [];
}

/** "254-01 × 3" per line, the multi-job tooltip. */
export function allocationTooltip(part: MachiningPart): string {
  return getPartAllocations(part)
    .map((a) => `${a.job_no} × ${a.quantity ?? '-'}`)
    .join('\n');
}

/** A 0..1 share as a Turkish percentage label ("%60", "%33,3"). */
export function formatSharePercent(share: unknown): string {
  const value = Number(share);
  if (share === null || share === undefined || !Number.isFinite(value)) return '-';
  const rounded = Math.round(value * 1000) / 10;
  return `%${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',')}`;
}

/** Pull the first backend message out of a DRF error body (legacy extractApiErrorMessage). */
export function firstApiMessage(error: unknown, fallback: string): string {
  if (isApiError(error) && error.data && typeof error.data === 'object') {
    const first = Object.values(error.data as Record<string, unknown>)[0];
    const message = Array.isArray(first) ? first[0] : first;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

// ---- editor -----------------------------------------------------------------

export interface AllocationRow {
  id: number;
  job_no: string;
  quantity: number | '';
}

let rowSequence = 0;

export function allocationRow(
  initial: Partial<{ job_no: string | null; quantity: unknown }> = {},
): AllocationRow {
  const qty = initial.quantity;
  return {
    id: ++rowSequence,
    job_no: initial.job_no ? String(initial.job_no) : '',
    quantity:
      qty === undefined || qty === null || qty === '' ? '' : Number.parseInt(String(qty), 10) || '',
  };
}

/** Always at least one row, like the legacy editor. */
export function allocationRows(
  list: { job_no: string | null; quantity: unknown }[],
): AllocationRow[] {
  return list.length ? list.map((a) => allocationRow(a)) : [allocationRow()];
}

export function sumAllocationQuantity(rows: readonly { quantity: unknown }[]): number {
  return rows.reduce((total, row) => {
    const qty = Number.parseInt(String(row.quantity ?? ''), 10);
    return total + (Number.isFinite(qty) && qty > 0 ? qty : 0);
  }, 0);
}

/** Rows with a job order, as the API takes them. */
export function allocationValue(rows: readonly AllocationRow[]) {
  return rows
    .filter((row) => row.job_no.trim() !== '')
    .map((row) => ({
      job_no: row.job_no.trim(),
      quantity: Number.parseInt(String(row.quantity), 10),
    }));
}

export function allocationsEmpty(rows: readonly AllocationRow[]): boolean {
  return rows.every((row) => row.job_no.trim() === '');
}

/** Legacy validateAllocationRows / getError; null when valid. */
export function allocationError(rows: readonly AllocationRow[], allowEmpty = false): string | null {
  if (allowEmpty && rows.length === 1 && allocationsEmpty(rows)) return null;
  if (rows.length === 0) return 'En az bir iş emri seçilmelidir';
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const jobNo = rows[i]!.job_no.trim();
    if (!jobNo) return `${i + 1}. satırda iş emri seçilmemiş`;
    const qty = Number(rows[i]!.quantity === '' ? Number.NaN : rows[i]!.quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      return `${jobNo} için adet 1 veya daha büyük bir tam sayı olmalıdır`;
    }
    if (seen.has(jobNo)) return `Aynı iş emri birden fazla kez seçilemez: ${jobNo}`;
    seen.add(jobNo);
  }
  return null;
}

interface JobAllocationsEditorProps {
  rows: AllocationRow[];
  onChange: (rows: AllocationRow[]) => void;
  error?: string | null;
}

/** Rows of [job order picker | adet | pay | remove], "İş emri ekle" and the total. */
export function JobAllocationsEditor({ rows, onChange, error }: JobAllocationsEditorProps) {
  const jobOrders = useJobOrderOptions();
  const options = useMemo(
    () =>
      (jobOrders.data ?? []).map((j) => ({
        value: String(j.job_no),
        label: j.title ? `${j.job_no} - ${j.title}` : String(j.job_no),
      })),
    [jobOrders.data],
  );
  const total = sumAllocationQuantity(rows);
  const update = (id: number, patch: Partial<AllocationRow>) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  return (
    <div className={classes.allocEditor}>
      <div className={classes.allocHeader}>
        <span>İş Emri</span>
        <span>Adet</span>
        <span>Pay</span>
        <span />
      </div>
      {rows.map((row, index) => {
        // Keep a job number that is no longer in the dropdown visible.
        const data =
          row.job_no && !options.some((o) => o.value === row.job_no)
            ? [{ value: row.job_no, label: row.job_no }, ...options]
            : options;
        const qty = Number.parseInt(String(row.quantity), 10);
        return (
          <div className={classes.allocRow} key={row.id}>
            <Select
              size="sm"
              searchable
              clearable
              placeholder="İş emri seçin"
              aria-label={`${index + 1}. iş emri`}
              data={data}
              value={row.job_no || null}
              onChange={(value) => update(row.id, { job_no: value ?? '' })}
              nothingFoundMessage="Sonuç bulunamadı"
              limit={200}
            />
            <NumberInput
              size="sm"
              min={1}
              step={1}
              allowDecimal={false}
              placeholder="1"
              aria-label={`${index + 1}. adet`}
              value={row.quantity}
              onChange={(value) =>
                update(row.id, {
                  quantity: value === '' ? '' : Number.parseInt(String(value), 10) || '',
                })
              }
              hideControls
            />
            <span className={classes.allocShare}>
              {total > 0 && Number.isFinite(qty) && qty > 0 ? formatSharePercent(qty / total) : '-'}
            </span>
            <ActionIcon
              variant="default"
              color="red"
              size="lg"
              aria-label="Satırı kaldır"
              title="Satırı kaldır"
              disabled={rows.length <= 1}
              onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
            >
              <FaIcon icon="fas fa-trash" />
            </ActionIcon>
          </div>
        );
      })}
      <Group justify="space-between" mt="sm">
        <Button
          size="xs"
          variant="default"
          leftSection={<FaIcon icon="fas fa-plus" />}
          onClick={() => onChange([...rows, allocationRow()])}
        >
          İş emri ekle
        </Button>
        <Text size="sm">
          Toplam adet: <strong>{total}</strong>
        </Text>
      </Group>
      {error ? (
        <Text size="sm" c="red" mt="xs" role="alert">
          {error}
        </Text>
      ) : null}
    </div>
  );
}

/** The read-only allocation table of the details modal. */
export function AllocationTable({ allocations }: { allocations: PartJobAllocation[] }) {
  if (allocations.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        İş emri atanmamış
      </Text>
    );
  }
  const total = sumAllocationQuantity(allocations);
  return (
    <Table withTableBorder withColumnBorders fz="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>İş Emri</Table.Th>
          <Table.Th ta="right">Adet</Table.Th>
          <Table.Th ta="right">Pay %</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {allocations.map((a, i) => {
          const qty = Number.parseInt(String(a.quantity ?? ''), 10);
          const share =
            a.share !== undefined && a.share !== null
              ? Number(a.share)
              : total > 0 && qty > 0
                ? qty / total
                : null;
          return (
            <Table.Tr key={`${a.job_no}-${i}`}>
              <Table.Td>{a.job_no || '-'}</Table.Td>
              <Table.Td ta="right">{Number.isFinite(qty) ? qty : '-'}</Table.Td>
              <Table.Td ta="right">{share !== null ? formatSharePercent(share) : '-'}</Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
      <Table.Tfoot>
        <Table.Tr>
          <Table.Th>Toplam</Table.Th>
          <Table.Th ta="right">{total}</Table.Th>
          <Table.Th ta="right">{total > 0 ? '%100' : '-'}</Table.Th>
        </Table.Tr>
      </Table.Tfoot>
    </Table>
  );
}
