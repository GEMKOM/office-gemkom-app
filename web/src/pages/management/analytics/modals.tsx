import { Accordion, Alert, Box, Button, Group, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, type ReactNode } from 'react';
import { combinedJobCostsQueryOptions } from '@/api/jobCosts/combinedJobCosts';
import { machiningJobEntriesQueryOptions } from '@/api/jobCosts/machiningJobEntries';
import {
  costTableRowQueryOptions,
  procurementLinesQueryOptions,
  subcontractorCostBreakdownQueryOptions,
} from '@/api/projects/cost';
import { weldingJobCostDetailQueryOptions, type WeldingJobEntry } from '@/api/welding/jobCosts';
import { formatNumber, formatPercent } from '@/lib/format';
import {
  DataTable,
  DetailModal,
  FaIcon,
  notify,
  type DataTableColumn,
  type DetailSection,
} from '@/ui';
import { KpiGrid, KpiTile } from '@/ui/charts';
import {
  jobLaborFigures,
  laborByJobRows,
  MACHINING_WORK_TYPES,
  machiningOperations,
  machiningTableRows,
  num,
  pickSubtreeLabor,
  splitOverhead,
  weldingGroups,
  WELDING_OVERTIME_TYPES,
  type MachiningTableRow,
  type SubtreeLabor,
} from './analyticsData';
import { Dash, euro, Money } from './cells';
import classes from './analytics.module.css';

export interface DrillModalProps {
  jobNo: string;
  onClose: () => void;
}

const hoursText = (value: unknown) => `${formatNumber(num(value), 1)} saat`;
const h1 = (value: unknown) => formatNumber(num(value), 1);

/** Closes the modal with the legacy message when a load fails. */
function useFailClose(failed: boolean, message: string, onClose: () => void) {
  useEffect(() => {
    if (!failed) return;
    notify.error(message);
    onClose();
  }, [failed, message, onClose]);
}

export interface Tile {
  icon: string;
  label: string;
  value: ReactNode;
}

export function Tiles({ items, min = 170 }: { items: Tile[]; min?: number }) {
  return (
    <KpiGrid minWidth={min}>
      {items.map((item) => (
        <KpiTile key={item.label} icon={item.icon} label={item.label} value={item.value} />
      ))}
    </KpiGrid>
  );
}

const empty = (text: string) => (
  <Text c="dimmed" ta="center" py="lg" size="sm">
    {text}
  </Text>
);

/** The combined machining + welding row for the job and its subtree (include_descendants). */
function useSubtreeLabor(jobNo: string) {
  return useQuery({
    ...combinedJobCostsQueryOptions({ job_no: jobNo, include_descendants: true }),
    select: (page) => pickSubtreeLabor(page.results as SubtreeLabor[], jobNo),
  });
}

/* ── İşçilik (job) ──────────────────────────────────────────────────── */

