import {
  Badge,
  Button,
  Group,
  NumberInput,
  Select,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  offerErrorMessage,
  offerItemsQueryOptions,
  offerQueryOptions,
  offerStatusLabel,
  priceHistoryQueryOptions,
  setOfferPrices,
  useInvalidateOffers,
  type OfferDetail,
  type OfferItem,
  type PriceRevision,
  type PricingMode,
} from '@/api/sales/offers';
import { confirm, FaIcon, notify } from '@/ui';
import { useOffers } from '../context';
import { NodeHistoryModal } from '../dialogs/NodeHistoryModal';
import { PastePricesModal } from '../dialogs/PasteModals';
import {
  APPROVAL_CANCELLING_STATUSES,
  canSubmitApproval,
  isClosed,
  isPriceEditable,
  itemNodeId,
  itemSubtotal,
  itemTitle,
  itemWeightTotal,
  money,
  priceEditableItems,
  pricingTotals,
  seedPriceEdits,
  setPricesPayload,
  type PastedPrice,
  type PriceEdit,
} from '../logic';
import { TabFooter, type TabProps } from '../OfferModal';
import { EmptyState, ErrorText, LoadingText } from '../parts';
import css from '../OffersPage.module.css';

const MODE_INFO =
  'Ana kalem modu: sadece ana kalemlerde birim fiyat girilebilir.\nAlt kalem modu: sadece alt kalemlerde birim fiyat girilebilir; üst kalemler otomatik toplanır.';

/**
 * Legacy Fiyatlandırma (pricing v3): prices, weights, periods and notes are
 * edited here and sent in one POST set-prices/. The editor starts again from
 * the server whenever the data changes and nothing is waiting to be saved.
 */
export function PricingTab({ offer: initial }: TabProps) {
  // Fresh offer and items together (legacy reloaded both on every visit).
  const offerQ = useQuery(offerQueryOptions(initial.id));
  const items = useQuery(offerItemsQueryOptions(initial.id));
  const history = useQuery(priceHistoryQueryOptions(initial.id));
  const [dirty, setDirty] = useState(false);
  const [frozen, setFrozen] = useState(0);
  const seedKey = dirty ? frozen : items.dataUpdatedAt + offerQ.dataUpdatedAt;
  if (!dirty && frozen !== seedKey) setFrozen(seedKey);

  if (items.isPending) return <LoadingText />;
  if (items.isError || offerQ.isError)
    return <ErrorText>Fiyatlandırma verileri yüklenemedi.</ErrorText>;

  return (
    <PricingEditor
      key={seedKey}
      offer={offerQ.data ?? initial}
      items={items.data}
      // Legacy shows the tab without a history when that request fails.
      revisions={history.data ?? []}
      onDirtyChange={setDirty}
    />
  );
}

