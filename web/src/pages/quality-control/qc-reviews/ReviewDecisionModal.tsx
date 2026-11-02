import { Grid, NumberInput, Select, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import {
  DEFECT_TYPE_CHOICES,
  DISPOSITION_CHOICES,
  SEVERITY_CHOICES,
  useDecideQCReview,
  type NcrDecisionData,
  type QCReview,
} from '@/api/quality-control/qcReviews';
import { FormModal, ModalSection, notify } from '@/ui';
import { partRows } from './ReviewDetailModal';

const REQUIRED = 'Bu alan gereklidir';

export interface DecisionValues {
  comment: string;
  ncr_title: string;
  ncr_description: string;
  ncr_defect_type: string;
  ncr_severity: string;
  ncr_affected_quantity: string | number;
  ncr_disposition: string;
}

function initialValues(review: QCReview): DecisionValues {
  const quantity = partRows(review.part_data)[0]?.quantity_inspected;
  return {
    comment: '',
    ncr_title: `KK Red: ${review.task_title || 'İnceleme Reddedildi'}`,
    ncr_description: '',
    ncr_defect_type: 'other',
    ncr_severity: 'minor',
    ncr_affected_quantity:
      typeof quantity === 'number' || typeof quantity === 'string' ? quantity || 1 : 1,
    ncr_disposition: 'pending',
  };
}

/** Legacy onSave: empty NCR fields are left out; the quantity goes as an integer. */
export function ncrData(values: DecisionValues): NcrDecisionData {
  const data: NcrDecisionData = {};
  if (values.ncr_title) data.ncr_title = values.ncr_title;
  if (values.ncr_description) data.ncr_description = values.ncr_description;
  if (values.ncr_defect_type) data.ncr_defect_type = values.ncr_defect_type;
  if (values.ncr_severity) data.ncr_severity = values.ncr_severity;
  const quantity = Number.parseInt(String(values.ncr_affected_quantity), 10);
  if (values.ncr_affected_quantity && Number.isFinite(quantity))
    data.ncr_affected_quantity = quantity;
  if (values.ncr_disposition) data.ncr_disposition = values.ncr_disposition;
  return data;
}

export interface ReviewDecisionModalProps {
  review: QCReview;
  approve: boolean;
  onClose: () => void;
}

/** The "KK İnceleme Kararı" modal (legacy showReviewDecisionModal). */
export function ReviewDecisionModal({ review, approve, onClose }: ReviewDecisionModalProps) {
  const form = useForm<DecisionValues>({
    initialValues: initialValues(review),
    validate: { comment: (value) => (approve || value.trim() ? null : REQUIRED) },
  });
  const decide = useDecideQCReview();

  const save = async (values: DecisionValues) => {
    try {
      await decide.mutateAsync({
        id: review.id,
        approve,
        comment: values.comment || '',
        ncr: approve ? undefined : ncrData(values),
      });
      notify.success(approve ? 'İnceleme onaylandı' : 'İnceleme reddedildi ve NCR oluşturuldu');
      onClose();
    } catch (error) {
      console.error('Error deciding review:', error);
      notify.error(error, { fallback: 'Karar verilirken hata oluştu' });
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="KK İnceleme Kararı"
      subtitle={[`#${review.id}`, review.job_order, review.task_title].filter(Boolean).join(' · ')}
      icon="fas fa-gavel"
      size="xl"
      submitLabel="Karar Ver"
      submitIcon="fas fa-gavel"
      submitting={decide.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection
        title={approve ? 'Onaylama' : 'Reddetme'}
        icon={approve ? 'fas fa-check-circle' : 'fas fa-times-circle'}
      >
        <Textarea
          label="Yorum"
          withAsterisk={!approve}
          rows={3}
          placeholder={approve ? 'Onay yorumu (isteğe bağlı)' : 'Red nedeni (zorunlu)'}
          {...form.getInputProps('comment')}
        />
      </ModalSection>

      {approve ? null : (
        <ModalSection title="NCR Bilgileri" icon="fas fa-exclamation-triangle">
          <Grid gap="sm">
            <Grid.Col span={12}>
              <TextInput
                label="NCR Başlığı"
                placeholder="NCR başlığı (boş bırakılırsa otomatik oluşturulur)"
                {...form.getInputProps('ncr_title')}
              />
            </Grid.Col>
            <Grid.Col span={12}>
              <Textarea
                label="NCR Açıklaması"
                rows={3}
                placeholder="Açıklama (boş bırakılırsa yorum kullanılır)"
                {...form.getInputProps('ncr_description')}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Select
                label="Kusur Tipi"
                data={DEFECT_TYPE_CHOICES}
                allowDeselect={false}
                {...form.getInputProps('ncr_defect_type')}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Select
                label="Önem Derecesi"
                data={SEVERITY_CHOICES}
                allowDeselect={false}
                {...form.getInputProps('ncr_severity')}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <NumberInput
                label="Etkilenen Miktar"
                placeholder="1"
                allowDecimal={false}
                {...form.getInputProps('ncr_affected_quantity')}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Select
                label="Karar"
                data={DISPOSITION_CHOICES}
                allowDeselect={false}
                {...form.getInputProps('ncr_disposition')}
              />
            </Grid.Col>
          </Grid>
        </ModalSection>
      )}
    </FormModal>
  );
}