export function JobDetailsModal({
  jobNo,
  onClose,
  onDepartment,
}: DrillModalProps & { onDepartment: (kind: 'machining' | 'welding') => void }) {
  const labor = useSubtreeLabor(jobNo);
  const costRow = useQuery(costTableRowQueryOptions(jobNo));
  const failed = labor.isError || costRow.isError;
  useFailClose(failed, 'İş detayları yüklenirken hata oluştu.', onClose);
  const missing = labor.isSuccess && !labor.data;
  useFailClose(missing, 'Maliyet verisi bulunamadı.', onClose);

  const loading = labor.isPending || costRow.isPending;
  let sections: DetailSection[] = [{ content: <Box mih={200} /> }];
  if (!loading && labor.data) {
    const job = labor.data;
    const f = jobLaborFigures(job, costRow.data ?? null);
    const byJob = job.by_job ?? [];
    const department = (
      kind: 'machining' | 'welding',
      d: ReturnType<typeof jobLaborFigures>['machining'],
    ): ReactNode =>
      d ? (
        <>
          <Tiles
            items={[
              {
                icon: 'fas fa-money-bill-wave',
                label: 'İşçilik (vergi hariç)',
                value: euro(d.base),
              },
              { icon: 'fas fa-percent', label: 'Vergi / genel gider', value: euro(d.tax) },
              { icon: 'fas fa-euro-sign', label: 'İşçilik + Vergi', value: euro(d.withTax) },
              { icon: 'fas fa-clock', label: 'Saat', value: h1(d.hours) },
              { icon: 'fas fa-calendar', label: 'Mesai Maliyeti', value: euro(d.overtimeCost) },
              {
                icon: 'fas fa-calculator',
                label: 'Saat/Maliyet (+ vergi)',
                value: euro(d.costPerHourWithTax),
              },
            ]}
          />
          <Group justify="center" mt="sm">
            <Button
              size="xs"
              leftSection={<FaIcon icon="fas fa-table" />}
              onClick={() => onDepartment(kind)}
            >
              Detay
            </Button>
          </Group>
        </>
      ) : (
        empty(kind === 'machining' ? 'Talaşlı imalat verisi yok.' : 'Kaynaklı imalat verisi yok.')
      );

    sections = [
      {
        title: 'Özet',
        icon: 'fas fa-chart-pie',
        content: (
          <>
            {byJob.length >= 2 ? (
              <Alert variant="light" color="gray" mb="sm" icon={<FaIcon icon="fas fa-sitemap" />}>
                <Text size="sm">
                  <strong>{jobNo}</strong> ve alt iş emirleri birlikte gösteriliyor (işçilik kaydı
                  olan {byJob.length} iş emri).
                </Text>
              </Alert>
            ) : null}
            <Tiles
              items={[
                {
                  icon: 'fas fa-money-bill-wave',
                  label: 'İşçilik (vergi hariç)',
                  value: euro(f.laborNet),
                },
                { icon: 'fas fa-percent', label: 'Vergi / genel gider', value: euro(f.overhead) },
                { icon: 'fas fa-euro-sign', label: 'İşçilik + Vergi', value: euro(f.laborWithTax) },
                {
                  icon: 'fas fa-clock',
                  label: f.multiJob ? 'Toplam Saat (alt iş emirleri dahil)' : 'Toplam Saat',
                  value: h1(f.totalHours),
                },
                {
                  icon: 'fas fa-calculator',
                  label: 'Saat Başı (işçilik + vergi)',
                  value: euro(f.costPerHourWithTax),
                },
              ]}
            />
          </>
        ),
      },
      {
        title: 'Talaşlı İmalat',
        icon: 'fas fa-cog',
        content: department('machining', f.machining),
      },
      { title: 'Kaynaklı İmalat', icon: 'fas fa-fire', content: department('welding', f.welding) },
      {
        title: 'İş Emri Bazında İşçilik',
        icon: 'fas fa-sitemap',
        hidden: !f.multiJob,
        content: <LaborByJobTable byJob={byJob} />,
      },
    ];
  }

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`${jobNo} - İş Maliyeti Detayları`}
      icon="fas fa-calculator"
      size={1140}
      loading={loading}
      sections={sections}
    />
  );
}

