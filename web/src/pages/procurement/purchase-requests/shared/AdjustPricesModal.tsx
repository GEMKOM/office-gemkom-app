import { Alert, Badge, Button, Group, Modal, NumberInput, Stack, Table, Text } from '@mantine/core';
import { useState } from 'react';
import {
  adjustOfferPrices,
  type AdjustOffersResponse,
  type PurchaseRequestDetail,
} from '@/api/procurement/purchaseRequests';
import { FaIcon, ModalBody, ModalFooter, ModalHeader, modalClassNames, notify } from '@/ui';

// Port of components/adjust-prices-modal: per item offer a new unit price
// inside the backend's ±10% band, or one percent applied to every row.

const fmt = (n: unknown) => {
  const v = typeof n === 'number' ? n : parseFloat(String(n));
  return Number.isFinite(v) ? v.toFixed(2) : '-';
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
      size="lg"
      withCloseButton={false}
      classNames={modalClassNames}
      padding={0}
    >
      <ModalHeader title="Teklif Fiyatlarını Güncelle" icon="fas fa-tags" />
      <ModalBody>
        <Stack gap="md">
          <Alert color="blue" icon={<FaIcon icon="fas fa-info-circle" />} p="xs">
            Fiyatlar yalnızca orijinal teklifin <strong>±%10</strong> aralığında değiştirilebilir.
            Onaylanmış taleplerde değişiklik ilgili satın alma siparişlerine de yansır.
          </Alert>
          <div>
            <Text size="sm" fw={500}>
              Tüm satırlara yüzde uygula
            </Text>
            <Group gap="xs" mt={4}>
              <NumberInput
                w={160}
                leftSection="%"
                aria-label="Yüzde"
                placeholder="örn. 6.5"
                step={0.1}
                min={-10}
                max={10}
                decimalSeparator="."
                value={percent}
                onChange={setPercent}
              />
              <Button variant="default" onClick={applyPercent}>
                Uygula
              </Button>
            </Group>
            <Text size="xs" c="dimmed" mt={4}>
              Orijinal fiyat üzerinden hesaplanır.
            </Text>
          </div>
          {(request.offers ?? []).map((offer, oi) => {
            const ios = (offer.item_offers ?? []).filter(
              (io) => io.unit_price !== null && io.unit_price !== undefined,
            );
            if (!ios.length) return null;
            return (
              <div
                key={offer.id ?? oi}
                style={{ border: '1px solid var(--gk-line)', borderRadius: 8, padding: 8 }}
              >
                <Group gap="xs" mb="xs">
                  <FaIcon icon="fas fa-truck" />
                  <Text fw={600}>{offer.supplier?.name || 'Tedarikçi'}</Text>
                  <Text size="sm" c="dimmed">
                    {offer.currency || ''}
                  </Text>
                </Group>
                <Table withTableBorder={false} verticalSpacing={4} fz="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Malzeme</Table.Th>
                      <Table.Th ta="right">Miktar</Table.Th>
                      <Table.Th ta="right">Orijinal</Table.Th>
                      <Table.Th ta="right">Güncel</Table.Th>
                      <Table.Th ta="right" miw={150}>
                        Yeni Birim Fiyat
                      </Table.Th>
                      <Table.Th>İzin Verilen Aralık</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {ios.map((io) => {
                      const ri = (request.request_items ?? []).find(
                        (i) => i.id === io.purchase_request_item,
                      );
                      const row = rows.find((r) => r.offerId === io.id)!;
                      const invalid =
                        showInvalid.has(io.id) ||
                        ((values[io.id] ?? '') !== row.current && isInvalid(row));
                      return (
                        <Table.Tr key={io.id} data-offer-id={io.id}>
                          <Table.Td>
                            {itemLabel(io.purchase_request_item)}
                            {io.is_recommended ? (
                              <Badge ml={4} size="xs" title="Önerilen (siparişe dönüşecek)">
                                <i className="fas fa-star" />
                              </Badge>
                            ) : null}
                            {io.is_price_adjusted ? (
                              <Badge
                                ml={4}
                                size="xs"
                                color="gray"
                                title={`Daha önce güncellendi${io.price_adjusted_by_username ? ` - ${io.price_adjusted_by_username}` : ''}`}
                              >
                                düzenlendi
                              </Badge>
                            ) : null}
                          </Table.Td>
                          <Table.Td ta="right">
                            {ri ? parseFloat(String(ri.quantity || 0)) : '-'}
                          </Table.Td>
                          <Table.Td ta="right">
                            {fmt(io.original_unit_price ?? io.unit_price)}
                          </Table.Td>
                          <Table.Td ta="right">{fmt(io.unit_price)}</Table.Td>
                          <Table.Td>
                            <NumberInput
                              size="xs"
                              aria-label="Yeni Birim Fiyat"
                              step={0.01}
                              decimalSeparator="."
                              hideControls
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
                          </Table.Td>
                          <Table.Td>
                            {fmt(io.price_min)} – {fmt(io.price_max)}
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </div>
            );
          })}
        </Stack>
      </ModalBody>
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
