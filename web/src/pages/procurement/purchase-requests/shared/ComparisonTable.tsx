import { ActionIcon, Button, Card, Group, Menu, SimpleGrid, Text, Tooltip } from '@mantine/core';
import { memo, useMemo, useState, type ReactNode } from 'react';
import type { CurrencyRates } from '@/api/procurement/purchaseRequests';
import { SupplierStatusBadge, StarRating } from '@/pages/procurement/suppliers/list/supplierBadges';
import { FaIcon, notify } from '@/ui';
import {
  comparisonSummary,
  convertCurrency,
  formatMoney,
  hasOffer,
  recommendSupplierForAll,
  supplierCurrency,
  supplierTotals,
  toggleRecommendation,
  type ComparisonColumn,
  type ComparisonData,
  type ComparisonItem,
  type ComparisonSupplier,
  type GeneralColumn,
  type Recommendations,
} from './comparison';
import { comparisonRows, exportComparisonCsv, exportComparisonExcel } from './comparisonExport';
import classes from './ComparisonTable.module.css';

// Port of components/comparison-table: items down, suppliers across, one
// sub-column per entry of `columns`; headers minimize on click. Read-only
// except the recommendation stars (create page).

export type RowMark = 'no-offer' | 'no-recommendation';

export interface ComparisonTableProps {
  data: ComparisonData;
  columns: readonly ComparisonColumn[];
  rates?: CurrencyRates | null;
  /** The TOPLAM row (default true). */
  showSummaryRow?: boolean;
  /** The "Özet Bilgiler" card (create). */
  showSummary?: boolean;
  /** Offer notes under Teslim (default true). */
  showNotes?: boolean;
  /** Minimized at first; Teknik Özellikler and Dosyalar always start minimized. */
  initialMinimized?: readonly (GeneralColumn | ComparisonColumn)[];
  /** Turns the stars on: called with the next recommendations. */
  onRecommendationsChange?: (next: Recommendations, change: RecommendationChange) => void;
  onShowFiles?: (item: ComparisonItem) => void;
  onShowSpecifications?: (item: ComparisonItem) => void;
  /** Submit-time marks on item rows (create). */
  rowMarks?: Record<string, RowMark | undefined>;
}

export type RecommendationChange =
  { kind: 'item'; itemKey: string; supplierId: string } | { kind: 'all'; supplierId: string };

const GENERAL: { key: GeneralColumn; label: string | null; icon: string; name: string }[] = [
  { key: 'item', label: 'Malzeme', icon: 'fa-box', name: 'Malzeme' },
  { key: 'job_no', label: 'İş No', icon: 'fa-tag', name: 'İş No' },
  { key: 'quantity', label: 'Miktar', icon: 'fa-hashtag', name: 'Miktar' },
  { key: 'unit', label: 'Birim', icon: 'fa-ruler', name: 'Birim' },
  { key: 'specifications', label: null, icon: 'fa-cogs', name: 'Teknik Özellikler' },
  { key: 'files', label: null, icon: 'fa-paperclip', name: 'Dosyalar' },
];

const SUPPLIER_HEADER: Record<
  ComparisonColumn,
  {
    label: string;
    icon: string | null;
    sub: (cur: string) => string | null;
    short: string;
    title: string;
  }
> = {
  unitPrice: {
    label: 'Birim Fiyat',
    icon: 'fa-tag',
    sub: (c) => c,
    short: 'Birim Fiyat',
    title: 'Birim Fiyat',
  },
  deliveryDays: {
    label: 'Teslim',
    icon: 'fa-clock',
    sub: () => 'Gün',
    short: 'Teslim',
    title: 'Teslim',
  },
  originalTotal: { label: 'Toplam', icon: null, sub: (c) => c, short: 'Toplam', title: 'Toplam' },
  euroTotal: {
    label: 'Euro Toplam',
    icon: 'fa-euro-sign',
    sub: () => 'EUR',
    short: 'Euro',
    title: 'Euro Toplam',
  },
  recommendations: {
    label: 'Öner',
    icon: 'fa-star',
    sub: () => null,
    short: 'Öner',
    title: 'Öneriler',
  },
};

const DEFAULT_MINIMIZED: (GeneralColumn | ComparisonColumn)[] = ['specifications', 'files'];

function Rotated({ children }: { children: ReactNode }) {
  return <span className={classes.rotated}>{children}</span>;
}

