import { Button, Grid, Modal, NumberInput, Select, Table, Textarea } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  OFFER_CURRENCY_OPTIONS,
  offerErrorMessage,
  offerItemsQueryOptions,
  recordDecision,
  submitApproval,
  useInvalidateOffers,
  type DecisionPayload,
} from '@/api/sales/offers';
import {
  FaIcon,
  FormModal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  modalClassNames,
  ModalSection,
  notify,
} from '@/ui';
import { useOffers } from '../context';
import { flattenItems, itemTitle, parseNum, tr2 } from '../logic';
import { EmptyState, ErrorText, LoadingText } from '../parts';

/** Legacy showSubmitApprovalConfirm: an optional note, then submit-approval/. */
export function SubmitApprovalModal({
  offerId,
  onClose,
}: {
  offerId: number;
  onClose: () => void;
}) {
  const invalidate = useInvalidateOffers();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <FormModal
      opened
      onClose={onClose}
      title="Onaya Gönder"
      icon="fas fa-gavel"
      submitLabel="Gönder"
      submitting={busy}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await submitApproval(offerId, notes);
          notify.success('Onaya gönderildi');
          await invalidate();
        } catch (error) {
          notify.error(offerErrorMessage(error, 'Onaya gönderilirken hata oluştu'));
        } finally {
          setBusy(false);
          onClose();
        }
      }}
    >
      <ModalSection title="Not">
        <Textarea
          label="Not"
          placeholder="Örn. Initial pricing based on Q1 material costs"
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          data-autofocus
        />
      </ModalSection>
    </FormModal>
  );
}

