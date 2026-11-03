import { Button, Table } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { JobOrder } from '@/api/projects/jobOrders';
import { priceTiersQueryOptions, type PriceTier } from '@/api/subcontracting/assignments';
import { FaIcon, StatusBadge } from '@/ui';
import { useJobOrderActions, useJobOrderPermissions } from '../jobOrderActions';
import css from './JobOrderDetail.module.css';
import { ErrorState, LoadingState } from './parts';

type Tier = PriceTier & {
  tier_type?: string;
  allocated_weight_kg?: number | string | null;
  used_weight_kg?: number | string | null;
};

const num = (value: unknown): number | null =>
  value === null || value === undefined || value === '' ? null : Number(value);
const tr = (value: number, max: number) =>
  value.toLocaleString('tr-TR', { maximumFractionDigits: max });
const kg = (value: number | null) => (value === null ? '–' : `${tr(value, 2)} kg`);
const price = (value: unknown, currency: string | undefined) =>
  `${Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${currency || 'TRY'}/kg`;
const sum = (list: Tier[], field: keyof Tier) =>
  list.reduce((total, t) => total + (num(t[field]) || 0), 0);

function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className={css.pwStat}>
      <div className={css.pwStatLabel}>{label}</div>
      <div className={css.pwStatValue}>{value}</div>
      {note ? <div className={css.pwStatNote}>{note}</div> : null}
    </div>
  );
}

function Bar({ pct, over, title }: { pct: number; over: boolean; title?: string }) {
  return (
    <div className={css.pwBar} title={title}>
      <div className={css.pwBarFill} data-over={over || undefined} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Fiyat ve Ağırlık: the job's weight and subcontracting price tiers, read
 * only (legacy renderPriceTiersUI). They are edited in Ağırlık ve Kademeler.
 */
export function PriceTiersTab({ job, onClose }: { job: JobOrder; onClose: () => void }) {
  const actions = useJobOrderActions();
  const { canEdit } = useJobOrderPermissions();
  const query = useQuery(priceTiersQueryOptions({ job_order: job.job_no }));

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState>Fiyat kademeleri yüklenirken hata oluştu.</ErrorState>;

  const tiers = query.data as Tier[];
  const weight = num(job.total_weight_kg);
  const welding = tiers.filter((t) => t.tier_type !== 'paint');
  const paint = tiers.filter((t) => t.tier_type === 'paint');
  const weldingKg = sum(welding, 'allocated_weight_kg');
  const usedKg = sum(welding, 'used_weight_kg');
  const coverage = weight ? Math.min(100, (weldingKg / weight) * 100) : 0;
  const over = weight !== null && weldingKg > weight + 0.001;
  const editable = canEdit && job.status !== 'completed' && job.status !== 'cancelled';

  return (
    <div>
      <div className={css.pwHead}>
        <div className={css.pwStats}>
          <Stat
            label="Toplam ağırlık"
            value={weight === null ? <StatusBadge color="orange">Girilmemiş</StatusBadge> : kg(weight)}
          />
          <Stat
            label="Kaynak kademeleri"
            value={kg(weldingKg)}
            note={
              weight === null ? null : (
                <>
                  <Bar pct={coverage} over={over} />
                  <span className={over ? css.danger : undefined}>
                    {over ? 'Ağırlığı aşıyor' : `Ağırlığa oranı %${tr(coverage, 0)}`}
                  </span>
                </>
              )
            }
          />
          <Stat
            label="Taşerona atanan"
            value={kg(usedKg)}
            note={
              weldingKg ? `Kaynak kademelerine oranı %${Math.round((usedKg / weldingKg) * 100)}` : null
            }
          />
          <Stat
            label="Boya kademeleri"
            value={paint.length ? kg(sum(paint, 'allocated_weight_kg')) : '–'}
            note={paint.length ? `${paint.length} kademe` : null}
          />
        </div>
        {editable ? (
          <Button
            size="xs"
            variant="outline"
            leftSection={<FaIcon icon="fas fa-weight-hanging" />}
            onClick={() => {
              // One modal at a time: close the detail view, open the tree planner on this job.
              onClose();
              actions.openWeightPlanner(job.job_no);
            }}
          >
            Ağırlık ve Kademeler&apos;de düzenle
          </Button>
        ) : null}
      </div>

      {tiers.length === 0 ? (
        <div className={css.pwEmpty}>
          <FaIcon icon="fas fa-layer-group" />
          <div>Bu iş emrinde fiyat kademesi yok.</div>
        </div>
      ) : (
        <Table.ScrollContainer minWidth={700}>
          <Table verticalSpacing="xs" fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Kademe</Table.Th>
                <Table.Th>Tip</Table.Th>
                <Table.Th ta="right">Fiyat</Table.Th>
                <Table.Th ta="right">Ayrılan</Table.Th>
                <Table.Th ta="right">Atanan</Table.Th>
                <Table.Th ta="right">Kalan</Table.Th>
                <Table.Th>Kullanım</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tiers.map((tier) => {
                const remaining = num(tier.remaining_weight_kg) || 0;
                const isPaint = tier.tier_type === 'paint';
                const allocated = num(tier.allocated_weight_kg) || 0;
                const used = num(tier.used_weight_kg) || 0;
                const pct = allocated ? Math.min(100, (used / allocated) * 100) : 0;
                return (
                  <Table.Tr key={tier.id}>
                    <Table.Td fw={600}>{tier.name || '–'}</Table.Td>
                    <Table.Td>
                      <StatusBadge color={isPaint ? 'purple' : 'blue'}>
                        {isPaint ? 'Boya' : 'Kaynak'}
                      </StatusBadge>
                    </Table.Td>
                    <Table.Td ta="right" className={css.num} style={{ whiteSpace: 'nowrap' }}>
                      {price(tier.price_per_kg, tier.currency)}
                    </Table.Td>
                    <Table.Td ta="right" className={css.num} style={{ whiteSpace: 'nowrap' }}>
                      {kg(num(tier.allocated_weight_kg))}
                    </Table.Td>
                    <Table.Td ta="right" className={css.num} style={{ whiteSpace: 'nowrap' }}>
                      {kg(used)}
                    </Table.Td>
                    <Table.Td
                      ta="right"
                      className={remaining < 0 ? `${css.num} ${css.danger}` : css.num}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {kg(remaining)}
                    </Table.Td>
                    <Table.Td w={140}>
                      <Bar
                        pct={pct}
                        over={used > allocated + 0.001}
                        title={`%${tr(pct, 0)} atandı`}
                      />
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <div className={css.pwFoot}>
        Ağırlık ve fiyat kademeleri, ana iş emrinin <strong>Ağırlık ve Kademeler</strong>{' '}
        ekranından tüm alt işlerle birlikte girilir ve düzenlenir.
      </div>
    </div>
  );
}
