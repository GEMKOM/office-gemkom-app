import { Grid, Select, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useRef } from 'react';
import { z } from 'zod';
import {
  craneErrorText,
  useCompleteCraneRequest,
  type CraneRequest,
  type CraneType,
} from '@/api/general/craneRequests';
import { FaIcon, FormModal, ModalSection, notify } from '@/ui';
import {
  CURRENCY_OPTIONS,
  formatMoney,
  isPlatformRequest,
  PRICING_OPTION_LABELS,
  suggestActualCost,
} from '../crane';

const nonNegative = (v: string) => v === '' || (!Number.isNaN(Number(v)) && Number(v) >= 0);

export const completeSchema = z.object({
  actual_quantity: z.string().refine(nonNegative, 'Geçerli bir değer girin'),
  actual_cost: z
    .string()
    .min(1, 'Fiili maliyet zorunludur')
    .refine(nonNegative, 'Geçerli bir değer girin'),
  actual_cost_currency: z.string(),
});

type CompleteFormValues = z.infer<typeof completeSchema>;

export interface CraneRequestCompleteModalProps {
  request: CraneRequest;
  craneTypes: CraneType[];
  onClose: () => void;
  /** After a successful save (legacy also closed the details modal). */
  onCompleted: () => void;
}

/**
 * Port of showCompleteModal in list.js: record the actuals (first completion
 * or a correction). The cost follows the price-list suggestion for the
 * entered quantity until the coordinator edits it.
 */
export function CraneRequestCompleteModal({
  request,
  craneTypes,
  onClose,
  onCompleted,
}: CraneRequestCompleteModalProps) {
  const type = craneTypes.find((t) => String(t.id) === String(request.crane_type)) ?? null;
  const isPlatform = isPlatformRequest(request, type);
  const isCorrection = request.status === 'completed';

  // Prefill: corrections show the stored actuals; a first completion starts
  // from the requested duration and its price-list suggestion.
  const initialQuantity =
    isCorrection && request.actual_quantity !== null && request.actual_quantity !== undefined
      ? Number.parseFloat(String(request.actual_quantity))
      : request.pricing_option === 'daily'
        ? request.days || 1
        : request.pricing_option === 'up_to_3h'
          ? 3
          : 8;
  const initialSuggestion = suggestActualCost(request, type, initialQuantity);
  const initialCost =
    isCorrection && request.actual_cost !== null && request.actual_cost !== undefined
      ? request.actual_cost
      : initialSuggestion
        ? initialSuggestion.total
        : (request.estimated_cost ?? '');

  const form = useForm<CompleteFormValues>({
    initialValues: {
      actual_quantity: String(initialQuantity),
      actual_cost: String(initialCost ?? ''),
      actual_cost_currency:
        (isCorrection && request.actual_cost_currency) || request.estimated_cost_currency || 'TRY',
    },
    validate: zod4Resolver(completeSchema),
  });
  const lastSuggestion = useRef<number | null>(initialSuggestion ? initialSuggestion.total : null);
  const complete = useCompleteCraneRequest();

  const suggestion = suggestActualCost(request, type, form.values.actual_quantity);

  const changeQuantity = (quantity: string) => {
    form.setFieldValue('actual_quantity', quantity);
    const next = suggestActualCost(request, type, quantity);
    if (!next) return;
    const cost = form.getValues().actual_cost;
    const current = Number.parseFloat(cost);
    const untouched =
      cost === '' || (lastSuggestion.current !== null && current === lastSuggestion.current);
    if (untouched) form.setFieldValue('actual_cost', String(next.total));
    lastSuggestion.current = next.total;
  };

  const save = async (values: CompleteFormValues) => {
    try {
      await complete.mutateAsync({
        id: request.id,
        actual_quantity: values.actual_quantity !== '' ? values.actual_quantity : null,
        actual_cost: values.actual_cost,
        actual_cost_currency: values.actual_cost_currency || 'TRY',
      });
      notify.success(
        isCorrection
          ? 'Fiili değerler güncellendi; iş maliyeti yeniden hesaplandı'
          : 'Talep tamamlandı; maliyet iş emrine işlendi',
      );
      onCompleted();
      onClose();
    } catch (error) {
      notify.error(`Talep tamamlanırken hata oluştu: ${craneErrorText(error)}`);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={
        isCorrection
          ? `Fiili Değeri Düzelt — ${request.request_number}`
          : `Talebi Tamamla — ${request.request_number}`
      }
      icon="fas fa-flag-checkered"
      size="md"
      submitLabel={
        isCorrection ? 'Güncelle ve Maliyeti Yeniden Hesapla' : 'Tamamla ve Maliyeti İşle'
      }
      submitIcon={isCorrection ? 'fas fa-pen' : 'fas fa-flag-checkered'}
      submitting={complete.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Fiili Değerler" icon="fas fa-receipt">
        <Grid gap="sm">
          <Grid.Col span={12}>
            <TextInput
              type="number"
              min={0}
              step={0.5}
              label={isPlatform ? 'Fiili Gün Sayısı' : 'Fiili Saat'}
              description={
                isPlatform
                  ? 'Platformun sahada kaldığı gün sayısı'
                  : `Vincin fiilen çalıştığı saat (talep: ${(request.pricing_option && PRICING_OPTION_LABELS[request.pricing_option]) || '-'})`
              }
              {...form.getInputProps('actual_quantity')}
              onChange={(event) => changeQuantity(event.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 8 }}>
            <TextInput
              type="number"
              min={0}
              step={0.01}
              label="Fiili Maliyet (fatura tutarı, KDV hariç)"
              withAsterisk
              description="Girilen süreye göre önerilir; tedarikçi faturasına göre düzeltin"
              {...form.getInputProps('actual_cost')}
            />
            {suggestion ? (
              <Text size="xs" c="blue.8" mt={4} data-testid="actual-cost-suggestion">
                <FaIcon icon="fas fa-calculator" style={{ marginRight: 4 }} />
                Öneri: <strong>{formatMoney(suggestion.total, suggestion.currency)}</strong> (
                {suggestion.note})
              </Text>
            ) : null}
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Select
              label="Para Birimi"
              allowDeselect={false}
              data={CURRENCY_OPTIONS}
              {...form.getInputProps('actual_cost_currency')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}
