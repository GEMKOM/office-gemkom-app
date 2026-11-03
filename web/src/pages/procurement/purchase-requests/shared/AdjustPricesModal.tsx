import { Badge, Button, Group, Modal, NumberInput } from '@mantine/core';
import { useState } from 'react';
import {
  adjustOfferPrices,
  type AdjustOffersResponse,
  type PurchaseRequestDetail,
} from '@/api/procurement/purchaseRequests';
import { formatNumber } from '@/lib/format';
import { FaIcon, ModalFooter, ModalHeader, modalClassNames, notify } from '@/ui';
import classes from './AdjustPricesModal.module.css';
import { CURRENCY_SYMBOLS } from './comparison';

// Port of components/adjust-prices-modal: per item offer a new unit price
// inside the backend's ±10% band, or one percent applied to every row.

const toNum = (n: unknown) => (typeof n === 'number' ? n : parseFloat(String(n)));
/** Machine form of a price ("2408.74"): the input's value and the save payload. */
const fmt = (n: unknown) => {
  const v = toNum(n);
  return Number.isFinite(v) ? v.toFixed(2) : '-';
};
/** Display form with Turkish grouping: "2.408,74". */
const show = (n: unknown) => {
  const v = toNum(n);
  return Number.isFinite(v) ? formatNumber(v, 2) : '-';
};
const num = (v: unknown) => (v === null || v === undefined || v === '' ? NaN : Number(v));
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

interface Row {
  offerId: number;
  min: number;
  max: number;
  original: number;
  current: string;
}

/** Whether the request has any item offers to adjust (legacy guard). */
export function hasAdjustableOffers(request: PurchaseRequestDetail): boolean {
  return (request.offers ?? []).some((o) => (o.item_offers ?? []).length > 0);
}

