import { Box, Checkbox, Grid, Group, Select, Text, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import { craneErrorText, useCreateCraneRequest, type CraneType } from '@/api/general/craneRequests';
import type { JobOrderOption } from '@/api/reference';
import { FaIcon, FileDropInput, FormModal, ModalSection, notify } from '@/ui';
import {
  availablePricingOptions,
  computeCraneEstimate,
  craneTypeLabel,
  formatMoney,
  isPlatformType,
  PRICING_OPTION_LABELS,
  PRIORITY_OPTIONS,
} from '../crane';

export const createSchema = z.object({
  crane_type: z.string().min(1, 'Lütfen bir ekipman seçin'),
  pricing_option: z.string().min(1, 'Lütfen süre / fiyatlandırma seçin'),
  days: z.string().refine((v) => v === '' || Number(v) >= 1, 'En az 1 olmalıdır'),
  needs_rigger: z.boolean(),
  job_no: z.string().min(1, 'Lütfen iş emri seçin'),
  needed_date: z.string().min(1, 'Lütfen ihtiyaç tarihini seçin'),
  needed_time: z.string(),
  location: z.string(),
  priority: z.string(),
  description: z.string(),
  files: z.array(z.instanceof(File)),
});

export type CreateFormValues = z.infer<typeof createSchema>;

const INITIAL: CreateFormValues = {
  crane_type: '',
  pricing_option: '',
  days: '1',
  needs_rigger: false,
  job_no: '',
  needed_date: '',
  needed_time: '',
  location: '',
  priority: 'normal',
  description: '',
  files: [],
};

export interface CraneRequestCreateModalProps {
  craneTypes: CraneType[];
  jobOrders: JobOrderOption[];
  onClose: () => void;
  onCreated: () => void;
}

/** Port of showCreateModal / setupCreateModalDynamics / handleCreateRequest in list.js. */
export function CraneRequestCreateModal({
  craneTypes,
  jobOrders,
  onClose,
  onCreated,
}: CraneRequestCreateModalProps) {
  const form = useForm<CreateFormValues>({
    initialValues: INITIAL,
    validate: zod4Resolver(createSchema),
  });
  const create = useCreateCraneRequest();
  const { values } = form;

  const type = craneTypes.find((t) => String(t.id) === values.crane_type) ?? null;
  const rate = type?.current_rate;
  const pricingOptions = type ? availablePricingOptions(rate) : [];
  const isPlatform = isPlatformType(type);
  const showDays = Boolean(type) && isPlatform;
  const showRigger =
    Boolean(type) && !isPlatform && rate?.rigger_fee !== null && rate?.rigger_fee !== undefined;
  // A rigger ticked for a crane and then hidden by picking a platform is not wanted.
  const needsRigger = showRigger && values.needs_rigger;
  const estimate =
    type && values.pricing_option
      ? computeCraneEstimate(
          type,
          values.pricing_option,
          Number.parseInt(values.days, 10) || 1,
          needsRigger,
        )
      : null;

  const pickType = (value: string | null) => {
    const next = craneTypes.find((t) => String(t.id) === value) ?? null;
    const available = next ? availablePricingOptions(next.current_rate) : [];
    const previous = form.getValues().pricing_option;
    form.setFieldValue('crane_type', value ?? '');
    form.setFieldValue(
      'pricing_option',
      available.includes(previous) ? previous : (available[0] ?? ''),
    );
  };

  const save = async (v: CreateFormValues) => {
    try {
      const result = await create.mutateAsync({
        crane_type: v.crane_type,
        pricing_option: v.pricing_option,
        job_no: v.job_no,
        days: Number.parseInt(v.days, 10) || 1,
        needs_rigger: needsRigger,
        needed_date: v.needed_date,
        needed_time: v.needed_time || null,
        location: v.location,
        description: v.description,
        priority: v.priority || 'normal',
        files: v.files,
      });
      notify.success(`Vinç talebi oluşturuldu: ${result?.request_number ?? ''}`);
      onCreated();
      onClose();
    } catch (error) {
      notify.error(`Talep oluşturulurken hata oluştu: ${craneErrorText(error)}`);
    }
  };

  const pricingPlaceholder = !type
    ? 'Önce ekipman seçin'
    : pricingOptions.length === 0
      ? 'Bu ekipman için fiyat tanımlı değil'
      : undefined;

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Yeni Vinç Talebi"
      icon="fas fa-plus-circle"
      size="lg"
      submitLabel="Oluştur"
      submitting={create.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Ekipman ve Süre" icon="fas fa-truck-pickup">
        <Grid gap="sm">
          <Grid.Col span={12}>
            <Select
              label="Ekipman"
              withAsterisk
              searchable
              placeholder="Vinç / platform seçin"
              description="Kiralanacak vinç veya platform tipi"
              data={craneTypes.map((t) => ({ value: String(t.id), label: craneTypeLabel(t) }))}
              {...form.getInputProps('crane_type')}
              onChange={pickType}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Süre / Fiyatlandırma"
              withAsterisk
              allowDeselect={false}
              placeholder={pricingPlaceholder}
              description="Seçilen ekipmanın sunduğu süre seçenekleri"
              data={pricingOptions.map((o) => ({ value: o, label: PRICING_OPTION_LABELS[o] ?? o }))}
              disabled={pricingOptions.length === 0}
              {...form.getInputProps('pricing_option')}
            />
          </Grid.Col>
          {showDays ? (
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                type="number"
                min={1}
                label="Gün Sayısı"
                description="Günlük kiralamada gün sayısı"
                {...form.getInputProps('days')}
              />
            </Grid.Col>
          ) : null}
          {showRigger ? (
            <Grid.Col span={12}>
              <Checkbox
                label="İlave sapancı istiyorum"
                {...form.getInputProps('needs_rigger', { type: 'checkbox' })}
              />
            </Grid.Col>
          ) : null}
        </Grid>
      </ModalSection>

      <ModalSection title="İş ve Zamanlama" icon="fas fa-clipboard-list">
        <Grid gap="sm">
          <Grid.Col span={12}>
            <Select
              label="İş Emri"
              withAsterisk
              searchable
              limit={200}
              placeholder="İş no seçin"
              description="Kiralama maliyetinin işleneceği iş emri"
              data={jobOrders.map((j) => ({ value: j.job_no, label: `${j.job_no} - ${j.title}` }))}
              {...form.getInputProps('job_no')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              type="date"
              label="İhtiyaç Tarihi"
              withAsterisk
              {...form.getInputProps('needed_date')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput type="time" label="Saat" {...form.getInputProps('needed_time')} />
          </Grid.Col>
          <Grid.Col span={12}>
            <TextInput
              label="Konum / Saha"
              placeholder="Örn: Saha 2, montaj alanı"
              description="Vincin çalışacağı yer (opsiyonel)"
              {...form.getInputProps('location')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Öncelik"
              allowDeselect={false}
              data={PRIORITY_OPTIONS}
              {...form.getInputProps('priority')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Açıklama"
              rows={3}
              description="Yapılacak iş hakkında kısa açıklama (opsiyonel)"
              {...form.getInputProps('description')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <FileDropInput
              label="Dosyalar"
              multiple
              clearable
              description="Ek dosyalar (opsiyonel)"
              leftSection={<FaIcon icon="fas fa-paperclip" />}
              {...form.getInputProps('files')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>

      <Box
        data-testid="crane-estimate-panel"
        mt="md"
        p="md"
        style={{
          background: 'var(--mantine-color-blue-0)',
          border: '1px solid var(--mantine-color-blue-2)',
          borderRadius: 8,
        }}
      >
        <Text fw={600} c="blue.8" mb={6} size="sm">
          <FaIcon icon="fas fa-calculator" style={{ marginRight: 8 }} />
          Tahmini Maliyet
        </Text>
        {estimate ? (
          <>
            {estimate.lines.map((line) => (
              <Group key={line.label} justify="space-between" fz="sm">
                <span>{line.label}</span>
                <span>{formatMoney(line.amount, '')}</span>
              </Group>
            ))}
            <Group
              justify="space-between"
              fw={700}
              c="blue.8"
              mt={6}
              pt={6}
              style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}
            >
              <span>Tahmini Toplam</span>
              <span>{formatMoney(estimate.total, estimate.currency)}</span>
            </Group>
            <Text size="xs" c="dimmed" mt={4}>
              Fiyat listesine göre tahmindir; KDV hariçtir. Kesin tutar tamamlanınca girilir.
            </Text>
          </>
        ) : (
          <Text size="sm" c="dimmed">
            Ekipman ve süre seçtiğinizde tahmini maliyet burada görünür.
          </Text>
        )}
      </Box>
    </FormModal>
  );
}
