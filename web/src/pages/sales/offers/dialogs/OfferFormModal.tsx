import { Grid, Select, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { z } from 'zod';
import { customersQueryOptions } from '@/api';
import { activePaymentTermOptionsQueryOptions } from '@/api/procurement/paymentTerms';
import {
  createOffer,
  INCOTERMS_OPTIONS,
  offerErrorMessage,
  patchOffer,
  useInvalidateOffers,
  type OfferDetail,
  type OfferInput,
} from '@/api/sales/offers';
import { FormModal, ModalSection, notify, SelectRemote, type RemoteOption } from '@/ui';
import { useOffers } from '../context';

const REQUIRED = 'Bu alan gereklidir';

const schema = z.object({
  customer: z.string().min(1, REQUIRED),
  title: z.string().trim().min(1, REQUIRED),
  description: z.string(),
  customer_inquiry_ref: z.string(),
  order_no: z.string(),
  incoterms: z.string(),
  delivery_place: z.string(),
  payment_terms: z.string(),
  delivery_date_requested: z.string(),
  offer_expiry_date: z.string(),
});

type Values = z.infer<typeof schema>;

/** Legacy normalizeOfferFormData: empty payment term and dates are sent as null. */
function toInput(values: Values): OfferInput {
  return {
    ...values,
    payment_terms: values.payment_terms || null,
    delivery_date_requested: values.delivery_date_requested || null,
    offer_expiry_date: values.offer_expiry_date || null,
  };
}

/**
 * Ödeme Şekli select value. GET may nest the term (`{id, name}`) the way
 * GenelTab already reads; String(object) is "[object Object]" and dropping
 * objects sent payment_terms: null on the next save, wiping the term.
 */
export function paymentTermFieldValue(value: OfferDetail['payment_terms']): string {
  if (value == null || value === '') return '';
  if (typeof value === 'object') return value.id != null ? String(value.id) : '';
  return String(value);
}

function customerLabel(c: { code?: string; name?: string; id: number | string }) {
  return [c.code, c.name].filter(Boolean).join(' - ') || `#${c.id}`;
}

/**
 * Legacy showCreateOfferModal (no `offer`) and showEditModal. A new offer
 * opens straight away, as legacy did.
 */
export function OfferFormModal({ offer, onClose }: { offer?: OfferDetail; onClose: () => void }) {
  const editing = Boolean(offer);
  const { openOffer } = useOffers();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateOffers();
  const terms = useQuery(activePaymentTermOptionsQueryOptions());
  const [busy, setBusy] = useState(false);

  const initialCustomer: RemoteOption[] =
    offer?.customer != null
      ? [
          {
            value: String(offer.customer),
            label: offer.customer_code
              ? `${offer.customer_code} - ${offer.customer_name || ''}`
              : offer.customer_name || `#${offer.customer}`,
          },
        ]
      : [];

  const form = useForm<Values>({
    initialValues: {
      customer: offer?.customer != null ? String(offer.customer) : '',
      title: offer?.title || '',
      description: offer?.description || '',
      customer_inquiry_ref: offer?.customer_inquiry_ref || '',
      order_no: offer?.order_no || '',
      incoterms: offer?.incoterms || '',
      delivery_place: offer?.delivery_place || '',
      payment_terms: paymentTermFieldValue(offer?.payment_terms),
      delivery_date_requested: offer?.delivery_date_requested || '',
      offer_expiry_date: offer?.offer_expiry_date || '',
    },
    validate: zod4Resolver(schema),
  });

  const save = async (values: Values) => {
    setBusy(true);
    try {
      if (offer) {
        await patchOffer(offer.id, toInput(values));
        notify.success('Teklif güncellendi');
        onClose();
        await invalidate();
      } else {
        const created = await createOffer(toInput(values));
        if (created?.id) {
          notify.success('Teklif başarıyla oluşturuldu');
          onClose();
          void invalidate();
          openOffer({ id: created.id, offer_no: created.offer_no }, 'genel');
        }
      }
    } catch (error) {
      notify.error(
        offerErrorMessage(
          error,
          editing ? 'Güncelleme hatası' : 'Teklif oluşturulurken hata oluştu',
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const customerField = (
    <SelectRemote
      label="Müşteri"
      required
      placeholder="Müşteri ara (en az 3 karakter)"
      queryKey={['offers', 'form-customer']}
      minSearchLength={3}
      initialOptions={initialCustomer}
      value={form.values.customer || null}
      error={form.errors.customer}
      onChange={(value) => form.setFieldValue('customer', value ?? '')}
      search={async (term) => {
        const res = await queryClient.fetchQuery(
          customersQueryOptions({ search: term.trim(), is_active: true, page_size: 50 }),
        );
        return res.results.map((c) => ({ value: String(c.id), label: customerLabel(c) }));
      }}
    />
  );
  // '' is "not chosen" (legacy Seçiniz); Mantine has no empty-string option, so it is a clearable placeholder.
  const optional = (field: 'incoterms' | 'payment_terms') => ({
    placeholder: 'Seçiniz',
    clearable: true,
    value: form.values[field] || null,
    error: form.errors[field],
    onChange: (value: string | null) => form.setFieldValue(field, value ?? ''),
  });
  const detailFields = (
    <>
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <TextInput
          label="Müşteri Referansı"
          placeholder={editing ? undefined : 'Ör: ABC-RFQ-2026-003'}
          {...form.getInputProps('customer_inquiry_ref')}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <TextInput
          label="Sipariş No"
          placeholder={editing ? undefined : 'Sipariş numarası'}
          {...form.getInputProps('order_no')}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <Select label="Incoterms" data={INCOTERMS_OPTIONS} {...optional('incoterms')} />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <TextInput
          label="Teslim Yeri"
          placeholder={editing ? undefined : 'Teslim yeri bilgisi'}
          {...form.getInputProps('delivery_place')}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <Select
          label="Ödeme Şekli"
          data={terms.data ?? []}
          searchable
          {...optional('payment_terms')}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <TextInput
          type="date"
          label="İstenen Termin Tarihi"
          description="İsteğe bağlı — iş emrine dönüşümde zorunludur."
          {...form.getInputProps('delivery_date_requested')}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <TextInput
          type="date"
          label="Teklif Sunumu için Son Tarih"
          {...form.getInputProps('offer_expiry_date')}
        />
      </Grid.Col>
    </>
  );

  return (
    <FormModal
      opened
      onClose={onClose}
      title={editing ? 'Teklifi Düzenle' : 'Yeni Teklif Oluştur'}
      subtitle={offer ? [offer.offer_no, offer.title].filter(Boolean).join(' · ') : undefined}
      icon={editing ? 'fas fa-edit' : 'fas fa-plus-circle'}
      size="lg"
      submitting={busy}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Teklif Bilgileri" icon="fas fa-info-circle">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>{customerField}</Grid.Col>
          <Grid.Col span={editing ? 12 : { base: 12, sm: 6 }}>
            <TextInput
              label={editing ? 'Başlık' : 'Teklif Başlığı'}
              withAsterisk
              placeholder={editing ? undefined : 'Ör: Meltshop Equipment for ABC Steel'}
              {...form.getInputProps('title')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Açıklama"
              placeholder={editing ? undefined : 'Teklif kapsamı...'}
              {...form.getInputProps('description')}
            />
          </Grid.Col>
          {editing ? detailFields : null}
        </Grid>
      </ModalSection>
      {!editing ? (
        <ModalSection title="Ek Bilgiler" icon="fas fa-calendar">
          <Grid gap="sm">{detailFields}</Grid>
        </ModalSection>
      ) : null}
    </FormModal>
  );
}