function LaborByJobTable({ byJob }: { byJob: NonNullable<SubtreeLabor['by_job']> }) {
  const { rows, total } = laborByJobRows(byJob);
  return (
    <div className={classes.tableScroll}>
      <table className={classes.plainTable}>
        <thead>
          <tr>
            <th>İş Emri</th>
            <th className={classes.num}>Talaşlı</th>
            <th className={classes.num}>Kaynaklı</th>
            <th className={classes.num}>Toplam (vergi hariç)</th>
            <th className={classes.num}>Saat</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.job_no}>
              <td className={classes.code}>{r.job_no}</td>
              <td className={classes.num}>{euro(r.machining)}</td>
              <td className={classes.num}>{euro(r.welding)}</td>
              <td className={classes.num} style={{ fontWeight: 700 }}>
                {euro(r.total)}
              </td>
              <td className={classes.num}>{h1(r.hours)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Toplam</td>
            <td className={classes.num}>{euro(total.machining)}</td>
            <td className={classes.num}>{euro(total.welding)}</td>
            <td className={classes.num}>{euro(total.total)}</td>
            <td className={classes.num}>{h1(total.hours)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ── Talaşlı imalat ─────────────────────────────────────────────────── */

const machiningColumns: DataTableColumn<MachiningTableRow>[] = [
  {
    key: 'operation',
    header: 'Operasyon',
    render: (row) =>
      row.summary ? (
        <Group gap={6} wrap="nowrap">
          {row.job_no && row.group.includes('|') ? (
            <span className={classes.code}>{row.job_no}</span>
          ) : null}
          <span className={classes.pill} data-family="blue">
            {row.operation_name}
          </span>
          <Text span size="xs" c="dimmed">
            {row.operation_key}
          </Text>
        </Group>
      ) : null,
    exportValue: (row) =>
      `${row.job_no ? `${row.job_no} ` : ''}${row.operation_name} (${row.operation_key})`,
  },
  {
    key: 'date',
    header: 'Tarih',
    width: 120,
    render: (row) =>
      row.summary ? (
        <Text span fw={700} c="dimmed">
          Toplam
        </Text>
      ) : (
        row.date
      ),
  },
  { key: 'employee', header: 'Çalışan', render: (row) => (row.summary ? <Dash /> : row.employee) },
  {
    key: 'hours',
    header: 'Saat',
    width: 100,
    align: 'right',
    render: (row) => (
      <span style={row.summary ? { fontWeight: 700 } : undefined}>{h1(row.hours)}</span>
    ),
  },
  {
    key: 'cost',
    header: 'Maliyet',
    width: 120,
    align: 'right',
    render: (row) => <Money value={row.cost} bold={row.summary} />,
  },
  {
    key: 'work_type',
    header: 'Tip',
    width: 120,
    render: (row) =>
      row.summary ? <Dash /> : MACHINING_WORK_TYPES[row.work_type] || row.work_type || '-',
  },
];

export function MachiningDetailsModal({ jobNo, onClose }: DrillModalProps) {
  const entries = useQuery(
    machiningJobEntriesQueryOptions({ job_no: jobNo, include_descendants: true }),
  );
  const costRow = useQuery(costTableRowQueryOptions(jobNo));
  const labor = useSubtreeLabor(jobNo);
  useFailClose(
    entries.isError || costRow.isError || labor.isError,
    'Talaşlı imalat detayları yüklenirken hata.',
    onClose,
  );
  const loading = entries.isPending || costRow.isPending || labor.isPending;

  const table = useMemo(
    () =>
      machiningTableRows(
        machiningOperations((entries.data?.entries as unknown[] | undefined) ?? []),
      ),
    [entries.data],
  );

  let sections: DetailSection[] = [{ content: <Box mih={200} /> }];
  if (!loading && entries.data) {
    const summary = entries.data.summary ?? {};
    const overhead = costRow.data ? num(costRow.data.employee_overhead_cost) : 0;
    const machTax = splitOverhead(
      overhead,
      labor.data?.machining?.total_cost,
      labor.data?.welding?.total_cost,
    ).mach;
    const net = num(summary.total_cost);
    sections = [
      {
        title: 'Özet',
        icon: 'fas fa-chart-pie',
        content: (
          <Tiles
            min={150}
            items={[
              {
                icon: 'fas fa-list',
                label: 'Toplam Kayıt',
                value: formatNumber(summary.total_entries || 0),
              },
              { icon: 'fas fa-clock', label: 'Toplam Saat', value: hoursText(summary.total_hours) },
              { icon: 'fas fa-money-bill-wave', label: 'İşçilik (vergi hariç)', value: euro(net) },
              { icon: 'fas fa-percent', label: 'Vergi / genel gider', value: euro(machTax) },
              { icon: 'fas fa-euro-sign', label: 'İşçilik + Vergi', value: euro(net + machTax) },
              {
                icon: 'fas fa-calendar-day',
                label: 'Hafta İçi',
                value: hoursText(summary.breakdown_by_type?.weekday_work),
              },
              {
                icon: 'fas fa-clock',
                label: 'Mesai',
                value: hoursText(summary.breakdown_by_type?.after_hours),
              },
              {
                icon: 'fas fa-calendar',
                label: 'Pazar',
                value: hoursText(summary.breakdown_by_type?.sunday),
              },
            ]}
          />
        ),
      },
      table.rows.length
        ? {
            content: (
              <DataTable
                title="Kayıtlar"
                icon="fas fa-table"
                data={table.rows}
                columns={machiningColumns}
                getRowId={(row) => row.id}
                rowStyle={(row) =>
                  row.summary ? { background: 'var(--gk-surface-subtle)' } : undefined
                }
              />
            ),
          }
        : { title: 'Kayıtlar', content: empty('Kayıt bulunamadı.') },
    ];
  }

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`${jobNo} - Talaşlı İmalat Detayları${table.multiJob ? ' (alt iş emirleri dahil)' : ''}`}
      icon="fas fa-cog"
      size={1140}
      loading={loading}
      sections={sections}
    />
  );
}

/* ── Kaynaklı imalat ────────────────────────────────────────────────── */

const weldingColumns: DataTableColumn<WeldingJobEntry>[] = [
  { key: 'date', header: 'Tarih', width: 120, sortable: true, render: (row) => row.date || '-' },
  {
    key: 'employee_full_name',
    header: 'Çalışan',
    sortable: true,
    accessor: (row) => row.employee_full_name || row.employee_username || '-',
  },
  {
    key: 'hours',
    header: 'Saat',
    width: 100,
    align: 'right',
    sortable: true,
    accessor: (row) => num(row.hours),
    render: (row) => h1(row.hours),
  },
  {
    key: 'cost',
    header: 'Maliyet',
    width: 120,
    align: 'right',
    sortable: true,
    accessor: (row) => num(row.cost),
    render: (row) => <Money value={row.cost} />,
  },
  {
    key: 'overtime_type',
    header: 'Tip',
    width: 120,
    sortable: true,
    accessor: (row) => WELDING_OVERTIME_TYPES[row.overtime_type ?? ''] || row.overtime_type || '-',
  },
];

export function WeldingDetailsModal({ jobNo, onClose }: DrillModalProps) {
  const detail = useQuery(
    weldingJobCostDetailQueryOptions({ job_no: jobNo, include_descendants: true }),
  );
  const costRow = useQuery(costTableRowQueryOptions(jobNo));
  const labor = useSubtreeLabor(jobNo);
  useFailClose(
    detail.isError || costRow.isError || labor.isError,
    'Kaynaklı imalat detayları yüklenirken hata.',
    onClose,
  );
  const loading = detail.isPending || costRow.isPending || labor.isPending;
  const grouped = useMemo(() => weldingGroups(detail.data?.entries ?? []), [detail.data]);

  let sections: DetailSection[] = [{ content: <Box mih={200} /> }];
  if (!loading && detail.data) {
    const summary = detail.data.summary ?? {};
    const overhead = costRow.data ? num(costRow.data.employee_overhead_cost) : 0;
    const weldTax = splitOverhead(
      overhead,
      labor.data?.machining?.total_cost,
      labor.data?.welding?.total_cost,
    ).weld;
    const net = num(summary.total_cost);
    const breakdown = (summary.breakdown_by_type ?? {}) as Record<string, unknown>;
    sections = [
      {
        title: 'Özet',
        icon: 'fas fa-chart-pie',
        content: (
          <Tiles
            min={150}
            items={[
              {
                icon: 'fas fa-list',
                label: 'Toplam Kayıt',
                value: formatNumber(summary.total_entries || grouped.sorted.length),
              },
              { icon: 'fas fa-clock', label: 'Toplam Saat', value: hoursText(summary.total_hours) },
              { icon: 'fas fa-money-bill-wave', label: 'İşçilik (vergi hariç)', value: euro(net) },
              { icon: 'fas fa-percent', label: 'Vergi / genel gider', value: euro(weldTax) },
              { icon: 'fas fa-euro-sign', label: 'İşçilik + Vergi', value: euro(net + weldTax) },
              {
                icon: 'fas fa-calendar-day',
                label: 'Normal Saat',
                value: hoursText(breakdown.regular),
              },
              {
                icon: 'fas fa-clock',
                label: 'Mesai Saat',
                value: hoursText(breakdown.after_hours),
              },
              { icon: 'fas fa-calendar', label: 'Tatil Saat', value: hoursText(breakdown.holiday) },
            ]}
          />
        ),
      },
      !grouped.sorted.length
        ? { title: 'Kayıtlar', content: empty('Kayıt bulunamadı.') }
        : grouped.multiJob
          ? {
              // A subtree's entries per job order, folded so the totals read first.
              title: 'Kayıtlar',
              icon: 'fas fa-table',
              content: (
                <Accordion multiple variant="separated">
                  {grouped.groups.map((group) => (
                    <Accordion.Item key={group.jobNo} value={group.jobNo}>
                      <Accordion.Control>
                        <Group gap={8}>
                          <span className={classes.code}>{group.jobNo}</span>
                          <Text span size="sm" c="dimmed">
                            {group.rows.length} kayıt · {h1(group.hours)} saat ·
                          </Text>
                          <Text span size="sm" fw={700}>
                            {euro(group.cost)}
                          </Text>
                        </Group>
                      </Accordion.Control>
                      <Accordion.Panel>
                        <DataTable
                          data={group.rows}
                          columns={weldingColumns}
                          getRowId={(row, index) => `${row.id ?? index}`}
                        />
                      </Accordion.Panel>
                    </Accordion.Item>
                  ))}
                </Accordion>
              ),
            }
          : {
              content: (
                <DataTable
                  title="Kayıtlar"
                  icon="fas fa-table"
                  data={grouped.sorted}
                  columns={weldingColumns}
                  getRowId={(row, index) => `${row.id ?? index}`}
                />
              ),
            },
    ];
  }

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`${jobNo} - Kaynaklı İmalat Detayları${grouped.multiJob ? ' (alt iş emirleri dahil)' : ''}`}
      icon="fas fa-fire"
      size={1140}
      loading={loading}
      sections={sections}
    />
  );
}