/** Legacy showDecisionModal (list "Karar Ver"): the priced items, then Onayla or Reddet. */
export function DecisionOverviewModal({
  offerId,
  onClose,
}: {
  offerId: number;
  onClose: () => void;
}) {
  const { openDialog } = useOffers();
  const items = useQuery(offerItemsQueryOptions(offerId));
  const flat = flattenItems(items.data ?? []);
  const rows = flat.map((item) => {
    const unit = parseNum(item.unit_price) ?? 0;
    const weight = parseNum(item.weight_kg) ?? 0;
    const qty = Number(item.quantity) || 1;
    const subtotal = parseNum(item.subtotal) ?? unit * qty;
    // Unit price per kg of one piece (legacy).
    return { item, unit, weight, qty, subtotal, kg: weight > 0 ? unit / weight : null };
  });
  const totalPrice = rows.reduce((sum, r) => sum + r.subtotal, 0);
  const totalWeight = rows.reduce((sum, r) => sum + r.weight * r.qty, 0);
  const avgKg = totalWeight > 0 ? totalPrice / totalWeight : null;
  const decide = (kind: 'approve' | 'reject') => {
    onClose();
    openDialog({ kind, offerId });
  };

  return (
    <Modal opened onClose={onClose} size="xl" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader title="Onay Kararı" icon="fas fa-check" />
      <ModalBody>
        <ModalSection title="Kalemler (Fiyatlandırma Özeti)" icon="fas fa-tag">
          {items.isPending ? (
            <LoadingText>Kalemler yükleniyor...</LoadingText>
          ) : items.isError ? (
            <ErrorText>Kalemler yüklenemedi.</ErrorText>
          ) : !rows.length ? (
            <EmptyState>
              Henüz kalem eklenmemiş. Önce kalemler sekmesinden kalem ekleyin.
            </EmptyState>
          ) : (
            <Table.ScrollContainer minWidth={800}>
              <Table withTableBorder withColumnBorders fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w="40%">Kalem</Table.Th>
                    <Table.Th ta="center">Adet</Table.Th>
                    <Table.Th ta="right">Birim Fiyat (€)</Table.Th>
                    <Table.Th ta="right">Ağırlık (kg)</Table.Th>
                    <Table.Th>Termin Süresi</Table.Th>
                    <Table.Th ta="right">Kg Fiyatı (€/kg)</Table.Th>
                    <Table.Th ta="right">Ara Toplam (€)</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((r) => (
                    <Table.Tr key={r.item.id}>
                      <Table.Td>{itemTitle(r.item)}</Table.Td>
                      <Table.Td ta="center">{r.qty}</Table.Td>
                      <Table.Td ta="right">{r.unit ? tr2(r.unit) : '-'}</Table.Td>
                      <Table.Td ta="right">{r.weight ? tr2(r.weight) : '-'}</Table.Td>
                      <Table.Td>{r.item.delivery_period || '-'}</Table.Td>
                      <Table.Td ta="right">{r.kg !== null ? tr2(r.kg) : '-'}</Table.Td>
                      <Table.Td ta="right">{r.subtotal ? tr2(r.subtotal) : '-'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
                <Table.Tfoot>
                  <Table.Tr>
                    <Table.Th colSpan={6} ta="right">
                      Toplam:
                    </Table.Th>
                    <Table.Th ta="right">{tr2(totalPrice)} €</Table.Th>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Th colSpan={6} ta="right">
                      Toplam Ağırlık:
                    </Table.Th>
                    <Table.Th ta="right">{tr2(totalWeight)} kg</Table.Th>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Th colSpan={6} ta="right">
                      Ortalama Kg Fiyatı:
                    </Table.Th>
                    <Table.Th ta="right">{avgKg !== null ? tr2(avgKg) : '-'} €/kg</Table.Th>
                  </Table.Tr>
                </Table.Tfoot>
              </Table>
            </Table.ScrollContainer>
          )}
        </ModalSection>
      </ModalBody>
      <ModalFooter>
        <Button variant="default" onClick={onClose}>
          İptal
        </Button>
        <Button
          color="green"
          leftSection={<FaIcon icon="fas fa-check" />}
          onClick={() => decide('approve')}
        >
          Onayla
        </Button>
        <Button
          color="red"
          leftSection={<FaIcon icon="fas fa-times" />}
          onClick={() => decide('reject')}
        >
          Reddet
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/**
 * Legacy showApproveDecisionModal / showRejectDecisionModal. A rejection
 * needs a comment and may carry a counter offer (currency EUR by default).
 */
export function DecisionModal({
  offerId,
  approve,
  onClose,
}: {
  offerId: number;
  approve: boolean;
  onClose: () => void;
}) {
  const invalidate = useInvalidateOffers();
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | string>('');
  const [currency, setCurrency] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!approve && !comment.trim()) {
      setCommentError('Bu alan gereklidir');
      notify.warning('Red için yorum zorunludur');
      return;
    }
    const payload: DecisionPayload = { approve, comment };
    if (!approve && amount !== '' && Number(amount)) {
      payload.counter_amount = Number(amount);
      payload.counter_currency = currency || 'EUR';
    }
    setBusy(true);
    try {
      await recordDecision(offerId, payload);
      notify.success(approve ? 'Onay kararı kaydedildi' : 'Red kararı kaydedildi');
      onClose();
      await invalidate();
    } catch (error) {
      notify.error(offerErrorMessage(error, 'Karar kaydedilemedi'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={approve ? 'Onayla' : 'Reddet'}
      icon={approve ? 'fas fa-check' : 'fas fa-times'}
      submitting={busy}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <ModalSection
        title={approve ? 'Onay Kararı' : 'Red Kararı'}
        icon={approve ? 'fas fa-check' : 'fas fa-times-circle'}
      >
        <Textarea
          label={approve ? 'Yorum (İsteğe Bağlı)' : 'Yorum (Zorunlu)'}
          withAsterisk={!approve}
          value={comment}
          error={commentError}
          data-autofocus
          onChange={(e) => {
            setComment(e.currentTarget.value);
            setCommentError(null);
          }}
        />
      </ModalSection>
      {!approve ? (
        <ModalSection title="Karşı Teklif (İsteğe Bağlı)" icon="fas fa-exchange-alt">
          <Grid gap="sm">
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <NumberInput
                label="Karşı Tutar"
                min={0}
                decimalSeparator=","
                value={amount}
                onChange={setAmount}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Select
                label="Para Birimi"
                placeholder="Seçilmedi"
                clearable
                data={OFFER_CURRENCY_OPTIONS}
                value={currency}
                onChange={setCurrency}
              />
            </Grid.Col>
          </Grid>
        </ModalSection>
      ) : null}
    </FormModal>
  );
}
