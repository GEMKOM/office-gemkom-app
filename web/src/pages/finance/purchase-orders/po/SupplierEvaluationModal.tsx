import { Grid, Select, Textarea } from '@mantine/core';
import { useState } from 'react';
import { createSupplierEvaluation, supplierReadErrorMessage } from '@/api/procurement/suppliers';
import { FormModal, ModalSection, notify } from '@/ui';

const SCORE_OPTIONS = [
  { value: '5', label: '5 - Çok İyi' },
  { value: '4', label: '4 - İyi' },
  { value: '3', label: '3 - Orta' },
  { value: '2', label: '2 - Zayıf' },
  { value: '1', label: '1 - Kötü' },
];

const CRITERIA = [
  { key: 'quality_score', label: 'Kalite' },
  { key: 'delivery_score', label: 'Teslimat' },
  { key: 'price_score', label: 'Fiyat' },
  { key: 'service_score', label: 'Servis' },
] as const;

type ScoreKey = (typeof CRITERIA)[number]['key'];

/** Legacy supplierEvaluationModal: rate the supplier of one order (1–5, default 4). */
export function SupplierEvaluationModal({
  orderId,
  onClose,
}: {
  orderId: number;
  onClose: () => void;
}) {
  const [scores, setScores] = useState<Record<ScoreKey, string>>({
    quality_score: '4',
    delivery_score: '4',
    price_score: '4',
    service_score: '4',
  });
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const result = await createSupplierEvaluation({
        purchase_order: orderId,
        quality_score: Number(scores.quality_score),
        delivery_score: Number(scores.delivery_score),
        price_score: Number(scores.price_score),
        service_score: Number(scores.service_score),
        comment: comment.trim(),
      });
      const score = (result as { supplier?: { rating_score?: number | string | null } }).supplier
        ?.rating_score;
      notify.success(
        'Değerlendirme kaydedildi.' +
          (score !== null && score !== undefined
            ? ` Tedarikçinin yeni puanı: ${Number(score).toFixed(2)}`
            : ''),
      );
      onClose();
    } catch (error) {
      notify.error(supplierReadErrorMessage(error, 'Değerlendirme kaydedilirken hata oluştu'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Tedarikçi Değerlendirme"
      icon="fas fa-star"
      size="md"
      submitLabel="Değerlendirmeyi Kaydet"
      submitting={saving}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <ModalSection title="Değerlendirme (1–5)">
        <Grid gap="sm">
          {CRITERIA.map(({ key, label }) => (
            <Grid.Col key={key} span={{ base: 12, sm: 6 }}>
              <Select
                label={label}
                withAsterisk
                data={SCORE_OPTIONS}
                allowDeselect={false}
                value={scores[key]}
                onChange={(value) => setScores((prev) => ({ ...prev, [key]: value ?? prev[key] }))}
              />
            </Grid.Col>
          ))}
          <Grid.Col span={12}>
            <Textarea
              label="Yorum"
              placeholder="Opsiyonel"
              rows={3}
              value={comment}
              onChange={(event) => setComment(event.currentTarget.value)}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}
