import { Checkbox, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import type { PlanningItem } from '@/api/planning/planningItems';
import { toNumber } from '@/lib/format';
import { SizeNote, StatusBadge, type DataTableColumn } from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import { DeliveryState, deliveryStateText, fmtQty, qty } from './deliveryState';

/** Only what is still physically in the warehouse can be pulled. */
export function availableToPull(row: PlanningItem): number {
  const received = qty(row.delivered_quantity);
  const pulled = qty(row.pulled_quantity);
  return row.quantity_available_to_pull != null
    ? qty(row.quantity_available_to_pull)
    : Math.max(received - pulled, 0);
}

/** Plate goes to CNC cutting, is cut and delivered to the station: never pulled. */
export function isPlateLine(row: PlanningItem): boolean {
  return row.item_material_class === 'plate';
}

/** A bar (boy) line: its bars can be picked from the job's İş Emri piece stock. */
export function isBarLine(row: PlanningItem): boolean {
  return row.item_material_class === 'boy';
}

export function canPull(row: PlanningItem): boolean {
  // A bar line may have bars in the job's İş Emri stock even when nothing came on the line.
  return !isPlateLine(row) && (isBarLine(row) || qty(row.quantity_available_to_pull) > 0);
}

/**
 * A plate line in place of its pull cell: "CNC kesime gider · kesilen 2 / 4 levha".
 * Out of the sheets the line asked for (a sized line), else out of the sheets its cuts
 * planned (an older line without a size).
 */
export function plateCutText(row: PlanningItem): string {
  const done = qty(row.cnc_cuts_done);
  const planned = qty(row.cnc_cuts_count);
  const total = row.piece_count ? row.piece_count : planned;
  if (!total) return 'CNC kesime gider · kesim planlanmadı';
  return `CNC kesime gider · kesilen ${fmtQty(done)} / ${fmtQty(total)} levha`;
}

function Code({ value }: { value: string | null | undefined }) {
  return value ? <span className={uiClasses.code}>{value}</span> : <>-</>;
}

function pullQty(quantity: unknown, unit: string | undefined) {
  return `${fmtQty(quantity as string | number | null | undefined)} ${unit || ''}`.trim();
}

/**
 * İmalata Çıkış column: the warehouse ledger of the line (received / issued /
 * still available) above one chip per (non-cancelled) pull request the line
 * is on, orange while pending, green once handed over. A chip opens the
 * request detail.
 */
function PullCell({ row, onOpen }: { row: PlanningItem; onOpen: (id: number) => void }) {
  if (isPlateLine(row)) {
    const done = qty(row.cnc_cuts_done);
    const total = row.piece_count || qty(row.cnc_cuts_count);
    return (
      <Text
        size="xs"
        c={total && done >= total ? 'green.7' : 'dimmed'}
        style={{ whiteSpace: 'nowrap' }}
        title="Sac imalata çıkış talebine alınmaz: CNC kesime gider, kesilip istasyona teslim edilir."
      >
        {plateCutText(row)}
      </Text>
    );
  }
  const received = qty(row.delivered_quantity);
  const pulled = qty(row.pulled_quantity);
  const available = availableToPull(row);
  const pulls = Array.isArray(row.pull_requests) ? row.pull_requests : [];
  if (received <= 0 && pulls.length === 0) return <>-</>;
  const unit = row.item_unit || '';

  return (
    <Stack gap={4}>
      {received > 0 ? (
        <Text
          size="xs"
          style={{ whiteSpace: 'nowrap' }}
          title={`Teslim alınan ${fmtQty(received)} · imalata çıkan ${fmtQty(pulled)} · depoda kalan ${fmtQty(available)} ${unit}`}
        >
          <Text span inherit c="dimmed">
            Çıkan
          </Text>{' '}
          {fmtQty(pulled)} / {fmtQty(received)} ·{' '}
          <Text span inherit c={available > 0 ? 'green.7' : 'dimmed'}>
            kalan {fmtQty(available)} {unit}
          </Text>
        </Text>
      ) : null}
      {pulls.length > 0 ? (
        <Group gap={4}>
          {pulls.map((p) => {
            const amount = pullQty(p.quantity, p.item_unit || unit);
            return (
              <UnstyledButton
                key={p.id}
                title={`${p.number} · ${p.status_label ?? p.status} · ${amount}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpen(p.id);
                }}
              >
                <StatusBadge color={p.status === 'transferred' ? 'green' : 'orange'}>
                  {p.destination_name || '-'} · {amount}
                </StatusBadge>
              </UnstyledButton>
            );
          })}
        </Group>
      ) : null}
    </Stack>
  );
}

function pullCellText(row: PlanningItem): string {
  if (isPlateLine(row)) return plateCutText(row);
  const received = qty(row.delivered_quantity);
  const unit = row.item_unit || '';
  const parts: string[] = [];
  if (received > 0) {
    parts.push(
      `Çıkan ${fmtQty(row.pulled_quantity ?? 0)} / ${fmtQty(received)} · kalan ${fmtQty(availableToPull(row))} ${unit}`.trim(),
    );
  }
  for (const p of row.pull_requests ?? []) {
    parts.push(`${p.destination_name || '-'} · ${pullQty(p.quantity, p.item_unit || unit)}`);
  }
  return parts.join(' ');
}

export interface MaterialTrackingColumnOptions {
  onOpenPullRequest: (id: number) => void;
  onToggleCritical: (row: PlanningItem, critical: boolean) => void;
  /** Items whose critical flag is being saved (checkbox disabled meanwhile). */
  pendingCritical: ReadonlySet<number>;
}

const number = (value: unknown) => toNumber(value as string | number | null | undefined);

/** Same columns, order and sortable set as the legacy table. */
export function materialTrackingColumns({
  onOpenPullRequest,
  onToggleCritical,
  pendingCritical,
}: MaterialTrackingColumnOptions): DataTableColumn<PlanningItem>[] {
  return [
    { key: 'id', header: 'ID', sortable: true },
    {
      key: 'item_code',
      header: 'Ürün Kodu',
      sortable: true,
      render: (row) => <Code value={row.item_code} />,
    },
    {
      key: 'item_name',
      header: 'Ürün Adı',
      sortable: true,
      exportValue: (row) => [row.item_name, row.size_summary].filter(Boolean).join(' · '),
      render: (row) => (
        <>
          {row.item_name || '-'}
          <SizeNote text={row.size_summary} />
        </>
      ),
    },
    {
      key: 'planning_request_number',
      header: 'Talep No',
      render: (row) => <Code value={row.planning_request_number} />,
    },
    {
      key: 'job_no',
      header: 'İş No',
      sortable: true,
      render: (row) => <Code value={row.job_no} />,
    },
    {
      key: 'quantity',
      header: 'Miktar',
      align: 'right',
      render: (row) => fmtQty(row.quantity),
      exportValue: (row) => number(row.quantity),
    },
    {
      key: 'quantity_from_inventory',
      header: 'Stoktan',
      align: 'right',
      render: (row) => fmtQty(row.quantity_from_inventory),
      exportValue: (row) => number(row.quantity_from_inventory),
    },
    {
      key: 'quantity_to_purchase',
      header: 'Satın Alınacak',
      align: 'right',
      render: (row) => fmtQty(row.quantity_to_purchase),
      exportValue: (row) => number(row.quantity_to_purchase),
    },
    { key: 'item_unit', header: 'Birim' },
    {
      key: 'is_delivered',
      header: 'Teslim',
      render: (row) => <DeliveryState row={row} />,
      exportValue: (row) => deliveryStateText(row),
    },
    {
      key: 'pull_requests',
      header: 'İmalata Çıkış',
      render: (row) => <PullCell row={row} onOpen={onOpenPullRequest} />,
      exportValue: pullCellText,
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
    {
      key: 'purchase_request_number',
      header: 'Satın Alma PR No',
      render: (row) => <Code value={row.purchase_request_number} />,
    },
  ];
}