export function AdjustPricesModal({
  request,
  onClose,
  onSaved,
}: {
  request: PurchaseRequestDetail;
  onClose: () => void;
  onSaved: (resp: AdjustOffersResponse) => void;
}) {
  const rows: Row[] = [];
  for (const offer of request.offers ?? []) {
    for (const io of offer.item_offers ?? []) {
      if (io.unit_price === null || io.unit_price === undefined) continue;
      rows.push({
        offerId: io.id,
        min: num(io.price_min),
        max: num(io.price_max),
        original: num(io.original_unit_price ?? io.unit_price),
        current: fmt(io.unit_price),
      });
    }
  }
  const [values, setValues] = useState<Record<number, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.offerId, r.current])),
  );
  const [percent, setPercent] = useState<string | number>('');
  const [saving, setSaving] = useState(false);
  const [showInvalid, setShowInvalid] = useState<ReadonlySet<number>>(new Set());

  const isInvalid = (r: Row) => {
    const v = parseFloat(values[r.offerId] ?? '');
    return !Number.isFinite(v) || v < r.min || v > r.max;
  };

  const applyPercent = () => {
    const pct = parseFloat(String(percent));
    if (!Number.isFinite(pct)) {
      notify.warning('Geçerli bir yüzde girin.');
      return;
    }
    if (Math.abs(pct) > 10) {
      notify.warning('Yüzde en fazla ±%10 olabilir.');
      return;
    }
    setValues(
      Object.fromEntries(
        rows.map((r) => [r.offerId, clamp(r.original * (1 + pct / 100), r.min, r.max).toFixed(2)]),
      ),
    );
    setShowInvalid(new Set());
  };

  const save = async () => {
    const items: { item_offer_id: number; unit_price: string }[] = [];
    const invalid = new Set<number>();
    for (const r of rows) {
      if (isInvalid(r)) {
        invalid.add(r.offerId);
        continue;
      }
      const v = parseFloat(values[r.offerId]!);
      if (v.toFixed(2) !== parseFloat(r.current).toFixed(2)) {
        items.push({ item_offer_id: r.offerId, unit_price: v.toFixed(2) });
      }
    }
    if (invalid.size) {
      setShowInvalid(invalid);
      notify.error('Bazı fiyatlar izin verilen aralığın dışında.');
      return;
    }
    if (!items.length) {
      notify.info('Değişiklik yapılmadı.');
      return;
    }
    setSaving(true);
    try {
      const resp = await adjustOfferPrices(request.id, { items });
      notify.success(resp?.detail || `${items.length} teklif güncellendi.`);
      onSaved(resp);
      onClose();
    } catch (error) {
      notify.error((error as Error).message || 'Teklif fiyatları güncellenemedi.');
    } finally {
      setSaving(false);
    }
  };

  const itemLabel = (itemId: number) => {
    const ri = (request.request_items ?? []).find((i) => i.id === itemId);
    if (!ri) return `#${itemId}`;
    if (ri.item?.code || ri.item?.name) return `${ri.item.code || ''} ${ri.item.name || ''}`.trim();
    return ri.item_description || `#${itemId}`;
  };

  return (
    <Modal
      opened
      onClose={onClose}
      size="min(1120px, 96vw)"
      withCloseButton={false}
      padding={0}
      classNames={{
        ...modalClassNames,
        content: classes.content,
        body: `${modalClassNames.body} ${classes.body}`,
      }}
    >
      <ModalHeader
        title="Teklif Fiyatlarını Güncelle"
        subtitle={request.request_number}
        icon="fas fa-tags"
      />
      <div className={classes.top}>
        <p className={classes.note}>
          <FaIcon icon="fas fa-info-circle" /> Fiyatlar yalnızca orijinal teklifin{' '}
          <strong>±%10</strong> aralığında değiştirilebilir. Onaylanmış taleplerde değişiklik ilgili
          satın alma siparişlerine de yansır.
        </p>
        <div className={classes.percent}>
          <span className={classes.percentLabel}>Tüm satırlara yüzde uygula</span>
          <Group gap="xs" wrap="nowrap">
            <NumberInput
              w={140}
              size="xs"
              leftSection="%"
              aria-label="Yüzde"
              placeholder="örn. 6,5"
              step={0.1}
              min={-10}
              max={10}
              decimalSeparator=","
              value={percent}
              onChange={setPercent}
            />
            <Button size="xs" variant="default" onClick={applyPercent}>
              Uygula
            </Button>
          </Group>
          <p className={classes.percentHint}>Orijinal fiyat üzerinden hesaplanır.</p>
        </div>
      </div>
      <div className={classes.scroll}>
        {(request.offers ?? []).map((offer, oi) => {
          const ios = (offer.item_offers ?? []).filter(
            (io) => io.unit_price !== null && io.unit_price !== undefined,
          );
          if (!ios.length) return null;
          const symbol = CURRENCY_SYMBOLS[offer.currency] ?? offer.currency ?? '';
          return (
            <section key={offer.id ?? oi} className={classes.supplier}>
              <div className={classes.supplierHead}>
                <FaIcon icon="fas fa-truck" />
                <span>{offer.supplier?.name || 'Tedarikçi'}</span>
                <span className={classes.supplierCurrency}>
                  {offer.currency ? `${symbol} ${offer.currency}`.trim() : ''}
                </span>
              </div>
              <table className={classes.table}>
                <thead>
                  <tr>
                    <th>Malzeme</th>
                    <th className={`${classes.colQty} ${classes.num}`}>Miktar</th>
                    <th className={`${classes.colMoney} ${classes.num}`}>Orijinal</th>
                    <th className={`${classes.colMoney} ${classes.num}`}>Güncel</th>
                    <th className={`${classes.colInput} ${classes.num}`}>Yeni Birim Fiyat</th>
                    <th className={`${classes.colRange} ${classes.num}`}>İzin Verilen Aralık</th>
                  </tr>
                </thead>
                <tbody>
                  {ios.map((io) => {
                    const ri = (request.request_items ?? []).find(
                      (i) => i.id === io.purchase_request_item,
                    );
                    const row = rows.find((r) => r.offerId === io.id)!;
                    const invalid =
                      showInvalid.has(io.id) ||
                      ((values[io.id] ?? '') !== row.current && isInvalid(row));
                    return (
                      <tr key={io.id} data-offer-id={io.id}>
                        <td className={classes.itemCell}>
                          {itemLabel(io.purchase_request_item)}
                          <span className={classes.badges}>
                            {io.is_recommended ? (
                              <Badge size="xs" title="Önerilen (siparişe dönüşecek)">
                                <i className="fas fa-star" />
                              </Badge>
                            ) : null}
                            {io.is_price_adjusted ? (
                              <Badge
                                size="xs"
                                color="gray"
                                title={`Daha önce güncellendi${io.price_adjusted_by_username ? ` - ${io.price_adjusted_by_username}` : ''}`}
                              >
                                düzenlendi
                              </Badge>
                            ) : null}
                          </span>
                        </td>
                        <td className={classes.num}>
                          {ri ? formatNumber(parseFloat(String(ri.quantity || 0))) : '-'}
                        </td>
                        <td className={`${classes.num} ${classes.muted}`}>
                          {show(io.original_unit_price ?? io.unit_price)}
                        </td>
                        <td className={classes.num}>{show(io.unit_price)}</td>
                        <td>
                          <NumberInput
                            size="xs"
                            className={classes.input}
                            aria-label="Yeni Birim Fiyat"
                            step={0.01}
                            decimalScale={2}
                            decimalSeparator=","
                            hideControls
                            rightSection={symbol}
                            rightSectionPointerEvents="none"
                            value={values[io.id] ?? ''}
                            error={invalid}
                            onChange={(v) => {
                              setValues((prev) => ({ ...prev, [io.id]: String(v) }));
                              setShowInvalid((prev) => {
                                if (!prev.has(io.id)) return prev;
                                const next = new Set(prev);
                                next.delete(io.id);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td className={`${classes.num} ${classes.muted}`}>
                          {show(io.price_min)} – {show(io.price_max)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
      <ModalFooter>
        <Button variant="default" onClick={onClose}>
          Vazgeç
        </Button>
        <Button
          leftSection={<FaIcon icon="fas fa-save" />}
          loading={saving}
          onClick={() => void save()}
        >
          Kaydet
        </Button>
      </ModalFooter>
    </Modal>
  );
}