function RevisionTable({ revisions }: { revisions: PriceRevision[] }) {
  const sorted = revisions
    .slice()
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  if (!sorted.length) return null;
  return (
    <div className={css.block}>
      <Text fw={600} mb={6}>
        <FaIcon icon="fas fa-history" /> Fiyat Geçmişi
      </Text>
      <Table withTableBorder withColumnBorders fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={190}>Tarih</Table.Th>
            <Table.Th>Revizyon</Table.Th>
            <Table.Th w={180} ta="right">
              Tutar
            </Table.Th>
            <Table.Th w={180}>Oluşturan</Table.Th>
            <Table.Th>Not</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sorted.map((r, i) => {
            const at = r.created_at ? new Date(r.created_at) : null;
            return (
              <Table.Tr key={r.id ?? i}>
                <Table.Td c="dimmed">
                  {at && !Number.isNaN(at.getTime()) ? at.toLocaleString('tr-TR') : '-'}
                </Table.Td>
                <Table.Td>
                  {r.revision_type_display || r.revision_type || '-'}{' '}
                  {r.approval_round != null ? (
                    <Text span size="xs" c="dimmed">
                      R{r.approval_round}
                    </Text>
                  ) : null}
                  {r.is_current ? (
                    <Badge color="green" size="sm" ml={6}>
                      aktif
                    </Badge>
                  ) : null}
                </Table.Td>
                <Table.Td ta="right" fw={600}>
                  {r.amount != null && r.amount !== '' ? String(r.amount) : '-'}{' '}
                  {r.currency_display || r.currency || ''}
                </Table.Td>
                <Table.Td>{r.created_by_name || '-'}</Table.Td>
                <Table.Td c="dimmed">{r.notes || '-'}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </div>
  );
}

function PricingEditor({
  offer,
  items,
  revisions,
  onDirtyChange,
}: {
  offer: OfferDetail;
  items: OfferItem[];
  revisions: PriceRevision[];
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { openDialog } = useOffers();
  const invalidate = useInvalidateOffers();
  const [mode, setMode] = useState<PricingMode>(offer.pricing_mode === 'leaf' ? 'leaf' : 'flat');
  const [edits, setEdits] = useState<Record<number, PriceEdit>>(() => seedPriceEdits(items));
  const [shipping, setShipping] = useState(
    () => Number.parseFloat(String(offer.shipping_price ?? '')) || 0,
  );
  const [dirty, setDirtyState] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [historyOf, setHistoryOf] = useState<OfferItem | null>(null);
  const closed = isClosed(offer.status);
  const currency = offer.current_price?.currency || offer.currency || 'EUR';
  const m0 = (n: number | null) => (n === null ? '—' : money(n, currency, 0));
  const m2 = (n: number | null) => (n === null ? '—' : money(n, currency, 2));

  const setDirty = (value: boolean) => {
    setDirtyState(value);
    onDirtyChange(value);
  };

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // A tab or modal closed with unsaved edits must not keep the page's editor frozen.
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const totals = useMemo(
    () => pricingTotals(items, mode, edits, shipping),
    [items, mode, edits, shipping],
  );

  const edit = (id: number, patch: Partial<PriceEdit>) => {
    setEdits((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev));
    setDirty(true);
  };

  const changeMode = async (next: PricingMode) => {
    if (next === mode) return;
    if (Object.values(edits).some((e) => e.unit_price !== null)) {
      const ok = await confirm({
        title: 'Fiyatlandırma Modu',
        icon: 'fas fa-exclamation-triangle',
        message: 'Mod değişikliği girilen fiyatları temizleyecek. Devam edilsin mi?',
        confirmLabel: 'Evet',
        cancelLabel: 'İptal',
        danger: true,
      });
      if (!ok) return;
    }
    setMode(next);
    setEdits((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([id, e]) => [id, { ...e, unit_price: null, weight_kg: null }]),
      ),
    );
    setDirty(true);
  };

  const applyPasted = (prices: PastedPrice[]) => {
    const targets = priceEditableItems(items, mode);
    setEdits((prev) => {
      const next = { ...prev };
      prices.forEach((p, i) => {
        const target = targets[i];
        const current = target ? next[target.id] : undefined;
        if (!target || !current) return;
        next[target.id] = {
          ...current,
          ...(p.unit_price !== null ? { unit_price: p.unit_price } : {}),
          ...(p.weight_kg !== null ? { weight_kg: p.weight_kg } : {}),
          ...(p.delivery_period !== null ? { delivery_period: p.delivery_period } : {}),
          ...(p.notes !== null ? { notes: p.notes } : {}),
        };
      });
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    // A save on a submitted or approved offer cancels its approval: never without changes, and only after a confirm.
    if (!dirty) {
      notify.info('Kaydedilecek değişiklik yok.');
      return;
    }
    if (APPROVAL_CANCELLING_STATUSES.includes(offer.status)) {
      const ok = await confirm({
        title: 'Fiyatları Kaydet',
        icon: 'fas fa-exclamation-triangle',
        message:
          'Fiyatları kaydetmek teklifin mevcut onayını iptal eder; teklifi tekrar onaya göndermeniz gerekir. Devam etmek istiyor musunuz?',
        confirmLabel: 'Evet',
        cancelLabel: 'İptal',
        danger: true,
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      await setOfferPrices(offer.id, setPricesPayload(items, mode, edits, shipping));
      notify.success('Fiyatlar kaydedildi');
      setDirty(false);
      await invalidate();
    } catch (error) {
      notify.error(offerErrorMessage(error, 'Fiyatlar kaydedilemedi'));
    } finally {
      setSaving(false);
    }
  };

  const submitApproval = () => {
    if (dirty) {
      notify.warning('Kaydedilmemiş değişiklikler var. Önce "Fiyatları Kaydet" ile kaydedin.');
      return;
    }
    openDialog({ kind: 'submit-approval', offerId: offer.id });
  };

  const rows: { item: OfferItem; depth: number }[] = [];
  const walk = (nodes: OfferItem[], depth: number) => {
    for (const node of nodes) {
      rows.push({ item: node, depth });
      if (node.children?.length) walk(node.children, depth + 1);
    }
  };
  walk(items, 0);

  return (
    <div>
      <Group justify="space-between" mb="md" wrap="wrap">
        <Group gap="lg">
          <Text fw={600}>
            <FaIcon icon="fas fa-tag" /> Fiyatlandırma
          </Text>
          <Text size="sm" c="dimmed">
            Teklif: <strong>{offer.offer_no || offer.id || '—'}</strong>
          </Text>
          <Text size="sm" c="dimmed">
            Durum: <strong>{offerStatusLabel(offer) || '-'}</strong>
          </Text>
        </Group>
        <Group gap="xs">
          <Text size="sm" c="dimmed" component="label" htmlFor="pricing-mode-select">
            Mod
          </Text>
          <Select
            id="pricing-mode-select"
            size="xs"
            w={160}
            allowDeselect={false}
            data={[
              { value: 'flat', label: 'Ana kalem' },
              { value: 'leaf', label: 'Alt kalem' },
            ]}
            value={mode}
            onChange={(value) => value && void changeMode(value as PricingMode)}
          />
          <Tooltip label={<span className={css.preWrap}>{MODE_INFO}</span>} multiline w={340}>
            <span className={css.modeInfo} aria-label="Fiyatlandırma modları">
              <FaIcon icon="fas fa-info-circle" />
            </span>
          </Tooltip>
          {dirty ? (
            <Badge
              color="yellow"
              variant="light"
              leftSection={<FaIcon icon="fas fa-exclamation-triangle" />}
            >
              Kaydedilmedi
            </Badge>
          ) : null}
          {!closed && items.length > 0 ? (
            <Button
              size="xs"
              variant="light"
              title="Excel'den fiyat yapıştır"
              leftSection={<FaIcon icon="fas fa-paste" />}
              onClick={() => {
                if (!priceEditableItems(items, mode).length) {
                  notify.warning('Fiyat girilebilecek kalem bulunamadı. Önce modu kontrol edin.');
                  return;
                }
                setPasting(true);
              }}
            >
              Fiyat Yapıştır
            </Button>
          ) : null}
        </Group>
      </Group>

      <RevisionTable revisions={revisions} />

      {!items.length ? (
        <EmptyState>Henüz kalem eklenmemiş. Önce kalemler sekmesinden kalem ekleyin.</EmptyState>
      ) : (
        <Table.ScrollContainer minWidth={1100}>
          <Table
            withTableBorder
            withColumnBorders
            verticalSpacing={4}
            fz="sm"
            className={css.pricingTable}
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th w="44%">Kalem</Table.Th>
                <Table.Th w={96} ta="center">
                  Adet
                </Table.Th>
                <Table.Th w={160}>Birim Fiyat (€/adet)</Table.Th>
                <Table.Th w={140}>Birim Ağırlık (kg)</Table.Th>
                <Table.Th w={90} ta="right">
                  Kg Fiyatı
                </Table.Th>
                <Table.Th w={200} ta="right">
                  Ara Toplam
                </Table.Th>
                <Table.Th w={160}>Termin</Table.Th>
                <Table.Th w={260}>Not</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map(({ item, depth }) => {
                const e = edits[item.id];
                const editable = isPriceEditable(item, mode);
                const rolled = mode === 'leaf' && Boolean(item.children?.length);
                const subtotal = itemSubtotal(item, mode, edits);
                const weight = itemWeightTotal(item, mode, edits);
                const qty = e?.quantity ?? 1;
                const kg =
                  subtotal !== null && weight !== null && weight > 0 ? subtotal / weight : null;
                const nodeId = itemNodeId(item);
                return (
                  <Table.Tr key={item.id} data-item-id={item.id}>
                    <Table.Td style={{ paddingLeft: depth * 20 + 8 }}>
                      {depth > 0 ? <span className={css.treePrefix}>└─</span> : null}
                      {itemTitle(item)}
                      {!item.template_node ? (
                        <Badge variant="outline" color="gray" size="sm" ml={8}>
                          custom
                        </Badge>
                      ) : null}
                      {nodeId !== null ? (
                        <Button
                          size="compact-xs"
                          variant="default"
                          ml={8}
                          title="Bu kalemin geçmiş iş emirlerini görüntüle"
                          leftSection={<FaIcon icon="fas fa-clock-rotate-left" />}
                          onClick={() => setHistoryOf(item)}
                        >
                          Geçmiş
                        </Button>
                      ) : null}
                    </Table.Td>
                    <Table.Td ta="center">{qty}</Table.Td>
                    <Table.Td>
                      {editable ? (
                        <NumberInput
                          size="xs"
                          min={0}
                          step={0.01}
                          decimalSeparator=","
                          hideControls
                          aria-label="Birim fiyat"
                          placeholder="—"
                          value={e?.unit_price ?? ''}
                          onChange={(v) =>
                            edit(item.id, { unit_price: v === '' ? null : Number(v) })
                          }
                        />
                      ) : (
                        <span className={css.locked} data-rollup={rolled || undefined}>
                          {rolled && subtotal !== null && qty > 0 ? m0(subtotal / qty) : '—'}
                        </span>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {editable ? (
                        <NumberInput
                          size="xs"
                          min={0}
                          step={0.01}
                          decimalSeparator=","
                          hideControls
                          aria-label="Birim ağırlık"
                          placeholder="—"
                          value={e?.weight_kg ?? ''}
                          onChange={(v) =>
                            edit(item.id, { weight_kg: v === '' ? null : Number(v) })
                          }
                        />
                      ) : (
                        <span className={css.locked} data-rollup={rolled || undefined}>
                          {rolled && weight !== null && qty > 0
                            ? (weight / qty).toLocaleString('tr-TR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })
                            : '—'}
                        </span>
                      )}
                    </Table.Td>
                    <Table.Td ta="right">{m2(kg)}</Table.Td>
                    <Table.Td ta="right">{m0(subtotal)}</Table.Td>
                    <Table.Td>
                      {editable ? (
                        <TextInput
                          size="xs"
                          aria-label="Termin"
                          placeholder="Örn. 6 ay"
                          value={e?.delivery_period ?? ''}
                          onChange={(ev) =>
                            edit(item.id, { delivery_period: ev.currentTarget.value })
                          }
                        />
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      {editable ? (
                        <TextInput
                          size="xs"
                          aria-label="Not"
                          placeholder="Not"
                          value={e?.notes ?? ''}
                          onChange={(ev) => edit(item.id, { notes: ev.currentTarget.value })}
                        />
                      ) : e?.notes ? (
                        <Text size="xs" c="dimmed">
                          {e.notes}
                        </Text>
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <div className={css.totals}>
        <Group justify="flex-end" gap="xs" mb="xs">
          <Text size="sm" c="dimmed" component="label" htmlFor="pricing-shipping-input">
            Nakliye
          </Text>
          <NumberInput
            id="pricing-shipping-input"
            size="xs"
            w={160}
            min={0}
            step={0.01}
            decimalSeparator=","
            hideControls
            placeholder="0.00"
            value={shipping || ''}
            onChange={(v) => {
              const n = typeof v === 'number' ? v : Number.parseFloat(v);
              setShipping(Number.isFinite(n) && n >= 0 ? n : 0);
              setDirty(true);
            }}
          />
        </Group>
        <div className={css.bill}>
          <div className={css.billRow}>
            <span>Kalemler</span>
            <strong data-testid="pricing-items-total">{m0(totals.itemsTotal)}</strong>
          </div>
          <div className={css.billRow}>
            <span>Toplam Ağırlık</span>
            <strong>
              {totals.weight > 0
                ? `${totals.weight.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`
                : '—'}
            </strong>
          </div>
          <div className={css.billRow}>
            <span>Ortalama Kg Fiyatı</span>
            <strong>{m2(totals.avgKg)}</strong>
          </div>
          <div className={css.billRow}>
            <span>Nakliye</span>
            <strong>{m0(totals.shipping)}</strong>
          </div>
          <div className={css.billRow} data-grand>
            <span>Genel Toplam</span>
            <strong data-testid="pricing-grand-total">{m0(totals.grand)}</strong>
          </div>
        </div>
      </div>

      {pasting ? (
        <PastePricesModal
          items={priceEditableItems(items, mode)}
          onApply={applyPasted}
          onClose={() => setPasting(false)}
        />
      ) : null}
      {historyOf ? (
        <NodeHistoryModal item={historyOf} offerId={offer.id} onClose={() => setHistoryOf(null)} />
      ) : null}

      <TabFooter>
        {!closed ? (
          <Button
            leftSection={<FaIcon icon="fas fa-save" />}
            loading={saving}
            onClick={() => void save()}
          >
            Fiyatları Kaydet
          </Button>
        ) : null}
        {canSubmitApproval(offer) ? (
          <Button color="red" leftSection={<FaIcon icon="fas fa-gavel" />} onClick={submitApproval}>
            Onaya Gönder
          </Button>
        ) : null}
      </TabFooter>
    </div>
  );
}