/* ── Malzeme ────────────────────────────────────────────────────────── */

export function MaterialDetailsModal({ jobNo, onClose }: DrillModalProps) {
  const lines = useQuery(procurementLinesQueryOptions(jobNo));
  useFailClose(lines.isError, 'Malzeme detayları yüklenirken hata.', onClose);
  const rows = lines.data ?? [];
  const total = rows.reduce((s, l) => s + num(l.amount_eur), 0);

  const content = rows.length ? (
    <div className={classes.tableScroll}>
      <table className={classes.plainTable}>
        <thead>
          <tr>
            <th>Kod</th>
            <th>Ad</th>
            <th>Açıklama</th>
            <th>Birim</th>
            <th className={classes.num}>Miktar</th>
            <th className={classes.num}>Birim Fiyat (€)</th>
            <th className={classes.num}>Tutar (€)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l, index) => (
            <tr key={l.id ?? index}>
              <td className={classes.code}>{l.item_code || '–'}</td>
              <td>{l.item_name || '–'}</td>
              <td style={{ color: 'var(--gk-muted)' }}>{l.item_description || ''}</td>
              <td style={{ color: 'var(--gk-muted)' }}>{l.item_unit || '–'}</td>
              <td className={classes.num}>
                {l.quantity === null || l.quantity === undefined || l.quantity === '' ? (
                  <Dash />
                ) : (
                  formatNumber(num(l.quantity), 2)
                )}
              </td>
              <td className={classes.num}>
                <Money value={l.unit_price} />
              </td>
              <td className={classes.num} style={{ fontWeight: 600 }}>
                <Money value={l.amount_eur} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6}>Toplam ({rows.length} satır)</td>
            <td className={classes.num}>{euro(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  ) : (
    empty('Satır bulunamadı.')
  );

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`${jobNo} - Malzeme Detayları`}
      icon="fas fa-box"
      size={1140}
      loading={lines.isPending}
      sections={
        lines.isPending
          ? [{ content: <Box mih={160} /> }]
          : [{ title: 'Malzeme Satırları', icon: 'fas fa-table', content }]
      }
    />
  );
}