export function ComparisonTable({
  data,
  columns,
  rates = null,
  showSummaryRow = true,
  showSummary = false,
  showNotes = true,
  initialMinimized = [],
  onRecommendationsChange,
  onShowFiles,
  onShowSpecifications,
  rowMarks,
}: ComparisonTableProps) {
  const [minimized, setMinimized] = useState<ReadonlySet<string>>(
    () => new Set([...DEFAULT_MINIMIZED, ...initialMinimized]),
  );
  const toggle = (key: string) =>
    setMinimized((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const { items, suppliers, offers, recommendations } = data;
  const perSupplier = columns.length;
  const stars = columns.includes('recommendations') && !!onRecommendationsChange;

  const toggleItem = (itemKey: string, supplierId: string) =>
    onRecommendationsChange?.(toggleRecommendation(recommendations, itemKey, supplierId), {
      kind: 'item',
      itemKey,
      supplierId,
    });
  const recommendAll = (supplierId: string) =>
    onRecommendationsChange?.(recommendSupplierForAll(recommendations, supplierId, items, offers), {
      kind: 'all',
      supplierId,
    });

  const summary = useMemo(
    () =>
      showSummary ? comparisonSummary(items, suppliers, offers, recommendations, rates) : null,
    [showSummary, items, suppliers, offers, recommendations, rates],
  );

  const doExport = async (format: 'csv' | 'excel') => {
    const rows = comparisonRows(data, columns, rates, showSummaryRow && showSummary);
    try {
      if (format === 'csv') exportComparisonCsv(rows);
      else await exportComparisonExcel(data, rows, 'comparison-table', showSummary);
    } catch (error) {
      notify.error(error);
    }
  };

  if (items.length === 0 || suppliers.length === 0) {
    return (
      <div className={classes.empty} data-testid="comparison-empty">
        <FaIcon icon="fas fa-table" style={{ fontSize: 28 }} />
        <p>Karşılaştırma tablosu için veri bulunamadı.</p>
      </div>
    );
  }

  return (
    <>
      <Card withBorder padding="sm" radius="md">
        <Group justify="space-between" mb="xs">
          <Text fw={600}>
            <FaIcon icon="fas fa-table" style={{ marginRight: 6 }} />
            Karşılaştırma Tablosu
          </Text>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Button size="xs" variant="default" leftSection={<FaIcon icon="fas fa-download" />}>
                Dışa Aktar
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<FaIcon icon="fas fa-file-csv" />}
                onClick={() => void doExport('csv')}
              >
                CSV
              </Menu.Item>
              <Menu.Item
                leftSection={<FaIcon icon="fas fa-file-excel" />}
                onClick={() => void doExport('excel')}
              >
                Excel
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
        <div className={classes.wrap}>
          <table className={classes.table} data-testid="comparison-table">
            <thead>
              <tr>
                {GENERAL.map((col) => {
                  const min = minimized.has(col.key);
                  return (
                    <th
                      key={col.key}
                      rowSpan={3}
                      className={`${classes.clickable} ${min ? classes.minimized : ''}`}
                      title={`${min ? 'Genişlet' : 'Küçült'} ${col.name}`}
                      onClick={() => toggle(col.key)}
                    >
                      {min ? (
                        <Rotated>
                          <i className={`fas ${col.icon}`} />
                        </Rotated>
                      ) : (
                        <>
                          <i
                            className={`fas ${col.icon}`}
                            style={{ marginRight: col.label ? 4 : 0 }}
                          />
                          {col.label}
                        </>
                      )}
                    </th>
                  );
                })}
                <th colSpan={suppliers.length * perSupplier}>Tedarikçi Teklifleri</th>
              </tr>
              <tr>
                {suppliers.map((s) => (
                  <SupplierHeader
                    key={s.id}
                    supplier={s}
                    colSpan={perSupplier}
                    stars={stars}
                    onRecommendAll={() => recommendAll(s.id)}
                  />
                ))}
              </tr>
              <tr>
                {suppliers.map((s) =>
                  columns.map((c) => {
                    const meta = SUPPLIER_HEADER[c];
                    const min = minimized.has(c);
                    const sub = meta.sub(supplierCurrency(s));
                    return (
                      <th
                        key={`${s.id}-${c}`}
                        className={`${classes.clickable} ${min ? classes.minimized : ''}`}
                        title={`${min ? 'Genişlet' : 'Küçült'} ${meta.title}`}
                        onClick={() => toggle(c)}
                      >
                        {min ? (
                          <Rotated>{meta.short}</Rotated>
                        ) : (
                          <>
                            {meta.icon ? (
                              <i className={`fas ${meta.icon}`} style={{ marginRight: 4 }} />
                            ) : null}
                            {meta.label}
                            {sub ? (
                              <>
                                <br />
                                <span className={classes.muted}>{sub}</span>
                              </>
                            ) : null}
                          </>
                        )}
                      </th>
                    );
                  }),
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ItemRow
                  key={item.key}
                  item={item}
                  suppliers={suppliers}
                  offers={offers}
                  recommended={recommendations[item.key] ?? null}
                  columns={columns}
                  minimized={minimized}
                  rates={rates}
                  showNotes={showNotes}
                  stars={stars}
                  mark={rowMarks?.[item.key]}
                  onToggle={toggleItem}
                  onShowFiles={onShowFiles}
                  onShowSpecifications={onShowSpecifications}
                />
              ))}
              {showSummaryRow ? (
                <tr className={classes.summaryRow} data-testid="comparison-summary-row">
                  <td colSpan={GENERAL.length}>
                    <i className="fas fa-calculator" style={{ marginRight: 8 }} />
                    TOPLAM
                  </td>
                  {suppliers.map((s) => {
                    const totals = supplierTotals(s.id, items, offers);
                    const cur = supplierCurrency(s);
                    return columns.map((c) => (
                      <SummaryCell
                        key={`${s.id}-${c}`}
                        column={c}
                        minimized={minimized.has(c)}
                        value={
                          c === 'unitPrice'
                            ? formatMoney(totals.unitPriceTotal, cur)
                            : c === 'originalTotal'
                              ? formatMoney(totals.originalTotal, cur)
                              : c === 'euroTotal'
                                ? formatMoney(
                                    convertCurrency(totals.originalTotal, cur, 'EUR', rates),
                                    'EUR',
                                  )
                                : '-'
                        }
                        sub={
                          c === 'euroTotal'
                            ? 'EUR'
                            : c === 'unitPrice' || c === 'originalTotal'
                              ? cur
                              : null
                        }
                      />
                    ));
                  })}
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
      {summary ? (
        <Card withBorder padding="sm" radius="md" mt="md">
          <Text fw={600} mb="xs">
            <FaIcon icon="fas fa-calculator" style={{ marginRight: 6 }} />
            Özet Bilgiler
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
            <SummaryItem label="Toplam Malzeme Sayısı" value={String(summary.itemCount)} />
            <SummaryItem label="Toplam Miktar" value={summary.totalQuantity} />
            <SummaryItem
              label="Önerilen Tedarikçi Sayısı"
              value={String(summary.recommendedSupplierCount)}
            />
            <SummaryItem
              label="Toplam Tahmini Tutar (EUR)"
              value={formatMoney(summary.totalAmountEUR, 'EUR')}
            />
          </SimpleGrid>
        </Card>
      ) : null}
    </>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={600}>{value}</Text>
    </div>
  );
}

function SupplierHeader({
  supplier,
  colSpan,
  stars,
  onRecommendAll,
}: {
  supplier: ComparisonSupplier;
  colSpan: number;
  stars: boolean;
  onRecommendAll: () => void;
}) {
  return (
    <th
      colSpan={colSpan}
      className={supplier.status === 'blacklisted' ? classes.blacklisted : undefined}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
        <div className={classes.supplierName} title={supplier.name}>
          {supplier.name}
        </div>
        {supplier.status && supplier.status !== 'approved' ? (
          <SupplierStatusBadge status={supplier.status} />
        ) : null}
        {supplier.rating_score !== null && supplier.rating_score !== undefined ? (
          <div>
            <StarRating score={supplier.rating_score} compact />
          </div>
        ) : null}
        <div className={classes.muted}>{supplierCurrency(supplier)}</div>
        {stars ? (
          <Button size="compact-xs" variant="outline" color="yellow" onClick={onRecommendAll}>
            <i className="fas fa-star" style={{ marginRight: 4 }} />
            Hepsi için Öner
          </Button>
        ) : null}
      </div>
    </th>
  );
}

function SummaryCell({
  column,
  minimized,
  value,
  sub,
}: {
  column: ComparisonColumn;
  minimized: boolean;
  value: string;
  sub: string | null;
}) {
  if (minimized) {
    return (
      <td className={classes.minimized}>
        <Rotated>{value}</Rotated>
      </td>
    );
  }
  const muted = column === 'deliveryDays' || column === 'recommendations';
  return (
    <td>
      <div className={muted ? classes.muted : classes.summaryValue}>{value}</div>
      {sub ? <span className={classes.muted}>{sub}</span> : null}
    </td>
  );
}

interface ItemRowProps {
  item: ComparisonItem;
  suppliers: readonly ComparisonSupplier[];
  offers: ComparisonData['offers'];
  recommended: string | null;
  columns: readonly ComparisonColumn[];
  minimized: ReadonlySet<string>;
  rates: CurrencyRates | null;
  showNotes: boolean;
  stars: boolean;
  mark?: RowMark;
  onToggle: (itemKey: string, supplierId: string) => void;
  onShowFiles?: (item: ComparisonItem) => void;
  onShowSpecifications?: (item: ComparisonItem) => void;
}

/** One item row; memoized so a star click re-renders only its row. */
const ItemRow = memo(function ItemRow({
  item,
  suppliers,
  offers,
  recommended,
  columns,
  minimized,
  rates,
  showNotes,
  stars,
  mark,
  onToggle,
  onShowFiles,
  onShowSpecifications,
}: ItemRowProps) {
  const general = (key: GeneralColumn, content: ReactNode, className?: string) =>
    minimized.has(key) ? (
      <td key={key} className={classes.minimized}>
        {key === 'files' ? content : <Rotated>{content}</Rotated>}
      </td>
    ) : (
      <td key={key} className={className}>
        {content}
      </td>
    );

  const specsTitle = [
    item.item_description.trim() ? `Açıklama: ${item.item_description.trim()}` : null,
    item.specifications.trim() ? `Özellikler: ${item.specifications.trim()}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
  const files = Array.isArray(item.files) ? item.files : [];

  const rowClass =
    mark === 'no-offer'
      ? classes.rowNoOffer
      : mark === 'no-recommendation'
        ? classes.rowNoRecommendation
        : undefined;

  return (
    <tr className={rowClass} data-item-key={item.key} data-mark={mark}>
      {general(
        'item',
        <>
          {mark ? (
            <Tooltip
              label={
                mark === 'no-offer'
                  ? 'Bu malzeme için hiçbir tedarikçiden teklif bulunmamaktadır'
                  : 'Bu malzeme için tedarikçi önerisi seçmelisiniz'
              }
            >
              <i
                className="fas fa-exclamation-triangle"
                style={{ color: mark === 'no-offer' ? '#dc3545' : '#e0a800', marginRight: 4 }}
              />
            </Tooltip>
          ) : null}
          <strong>{item.name}</strong>
          <br />
          <span className={classes.muted}>{item.code}</span>
        </>,
        classes.itemCell,
      )}
      {general('job_no', item.job_no || '-')}
      {general('quantity', String(item.quantity))}
      {general('unit', item.unit)}
      {general(
        'specifications',
        specsTitle ? (
          <span
            className={classes.iconButton}
            title={specsTitle}
            role="button"
            aria-label="Teknik Özellikler"
            onClick={() => onShowSpecifications?.(item)}
          >
            <i className="fas fa-comment-dots" style={{ color: '#0dcaf0' }} />
          </span>
        ) : (
          '-'
        ),
      )}
      {general(
        'files',
        files.length > 0 ? (
          <ActionIcon
            variant="subtle"
            size="sm"
            title={`${files.length} dosya`}
            aria-label={`${files.length} dosya`}
            onClick={() => onShowFiles?.(item)}
          >
            <i className="fas fa-paperclip" />
          </ActionIcon>
        ) : (
          '-'
        ),
      )}
      {suppliers.map((s) => {
        const offer = offers[s.id]?.[item.key];
        if (!hasOffer(offer)) {
          return (
            <td key={s.id} colSpan={columns.length} className={classes.noOffer}>
              Teklif yok
            </td>
          );
        }
        const cur = supplierCurrency(s);
        const isRec = recommended === s.id;
        const cls = isRec ? classes.recommended : '';
        return columns.map((c) => {
          const min = minimized.has(c);
          let value: string;
          let sub: string | null = cur;
          if (c === 'unitPrice') value = formatMoney(offer.unitPrice, cur);
          else if (c === 'originalTotal') value = formatMoney(offer.totalPrice, cur);
          else if (c === 'euroTotal') {
            value = formatMoney(convertCurrency(offer.totalPrice, cur, 'EUR', rates), 'EUR');
            sub = 'EUR';
          } else if (c === 'deliveryDays') {
            value = offer.deliveryDays ? String(offer.deliveryDays) : '-';
            sub = 'gün';
          } else {
            return (
              <td key={`${s.id}-${c}`} className={`${cls} ${min ? classes.minimized : ''}`}>
                <ActionIcon
                  variant={isRec ? 'filled' : 'outline'}
                  color="yellow"
                  radius="xl"
                  size={min ? 'sm' : 'md'}
                  disabled={!stars}
                  aria-label={`${s.name} öner`}
                  aria-pressed={isRec}
                  onClick={() => onToggle(item.key, s.id)}
                >
                  <i className="fas fa-star" />
                </ActionIcon>
              </td>
            );
          }
          if (min) {
            return (
              <td key={`${s.id}-${c}`} className={`${cls} ${classes.minimized}`}>
                <Rotated>{value}</Rotated>
              </td>
            );
          }
          return (
            <td key={`${s.id}-${c}`} className={cls} data-col={c} data-supplier={s.id}>
              <div className={classes.bold}>{value}</div>
              <span className={classes.muted}>{sub}</span>
              {c === 'deliveryDays' && showNotes && offer.notes ? (
                <>
                  <br />
                  <span className={classes.muted}>{offer.notes}</span>
                </>
              ) : null}
            </td>
          );
        });
      })}
    </tr>
  );
});
