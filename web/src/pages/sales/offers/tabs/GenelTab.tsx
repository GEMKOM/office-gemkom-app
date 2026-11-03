import { Anchor, Button, Group, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { activePaymentTermOptionsQueryOptions } from '@/api/procurement/paymentTerms';
import { offerStatusFamily, offerStatusLabel, type OfferDetail } from '@/api/sales/offers';
import { FaIcon, StatusBadge } from '@/ui';
import { useOffers } from '../context';
import { isClosed, parseNum, shortDate, shortDateTime, tr2 } from '../logic';
import { TabFooter, type TabProps } from '../OfferModal';
import { FieldRow, FieldSection } from '../parts';
import css from '../OffersPage.module.css';

const orDash = (value: unknown) =>
  value === null || value === undefined || String(value).trim() === '' ? '-' : String(value);

function paymentTermsLabel(
  offer: OfferDetail,
  options: { value: string; label: string }[] | undefined,
): string {
  const value = offer.payment_terms;
  if (value === null || value === undefined || value === '') return '-';
  const id = typeof value === 'object' ? (value.id ?? '') : value;
  const found = options?.find((o) => o.value === String(id));
  if (found) return found.label;
  if (typeof value === 'object' && value.name) return value.name;
  return offer.payment_terms_name || '-';
}

/** Root job orders made from the offer, each linking to project tracking. */
function JobOrders({ offer }: { offer: OfferDetail }) {
  let roots = (offer.job_orders ?? []).filter(
    (jo) => jo?.job_no && (jo.parent === null || jo.parent === undefined),
  );
  if (!roots.length && offer.converted_job_order_no)
    roots = [{ job_no: offer.converted_job_order_no, title: '' }];
  if (!roots.length) return null;
  return (
    <FieldRow label="İş Emri" icon="fas fa-briefcase">
      <Group gap="md">
        {roots.map((jo) => (
          <Anchor
            key={jo.job_no}
            href={`/projects/project-tracking/?job_no=${encodeURIComponent(jo.job_no)}`}
            target="_blank"
            rel="noopener"
            title={jo.title || undefined}
          >
            <strong>{jo.job_no}</strong> <FaIcon icon="fas fa-external-link-alt" />
          </Anchor>
        ))}
      </Group>
    </FieldRow>
  );
}

/** Legacy buildGenelTab: the offer's fields, customer details, prices and dates. */
export function GenelTab({ offer }: TabProps) {
  const { openDialog, runAction } = useOffers();
  const terms = useQuery(activePaymentTermOptionsQueryOptions());
  const customer = offer.customer_detail ?? null;
  const totalPrice = parseNum(offer.total_price) ?? 0;
  const totalWeight = parseNum(offer.total_weight_kg) ?? 0;
  const status = offer.status;

  return (
    <div className={css.genel}>
      <FieldSection title="Genel Bilgiler" icon="fas fa-info-circle">
        <FieldRow label="Teklif No" icon="fas fa-barcode">
          <Text span fw={500}>
            {offer.offer_no || '-'}
          </Text>
        </FieldRow>
        <FieldRow label="Durum" icon="fas fa-tasks">
          <StatusBadge color={offerStatusFamily(status)}>{offerStatusLabel(offer)}</StatusBadge>
        </FieldRow>
        <JobOrders offer={offer} />
        <FieldRow label="Başlık" icon="fas fa-heading">
          {offer.title || '-'}
        </FieldRow>
        {offer.description ? (
          <FieldRow label="Açıklama" icon="fas fa-align-left" multiline>
            <span className={css.preWrap}>{offer.description}</span>
          </FieldRow>
        ) : null}
      </FieldSection>

      <FieldSection
        title="Müşteri Bilgileri"
        icon="fas fa-building"
        action={
          offer.customer ? (
            <Button
              size="xs"
              variant="light"
              leftSection={<FaIcon icon="fas fa-edit" />}
              onClick={() => openDialog({ kind: 'customer', customerId: Number(offer.customer) })}
            >
              Düzenle
            </Button>
          ) : null
        }
      >
        <FieldRow label="Müşteri" icon="fas fa-building">
          {offer.customer_name || '-'}
          {offer.customer_code ? (
            <Text span c="dimmed">
              {' '}
              ({offer.customer_code})
            </Text>
          ) : null}
        </FieldRow>
        <FieldRow label="Müşteri Referansı" icon="fas fa-hashtag">
          {orDash(offer.customer_inquiry_ref)}
        </FieldRow>
        <FieldRow label="İletişim Kişisi" icon="fas fa-user">
          {orDash(customer?.contact_person)}
        </FieldRow>
        <FieldRow label="Telefon" icon="fas fa-phone">
          {orDash(customer?.phone)}
        </FieldRow>
        <FieldRow label="Adres" icon="fas fa-map-marker-alt" multiline>
          <span className={css.preWrap}>{orDash(customer?.address)}</span>
        </FieldRow>
        <FieldRow label="Vergi Numarası" icon="fas fa-id-card">
          {orDash(customer?.tax_id)}
        </FieldRow>
        <FieldRow label="Vergi Dairesi" icon="fas fa-landmark">
          {orDash(customer?.tax_office)}
        </FieldRow>
      </FieldSection>

      <FieldSection title="Teklif Detayları" icon="fas fa-clipboard-list">
        <FieldRow label="Sipariş No" icon="fas fa-file-signature">
          {offer.order_no || '-'}
        </FieldRow>
        {offer.incoterms ? (
          <FieldRow label="Incoterms" icon="fas fa-shipping-fast">
            {offer.incoterms}
          </FieldRow>
        ) : null}
        <FieldRow label="Teslim Yeri" icon="fas fa-map-marker-alt">
          {offer.delivery_place || '-'}
        </FieldRow>
        <FieldRow label="Ödeme Şekli" icon="fas fa-credit-card">
          {paymentTermsLabel(offer, terms.data)}
        </FieldRow>
        <FieldRow label="İstenen Termin Tarihi" icon="fas fa-calendar-alt">
          {shortDate(offer.delivery_date_requested)}
        </FieldRow>
        <FieldRow label="Teklif Sunumu için Son Tarih" icon="fas fa-calendar-check">
          {shortDate(offer.offer_expiry_date)}
        </FieldRow>
      </FieldSection>

      <FieldSection title="Fiyat ve Ağırlık Bilgileri" icon="fas fa-money-bill-wave">
        <FieldRow label="Toplam Fiyat" icon="fas fa-money-bill-wave">
          <Text span fw={700} c="var(--gk-red-700)">
            {totalPrice > 0 ? `€ ${tr2(totalPrice)}` : '-'}
          </Text>
        </FieldRow>
        {totalWeight > 0 ? (
          <FieldRow label="Toplam Ağırlık" icon="fas fa-weight">
            {tr2(totalWeight)} kg
          </FieldRow>
        ) : null}
        {(offer.approval_round ?? 0) > 0 ? (
          <FieldRow label="Onay Turu" icon="fas fa-sync-alt">
            {offer.approval_round}
          </FieldRow>
        ) : null}
      </FieldSection>

      <FieldSection title="Sistem Bilgileri" icon="fas fa-info-circle" muted>
        <FieldRow label="Oluşturan" icon="fas fa-user">
          {offer.created_by_name || '-'}
        </FieldRow>
        <FieldRow label="Oluşturulma Tarihi" icon="fas fa-calendar-plus">
          {shortDateTime(offer.created_at)}
        </FieldRow>
        <FieldRow label="Güncellenme Tarihi" icon="fas fa-calendar-edit">
          {shortDateTime(offer.updated_at)}
        </FieldRow>
        {offer.submitted_to_customer_at ? (
          <FieldRow label="Müşteriye Gönderilme" icon="fas fa-paper-plane">
            {shortDateTime(offer.submitted_to_customer_at)}
          </FieldRow>
        ) : null}
        {offer.won_at ? (
          <FieldRow label="Kazanılma" icon="fas fa-trophy">
            {shortDateTime(offer.won_at)}
          </FieldRow>
        ) : null}
        {offer.lost_at ? (
          <FieldRow label="Kaybedilme" icon="fas fa-times-circle">
            {shortDateTime(offer.lost_at)}
          </FieldRow>
        ) : null}
        {offer.cancelled_at ? (
          <FieldRow label="İptal" icon="fas fa-ban">
            {shortDateTime(offer.cancelled_at)}
          </FieldRow>
        ) : null}
      </FieldSection>

      <TabFooter>
        {!isClosed(status) ? (
          <Button
            leftSection={<FaIcon icon="fas fa-edit" />}
            onClick={() => openDialog({ kind: 'edit', offer })}
          >
            Düzenle
          </Button>
        ) : null}
        {status === 'won' && !offer.converted_job_order ? (
          <Button
            variant="outline"
            color="yellow"
            leftSection={<FaIcon icon="fas fa-undo" />}
            onClick={() => void runAction(offer.id, 'revert-won')}
          >
            Kazanıldıyı Geri Al
          </Button>
        ) : null}
      </TabFooter>
    </div>
  );
}
