import { Accordion, Alert, Drawer, Progress, Skeleton, Stack, Table, Tabs } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { outflowDetailQueryOptions, type OutflowDetail } from '@/api/procurement/reports';
import { inflowDetailQueryOptions, type InflowDetailRow } from '@/api/sales/reports';
import { formatNumber } from '@/lib/format';
import { FaIcon, notify, StatusBadge, type StatusFamily } from '@/ui';
import { num } from './cashFlowData';
import {
  ADHOC_CATEGORY_LABELS,
  byString,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_RECURRENCE_LABELS,
  groupSorted,
  hasOutflowContent,
  inflowRows,
  inflowTotal,
  isInflowOverdue,
  isOutflowOverdue,
  OUTFLOW_SECTIONS,
  outflowDetail,
  outflowItemCount,
  sectionHasContent,
  sectionTotal,
  sumOutflowPaidAwaiting,
  TAX_TYPE_LABELS,
  type OutflowSectionKey,
} from './drilldownData';
import { amountWithCode, eur } from './money';
import classes from './cashFlow.module.css';

const JOB_TRACKING_BASE = '/projects/project-tracking/?job_no=';

const JOB_STATUS: Record<string, [StatusFamily, string]> = {
  active: ['blue', 'Aktif'],
  completed: ['green', 'Tamamlandı'],
  on_hold: ['yellow', 'Beklemede'],
  draft: ['grey', 'Taslak'],
  cancelled: ['red', 'İptal'],
};

export interface DrillMonth {
  month: string;
  label: string;
}

function JobStatus({ status }: { status: string | null | undefined }) {
  const [family, label] = (status && JOB_STATUS[status]) || ['grey', status || '—'];
  return <StatusBadge color={family}>{label}</StatusBadge>;
}

function PaymentStatus({ paid }: { paid?: boolean }) {
  return paid ? (
    <StatusBadge color="green">Ödendi</StatusBadge>
  ) : (
    <StatusBadge color="yellow">Bekliyor</StatusBadge>
  );
}

function Due({ date, overdue }: { date: string | null | undefined; overdue: boolean }) {
  if (!overdue) return <>{date || '—'}</>;
  return (
    <span className={classes.overdue} title="Vadesi geçti">
      <FaIcon icon="fas fa-clock" /> {date}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className={classes.empty}>
      <FaIcon icon="fas fa-inbox" />
      {children}
    </div>
  );
}

