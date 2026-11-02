import {
  ActionIcon,
  Button,
  Grid,
  NumberInput,
  Paper,
  Select,
  Stack,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { randomId } from '@mantine/hooks';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import {
  useBasisChoices,
  useCreatePaymentTerm,
  type PaymentTermInput,
} from '@/api/procurement/paymentTerms';
import { FaIcon, FormModal, ModalSection, notify } from '@/ui';
import { legacyApiMessage } from './columns';

const REQUIRED = 'Bu alan gereklidir';

const blankable = z.union([z.number(), z.string()]);

const lineSchema = z.object({
  key: z.string(),
  label: z.string().trim().min(1, REQUIRED),
  // Legacy input: type=number min=0 max=100 step=0.01, required.
  percentage: blankable
    .refine((v) => v !== '', REQUIRED)
    .refine(
      (v) => v === '' || (Number(v) >= 0 && Number(v) <= 100),
      'Yüzde 0 ile 100 arasında olmalıdır',
    ),
  basis: z.string().min(1, REQUIRED),
  // Legacy input: type=number min=0, optional (empty counts as 0).
  offset_days: blankable.refine((v) => v === '' || Number(v) >= 0, "Gecikme 0'dan küçük olamaz"),
});

export const paymentTermSchema = z.object({
  name: z.string().trim().min(1, REQUIRED),
  code: z.string().trim().min(1, REQUIRED),
  lines: z.array(lineSchema),
});

export type PaymentTermFormValues = z.infer<typeof paymentTermSchema>;
type LineValues = PaymentTermFormValues['lines'][number];

/** The request body, as legacy savePaymentTerm built it. */
export function paymentTermBody(values: PaymentTermFormValues): PaymentTermInput {
  return {
    name: values.name.trim(),
    code: values.code.trim(),
    // New payment terms are always custom and active (the selects are disabled).
    is_custom: true,
    active: true,
    default_lines: values.lines.map((line) => ({
      label: line.label.trim(),
      percentage: Number(line.percentage),
      basis: line.basis,
      offset_days: Number.parseInt(String(line.offset_days), 10) || 0,
    })),
  };
}

export interface PaymentTermFormModalProps {
  onClose: () => void;
}

/**
 * Port of #paymentTermFormModal (create only: legacy had no edit). Mount it
 * when it should open, so the form starts empty each time with no lines.
 */
export function PaymentTermFormModal({ onClose }: PaymentTermFormModalProps) {
  const basisChoices = useBasisChoices().data ?? [];
  const basisData = basisChoices.map(({ value, label }) => ({ value, label }));
  const create = useCreatePaymentTerm();

  const form = useForm<PaymentTermFormValues>({
    initialValues: { name: '', code: '', lines: [] },
    validate: zod4Resolver(paymentTermSchema),
  });

  const addLine = () => {
    const line: LineValues = {
      key: randomId(),
      label: '',
      percentage: '',
      // A legacy <select> starts on its first option.
      basis: basisChoices[0]?.value ?? '',
      offset_days: 0,
    };
    form.insertListItem('lines', line);
  };

  const save = async (values: PaymentTermFormValues) => {
    const body = paymentTermBody(values);
    if (body.default_lines.length === 0) {
      notify.error('En az bir ödeme satırı eklemelisiniz');
      return;
    }
    const total = body.default_lines.reduce((sum, line) => sum + line.percentage, 0);
    // 0.01 tolerance for floating point, as legacy.
    if (Math.abs(total - 100) > 0.01) {
      notify.error(
        `Ödeme satırlarının yüzde toplamı tam olarak 100 olmalıdır. Mevcut toplam: ${total.toFixed(2)}%`,
      );
      return;
    }
    try {
      await create.mutateAsync(body);
      notify.success('Ödeme koşulu başarıyla oluşturuldu');
      onClose();
    } catch (error) {
      notify.error(
        'Ödeme koşulu kaydedilirken hata oluştu: ' +
          legacyApiMessage(error, 'Ödeme koşulu oluşturulurken hata oluştu'),
      );
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Yeni Ödeme Koşulu"
      icon="fas fa-plus"
      size="lg"
      submitting={create.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Temel Bilgiler">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Ödeme Koşulu Adı" withAsterisk {...form.getInputProps('name')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Kod" withAsterisk {...form.getInputProps('code')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select label="Tür" data={[{ value: 'true', label: 'Özel' }]} value="true" disabled />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Durum"
              data={[{ value: 'true', label: 'Aktif' }]}
              value="true"
              disabled
            />
          </Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title="Ödeme Detayları">
        <Stack gap="xs">
          {form.values.lines.map((line, index) => (
            <Paper key={line.key} withBorder p="sm" radius="sm" data-testid="payment-line">
              <Grid gap="sm" align="flex-end">
                <Grid.Col span={{ base: 12, sm: 3 }}>
                  <TextInput
                    size="xs"
                    label="Etiket"
                    withAsterisk
                    {...form.getInputProps(`lines.${index}.label`)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 6, sm: 2 }}>
                  <NumberInput
                    size="xs"
                    label="Yüzde (%)"
                    withAsterisk
                    min={0}
                    max={100}
                    step={0.01}
                    decimalScale={2}
                    allowNegative={false}
                    hideControls
                    {...form.getInputProps(`lines.${index}.percentage`)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 6, sm: 3 }}>
                  <Select
                    size="xs"
                    label="Temel"
                    withAsterisk
                    data={basisData}
                    allowDeselect={false}
                    {...form.getInputProps(`lines.${index}.basis`)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 9, sm: 3 }}>
                  <NumberInput
                    size="xs"
                    label="Gecikme (Gün)"
                    min={0}
                    allowNegative={false}
                    allowDecimal={false}
                    hideControls
                    {...form.getInputProps(`lines.${index}.offset_days`)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 3, sm: 1 }}>
                  <ActionIcon
                    variant="light"
                    color="red"
                    size="md"
                    aria-label="Ödeme satırını kaldır"
                    onClick={() => form.removeListItem('lines', index)}
                  >
                    <FaIcon icon="fas fa-trash" />
                  </ActionIcon>
                </Grid.Col>
              </Grid>
            </Paper>
          ))}
          <div>
            <Button
              size="xs"
              variant="light"
              leftSection={<FaIcon icon="fas fa-plus" />}
              onClick={addLine}
            >
              Ödeme Satırı Ekle
            </Button>
          </div>
        </Stack>
      </ModalSection>
    </FormModal>
  );
}
