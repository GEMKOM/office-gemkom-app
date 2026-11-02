import { Select, Stack, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import {
  supplierReadErrorMessage,
  useSetSupplierStatus,
  type Supplier,
} from '@/api/procurement/suppliers';
import { FormModal, ModalSection, notify } from '@/ui';
import { SUPPLIER_STATUS_META } from './supplierBadges';

const statusSchema = z.object({
  status: z.string().min(1, 'Bu alan gereklidir'),
  reason: z.string(),
});

type StatusFormValues = z.infer<typeof statusSchema>;

const STATUS_OPTIONS = Object.entries(SUPPLIER_STATUS_META).map(([value, meta]) => ({
  value,
  label: meta.label,
}));

export interface SupplierStatusModalProps {
  supplier: Supplier;
  onClose: () => void;
}

/** Port of the status-change EditModal (approved / watch / blacklisted with a reason). */
export function SupplierStatusModal({ supplier, onClose }: SupplierStatusModalProps) {
  const form = useForm<StatusFormValues>({
    initialValues: { status: supplier.status || 'approved', reason: '' },
    validate: zod4Resolver(statusSchema),
  });
  const setStatus = useSetSupplierStatus();

  const save = async (values: StatusFormValues) => {
    const reason = values.reason.trim();
    if (!values.status) {
      notify.error('Lütfen bir durum seçin');
      return;
    }
    try {
      await setStatus.mutateAsync({ id: supplier.id, status: values.status, reason });
      notify.success('Tedarikçi durumu güncellendi');
      onClose();
    } catch (error) {
      const message = supplierReadErrorMessage(
        error,
        'Tedarikçi durumu güncellenirken hata oluştu',
      );
      notify.error(`Durum güncellenirken hata oluştu: ${message}`);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Tedarikçi Durumu Değiştir"
      subtitle={supplier.name || undefined}
      icon="fas fa-shield-halved"
      size="md"
      submitting={setStatus.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Durum" icon="fas fa-shield-halved">
        <Stack gap="sm">
          <Select
            label="Durum"
            data={STATUS_OPTIONS}
            allowDeselect={false}
            withAsterisk
            {...form.getInputProps('status')}
          />
          <Textarea
            label="Gerekçe"
            rows={3}
            placeholder="Durum değişikliği gerekçesi (özellikle kara liste için önerilir)"
            {...form.getInputProps('reason')}
          />
        </Stack>
      </ModalSection>
    </FormModal>
  );
}