function DrillTable({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <Table.ScrollContainer minWidth={480}>
      <Table className={classes.drillTable} striped={false} verticalSpacing={6}>
        <Table.Thead>
          <Table.Tr>
            {head.map((h) => (
              <Table.Th
                key={h}
                style={h === 'EUR' || h === 'Tutar' ? { textAlign: 'right' } : undefined}
              >
                {h}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{children}</Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function rowFlags(paid: boolean | undefined, overdue: boolean) {
  return { 'data-paid': paid ? '' : undefined, 'data-overdue': overdue ? '' : undefined };
}

function InflowTab({ rows, today }: { rows: InflowDetailRow[]; today: Date }) {
  const groups = useMemo(() => groupSorted(rows, (r) => r.customer_name || '—'), [rows]);
  if (!rows.length) return <Empty>Bu ay için gelen ödeme yok.</Empty>;
  return (
    <>
      <Accordion multiple defaultValue={groups.map(([name]) => name)} variant="separated">
        {groups.map(([name, items]) => (
          <Accordion.Item key={name} value={name}>
            <Accordion.Control>
              <span className={classes.groupHead}>
                <span>{name}</span>
                <span>{eur(inflowTotal(items))}</span>
              </span>
            </Accordion.Control>
            <Accordion.Panel>
              <DrillTable
                head={[
                  'Teklif',
                  'Başlık',
                  'İş Emri',
                  'Durum',
                  'İlerleme',
                  'Taksit',
                  'Vade',
                  'Tutar',
                  'EUR',
                  'Sipariş',
                ]}
              >
                {items.map((r, index) => {
                  const overdue = isInflowOverdue(r, today);
                  const cur = (r.original_currency || 'EUR').toUpperCase();
                  const foreign = cur !== 'EUR';
                  const pct = Math.min(100, Math.max(0, num(r.job_completion_percentage)));
                  return (
                    <Table.Tr key={index} {...rowFlags(false, overdue)}>
                      <Table.Td>
                        {r.offer_no ? (
                          <a
                            href={`/sales/offers?offer_no=${encodeURIComponent(r.offer_no)}`}
                            target="_blank"
                            rel="noopener"
                          >
                            {r.offer_no}
                          </a>
                        ) : (
                          '—'
                        )}
                      </Table.Td>
                      <Table.Td className={classes.wrap} title={r.offer_title ?? undefined}>
                        {r.offer_title}
                      </Table.Td>
                      <Table.Td>
                        {r.job_no ? (
                          <a
                            href={`${JOB_TRACKING_BASE}${encodeURIComponent(r.job_no)}`}
                            target="_blank"
                            rel="noopener"
                          >
                            {r.job_no}
                          </a>
                        ) : (
                          '—'
                        )}
                      </Table.Td>
                      <Table.Td>
                        <JobStatus status={r.job_status} />
                      </Table.Td>
                      <Table.Td style={{ minWidth: 90 }}>
                        <Progress
                          value={pct}
                          size="sm"
                          aria-label={`İlerleme ${formatNumber(pct, { maximumFractionDigits: 1 })}%`}
                        />
                        <small className={classes.muted}>
                          {formatNumber(pct, { maximumFractionDigits: 1 })}%
                        </small>
                      </Table.Td>
                      <Table.Td>
                        {r.installment_label || ''} ·{' '}
                        {formatNumber(num(r.installment_percentage), { maximumFractionDigits: 1 })}%
                      </Table.Td>
                      <Table.Td>
                        <Due date={r.installment_due_date} overdue={overdue} />
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        {amountWithCode(r.installment_amount_original, cur)}
                        {foreign ? (
                          <div className={classes.eurSub}>{eur(r.installment_amount_eur)}</div>
                        ) : null}
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {foreign ? eur(r.installment_amount_eur) : '—'}
                      </Table.Td>
                      <Table.Td className={classes.muted}>{r.order_no || ''}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </DrillTable>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
      <div className={classes.drillFoot}>
        <span>Toplam</span>
        <strong>{eur(inflowTotal(rows))}</strong>
      </div>
    </>
  );
}

function OutflowSection({
  data,
  sectionKey,
  today,
}: {
  data: OutflowDetail;
  sectionKey: OutflowSectionKey;
  today: Date;
}) {
  switch (sectionKey) {
    case 'procurement': {
      const sorted = [...(data.procurement ?? [])].sort(byString((r) => r.due_date));
      const groups = groupSorted(sorted, (r) => r.supplier_name || r.supplier_code || '—');
      return (
        <>
          {groups.map(([name, items]) => {
            const code = items[0]?.supplier_code;
            return (
              <div key={name}>
                <div className={classes.subgroupTitle}>
                  {name}
                  {code ? (
                    <span className={classes.muted} style={{ fontWeight: 400 }}>
                      {' '}
                      ({code})
                    </span>
                  ) : null}
                </div>
                <DrillTable head={['Başlık', 'Ödeme', 'Vade', 'EUR', 'Durum']}>
                  {items.map((r, index) => {
                    const overdue = isOutflowOverdue(r, today);
                    return (
                      <Table.Tr key={index} {...rowFlags(r.is_paid, overdue)}>
                        <Table.Td className={classes.wrap}>{r.pr_title || '—'}</Table.Td>
                        <Table.Td>{r.label || '—'}</Table.Td>
                        <Table.Td>
                          <Due date={r.due_date} overdue={overdue} />
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'right', fontWeight: 700 }}>
                          {eur(r.amount_eur)}
                        </Table.Td>
                        <Table.Td>
                          <PaymentStatus paid={r.is_paid} />
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </DrillTable>
              </div>
            );
          })}
        </>
      );
    }
    case 'wages': {
      const wages = data.wages;
      if (!wages || num(wages.total_eur) <= 0) return null;
      return (
        <>
          <div className={classes.wages}>
            <div>
              <div className={classes.wagesLabel}>Bordro</div>
              <div className={classes.wagesValue}>{eur(wages.base_payroll_eur)}</div>
            </div>
            <div>
              <div className={classes.wagesLabel}>Mesai primi</div>
              <div className={classes.wagesValue}>{eur(wages.overtime_premium_eur)}</div>
            </div>
            <div>
              <div className={classes.wagesLabel}>Toplam</div>
              <div className={classes.wagesValue} style={{ fontWeight: 700 }}>
                {eur(wages.total_eur)}
              </div>
            </div>
          </div>
          {wages.employee_count !== null && wages.employee_count !== undefined ? (
            <p className={classes.hint}>
              {Number(wages.employee_count).toLocaleString('tr-TR')} çalışan
            </p>
          ) : null}
        </>
      );
    }
    case 'expenses': {
      const sorted = [...(data.expenses ?? [])].sort(byString((r) => r.description, 'tr'));
      return (
        <DrillTable head={['Kategori', 'Açıklama', 'Periyot', 'EUR']}>
          {sorted.map((r, index) => (
            <Table.Tr key={index}>
              <Table.Td>
                <StatusBadge color="grey">
                  {EXPENSE_CATEGORY_LABELS[r.category ?? ''] || r.category || '—'}
                </StatusBadge>
              </Table.Td>
              <Table.Td className={classes.wrap}>{r.description || '—'}</Table.Td>
              <Table.Td title="Bu ay görünme nedeni">
                {EXPENSE_RECURRENCE_LABELS[r.recurrence ?? ''] || r.recurrence || '—'}
              </Table.Td>
              <Table.Td style={{ textAlign: 'right', fontWeight: 700 }}>
                {eur(r.amount_eur)}
              </Table.Td>
            </Table.Tr>
          ))}
        </DrillTable>
      );
    }
    case 'loans': {
      const sorted = [...(data.loans ?? [])].sort(byString((r) => r.due_date));
      return (
        <DrillTable head={['Kredi', 'Taksit', 'Vade', 'EUR', 'Durum']}>
          {sorted.map((r, index) => {
            const overdue = isOutflowOverdue(r, today);
            return (
              <Table.Tr key={index} {...rowFlags(r.is_paid, overdue)}>
                <Table.Td className={classes.wrap}>{r.loan_name || '—'}</Table.Td>
                <Table.Td>
                  {r.sequence !== null && r.sequence !== undefined ? `#${r.sequence}` : '—'}
                </Table.Td>
                <Table.Td>
                  <Due date={r.due_date} overdue={overdue} />
                </Table.Td>
                <Table.Td style={{ textAlign: 'right', fontWeight: 700 }}>
                  {eur(r.amount_eur)}
                </Table.Td>
                <Table.Td>
                  <PaymentStatus paid={r.is_paid} />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </DrillTable>
      );
    }
    case 'taxes': {
      const sorted = [...(data.taxes ?? [])].sort(byString((r) => r.due_date));
      return (
        <DrillTable head={['Tür', 'Dönem', 'Vade', 'EUR', 'Durum']}>
          {sorted.map((r, index) => {
            const overdue = isOutflowOverdue(r, today);
            return (
              <Table.Tr key={index} {...rowFlags(r.is_paid, overdue)}>
                <Table.Td>
                  <StatusBadge color="grey">
                    {TAX_TYPE_LABELS[r.tax_type ?? ''] || r.tax_type || '—'}
                  </StatusBadge>
                </Table.Td>
                <Table.Td className={classes.wrap}>{r.period_label || '—'}</Table.Td>
                <Table.Td>
                  <Due date={r.due_date} overdue={overdue} />
                </Table.Td>
                <Table.Td style={{ textAlign: 'right', fontWeight: 700 }}>
                  {eur(r.amount_eur)}
                </Table.Td>
                <Table.Td>
                  <PaymentStatus paid={r.is_paid} />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </DrillTable>
      );
    }
    case 'adhoc_costs': {
      const sorted = [...(data.adhoc_costs ?? [])].sort(byString((r) => r.cost_date));
      return (
        <DrillTable head={['İş Emri', 'Açıklama', 'Kategori', 'Tarih', 'EUR']}>
          {sorted.map((r, index) => (
            <Table.Tr key={index}>
              <Table.Td>
                {r.job_no ? (
                  <a
                    href={`${JOB_TRACKING_BASE}${encodeURIComponent(r.job_no)}`}
                    target="_blank"
                    rel="noopener"
                  >
                    {r.job_no}
                  </a>
                ) : (
                  '—'
                )}
              </Table.Td>
              <Table.Td className={classes.wrap}>{r.description || '—'}</Table.Td>
              <Table.Td>
                <StatusBadge color="grey">
                  {ADHOC_CATEGORY_LABELS[r.category ?? ''] || r.category || '—'}
                </StatusBadge>
              </Table.Td>
              <Table.Td>{r.cost_date || '—'}</Table.Td>
              <Table.Td style={{ textAlign: 'right', fontWeight: 700 }}>
                {eur(r.amount_eur)}
              </Table.Td>
            </Table.Tr>
          ))}
        </DrillTable>
      );
    }
    default:
      return null;
  }
}

function OutflowTab({ data, today }: { data: OutflowDetail | null; today: Date }) {
  if (!data || !hasOutflowContent(data)) return <Empty>Bu ay için giden ödeme yok.</Empty>;
  const sections = OUTFLOW_SECTIONS.filter((s) => sectionHasContent(data, s.key));
  const { paidTotal, awaitTotal } = sumOutflowPaidAwaiting(data);
  return (
    <>
      <Accordion multiple defaultValue={sections.map((s) => s.key)} variant="separated">
        {sections.map((section) => (
          <Accordion.Item key={section.key} value={section.key}>
            <Accordion.Control>
              <span className={classes.groupHead}>
                <span>{section.title}</span>
                <span>{eur(sectionTotal(data, section.totalKey))}</span>
              </span>
            </Accordion.Control>
            <Accordion.Panel>
              <OutflowSection data={data} sectionKey={section.key} today={today} />
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
      {paidTotal > 0 || awaitTotal > 0 ? (
        <div className={classes.drillFoot}>
          <span>
            Ödenen <strong className={classes.in}>{eur(paidTotal)}</strong>
          </span>
          <span>
            Bekleyen <strong className={classes.await}>{eur(awaitTotal)}</strong>
          </span>
        </div>
      ) : null}
    </>
  );
}

/** Port of cash-flow-drilldown.js: the month's inflow and outflow lines in a side drawer. */
export function CashFlowDrilldown({
  target,
  onClose,
}: {
  target: DrillMonth | null;
  onClose: () => void;
}) {
  // Keep the last month while the drawer animates closed.
  const [shown, setShown] = useState(target);
  if (target && target !== shown) setShown(target);
  const month = shown?.month ?? '';
  const inQ = useQuery(inflowDetailQueryOptions(month));
  const outQ = useQuery(outflowDetailQueryOptions(month));
  const [today] = useState(() => new Date());
  const [tab, setTab] = useState<string | null>(null);

  const loading = Boolean(month) && (inQ.isPending || outQ.isPending);
  const bothFailed = inQ.isError && outQ.isError;
  const inflow = inQ.isError ? [] : inflowRows(inQ.data);
  const outflow = outQ.isError ? null : outflowDetail(outQ.data);

  // Legacy: one failure is a warning, both an error.
  useEffect(() => {
    if (!month || loading) return;
    const warnings = [
      inQ.isError ? 'Giriş detayı yüklenemedi.' : null,
      outQ.isError ? 'Çıkış detayı yüklenemedi.' : null,
    ].filter(Boolean);
    if (warnings.length === 2) notify.error(new Error(warnings.join(' ')));
    else if (warnings.length === 1) notify.warning(warnings[0]!);
  }, [month, loading, inQ.isError, outQ.isError]);

  const inTotal = inflowTotal(inflow);
  const outTotal = num(outflow?.totals?.grand_total_eur);
  const net = inTotal - outTotal;
  const hasOut = hasOutflowContent(outflow);
  // Opens on Giden when only outflows exist.
  const defaultTab = !inflow.length && hasOut ? 'outflow' : 'inflow';
  const activeTab = tab ?? defaultTab;

  return (
    <Drawer
      opened={Boolean(target)}
      onClose={() => {
        setTab(null);
        onClose();
      }}
      position="right"
      size="min(1100px, 100%)"
      title={
        <span style={{ fontWeight: 600 }}>
          <FaIcon icon="fas fa-magnifying-glass" style={{ marginRight: 8 }} />
          {shown ? `${shown.label || shown.month} — Nakit Akış Detayı` : 'Nakit Akış Detayı'}
        </span>
      }
    >
      {loading ? (
        <Stack gap="xs" data-testid="drill-loading">
          <Skeleton height={16} />
          <Skeleton height={16} width="70%" />
        </Stack>
      ) : bothFailed ? (
        <Alert color="red" icon={<FaIcon icon="fas fa-triangle-exclamation" />}>
          Detay verisi yüklenemedi.
        </Alert>
      ) : (
        <>
          <div className={classes.drillSummary}>
            <span className={classes.chip} data-family="green">
              <FaIcon icon="fas fa-arrow-down" /> Giriş {eur(inTotal)}
            </span>
            <span className={classes.chip} data-family="red">
              <FaIcon icon="fas fa-arrow-up" /> Çıkış {eur(outTotal)}
            </span>
            <span
              className={`${classes.drillNet} ${classes.net}`}
              data-tone={net >= 0 ? 'in' : 'out'}
            >
              Net: {net >= 0 ? '+' : '−'}
              {eur(Math.abs(net))}
            </span>
          </div>
          {!inflow.length && !hasOut ? (
            <div className={classes.empty}>
              <FaIcon icon="fas fa-calendar-xmark" />
              Bu ay için nakit hareketi yok.
            </div>
          ) : (
            <Tabs value={activeTab} onChange={setTab} keepMounted={false} mt="sm">
              <Tabs.List>
                <Tabs.Tab value="inflow">Gelen ({inflow.length})</Tabs.Tab>
                <Tabs.Tab value="outflow">Giden ({outflowItemCount(outflow)})</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="inflow" pt="md">
                <InflowTab rows={inflow} today={today} />
              </Tabs.Panel>
              <Tabs.Panel value="outflow" pt="md">
                <OutflowTab data={outflow} today={today} />
              </Tabs.Panel>
            </Tabs>
          )}
        </>
      )}
    </Drawer>
  );
}