/* ── Taşeron ────────────────────────────────────────────────────────── */

const moneyIn = (value: unknown, currency: string | null | undefined) =>
  `${formatNumber(num(value), 2)} ${currency || 'TRY'}`;

export function SubcontractorDetailsModal({ jobNo, onClose }: DrillModalProps) {
  const breakdown = useQuery(subcontractorCostBreakdownQueryOptions(jobNo));
  useFailClose(breakdown.isError, 'Taşeron detayları yüklenirken hata.', onClose);
  const lines = Array.isArray(breakdown.data?.lines) ? breakdown.data.lines : [];
  const adjustments = Array.isArray(breakdown.data?.adjustments) ? breakdown.data.adjustments : [];

  const sections: DetailSection[] = breakdown.isPending
    ? [{ content: <Box mih={160} /> }]
    : [
        {
          title: 'Özet',
          icon: 'fas fa-chart-pie',
          content: (
            <Tiles
              items={[
                { icon: 'fas fa-list', label: 'İş Satırı', value: formatNumber(lines.length) },
                { icon: 'fas fa-edit', label: 'Düzeltme', value: formatNumber(adjustments.length) },
                {
                  icon: 'fas fa-euro-sign',
                  label: 'Toplam (EUR)',
                  value: euro(num(breakdown.data?.total_eur)),
                },
              ]}
            />
          ),
        },
        lines.length
          ? {
              content: (
                <DataTable
                  title="İş Satırları"
                  data={lines.map((l, i) => ({
                    ...l,
                    id: `line-${i}`,
                    period:
                      l.statement_year && l.statement_month
                        ? `${l.statement_month}.${l.statement_year}`
                        : '-',
                  }))}
                  getRowId={(row) => row.id}
                  sortable
                  columns={[
                    { key: 'period', header: 'Dönem' },
                    { key: 'subcontractor_name', header: 'Taşeron' },
                    {
                      key: 'delta_progress',
                      header: 'Delta (%)',
                      align: 'right',
                      accessor: (row) => num(row.delta_progress),
                      render: (row) =>
                        row.delta_progress === null ||
                        row.delta_progress === undefined ||
                        row.delta_progress === ''
                          ? '-'
                          : formatPercent(num(row.delta_progress), 2),
                    },
                    {
                      key: 'cost_amount',
                      header: 'Tutar',
                      align: 'right',
                      accessor: (row) => num(row.cost_amount),
                      render: (row) => moneyIn(row.cost_amount, row.cost_currency),
                    },
                    {
                      key: 'cost_amount_eur',
                      header: 'EUR',
                      align: 'right',
                      accessor: (row) => num(row.cost_amount_eur),
                      render: (row) => <Money value={row.cost_amount_eur} />,
                    },
                  ]}
                />
              ),
            }
          : { title: 'İş Satırları', content: empty('Satır bulunamadı.') },
        {
          hidden: !adjustments.length,
          content: (
            <DataTable
              title="Düzeltmeler"
              data={adjustments.map((a, i) => ({ ...a, id: `adj-${i}` }))}
              getRowId={(row) => row.id}
              sortable
              columns={[
                { key: 'adjustment_type', header: 'Tür' },
                { key: 'reason', header: 'Açıklama' },
                {
                  key: 'amount',
                  header: 'Tutar',
                  align: 'right',
                  accessor: (row) => num(row.amount),
                  render: (row) => moneyIn(row.amount, row.cost_currency),
                },
                {
                  key: 'cost_amount_eur',
                  header: 'EUR',
                  align: 'right',
                  accessor: (row) => num(row.cost_amount_eur),
                  render: (row) => <Money value={row.cost_amount_eur} />,
                },
              ]}
            />
          ),
        },
      ];

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`${jobNo} - Taşeron Detayları`}
      icon="fas fa-handshake"
      size={1140}
      loading={breakdown.isPending}
      sections={sections}
    />
  );
}
