import { Alert, Button, Center, Grid, List, Loader, Text, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  convertToJobOrder,
  offerErrorMessage,
  offerFilesQueryOptions,
  offerQueryOptions,
  patchOffer,
  useInvalidateOffers,
  type OfferDetail,
} from '@/api/sales/offers';
import { FaIcon, FormModal, ModalSection, notify } from '@/ui';
import { useOffers } from '../context';
import { missingCustomerFields } from '../logic';
import { FileChecklist } from '../parts';

/** Legacy showConvertModal: the requested date (required), the customer check and the files to carry over. */
export function ConvertModal({ offerId, onClose }: { offerId: number; onClose: () => void }) {
  const offer = useQuery(offerQueryOptions(offerId));

  useEffect(() => {
    if (offer.isError && !offer.data) {
      notify.error(offerErrorMessage(offer.error, 'Teklif bilgileri yüklenemedi'));
      onClose();
    }
  }, [offer.isError, offer.data, offer.error, onClose]);

  if (!offer.data) {
    if (offer.isError) return null;
    return (
      <FormModal
        opened
        onClose={onClose}
        title="İş Emrine Dönüştür"
        icon="fas fa-exchange-alt"
        onSubmit={(e) => e.preventDefault()}
        submitDisabled
      >
        <Center py="xl">
          <Loader />
        </Center>
      </FormModal>
    );
  }
  return <ConvertForm offer={offer.data} onClose={onClose} />;
}

function ConvertForm({ offer, onClose }: { offer: OfferDetail; onClose: () => void }) {
  const { openDialog } = useOffers();
  const invalidate = useInvalidateOffers();
  const files = useQuery(offerFilesQueryOptions(offer.id));
  const [date, setDate] = useState(offer.delivery_date_requested || '');
  const [dateError, setDateError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  // The offer query refetches after a customer edit, so the warning follows it.
  const missing = missingCustomerFields(offer.customer_detail ?? null);

  const save = async () => {
    if (!date) {
      setDateError('Bu alan gereklidir');
      return;
    }
    setBusy(true);
    try {
      if (!offer.delivery_date_requested || offer.delivery_date_requested !== date) {
        await patchOffer(offer.id, { delivery_date_requested: date || null });
      }
      const result = await convertToJobOrder(offer.id, selected);
      notify.success(`İş emrine dönüştürüldü: ${result?.job_no ?? ''}`);
      onClose();
      await invalidate();
    } catch (error) {
      notify.error(offerErrorMessage(error, 'Dönüşüm hatası'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="İş Emrine Dönüştür"
      subtitle={[offer.offer_no, offer.title].filter(Boolean).join(' · ')}
      icon="fas fa-exchange-alt"
      size="lg"
      submitting={busy}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <ModalSection title="Dönüşüm Bilgileri" icon="fas fa-info-circle">
        <Text c="dimmed" size="sm" mb="sm">
          Teklifi iş emrine dönüştürmek istediğinize emin misiniz? İş emrine aktarılacak dosyaları
          seçebilirsiniz.
        </Text>
        {missing.length ? (
          <Alert
            color="yellow"
            variant="light"
            mb="sm"
            icon={<FaIcon icon="fas fa-exclamation-triangle" />}
            title="Eksik müşteri bilgileri"
          >
            <Text size="sm" mb={4}>
              İş emrine dönüştürmeden önce aşağıdaki müşteri bilgilerini tamamlamanız önerilir:
            </Text>
            <List size="sm" mb="xs">
              {missing.map((label) => (
                <List.Item key={label}>{label}</List.Item>
              ))}
            </List>
            {offer.customer ? (
              <Button
                size="xs"
                color="yellow"
                leftSection={<FaIcon icon="fas fa-edit" />}
                onClick={() => openDialog({ kind: 'customer', customerId: Number(offer.customer) })}
              >
                Müşteri Bilgilerini Düzenle
              </Button>
            ) : null}
          </Alert>
        ) : null}
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              type="date"
              label="İstenen Termin Tarihi"
              withAsterisk
              description="İş emrine dönüştürmek için termin tarihi zorunludur."
              value={date}
              error={dateError}
              onChange={(e) => {
                setDate(e.currentTarget.value);
                setDateError(null);
              }}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
      <ModalSection>
        <FileChecklist
          files={files.data}
          loading={files.isPending}
          error={files.isError}
          selected={selected}
          onChange={setSelected}
          title="İş emrine aktarılacak dosyalar"
          hint="İş emrine aktarılmasını istediğiniz dosyaları işaretleyin."
          emptyTitle="Aktarılacak dosya yok"
          emptyText="Teklifte henüz dosya yok. İstediğiniz dosyaları teklife ekledikten sonra dönüştürebilirsiniz."
        />
      </ModalSection>
    </FormModal>
  );
}
