import { Checkbox, Grid, TextInput } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  markSchedulePaid,
  purchaseOrderKeys,
  type PaymentSchedule,
} from '@/api/procurement/purchaseOrders';
import { formatDate } from '@/lib/format';
import { FormModal, notify } from '@/ui';
import { money } from '../shared';
import { schedulePayable } from './orderParts';

/** Legacy markPaidEditModal: confirm one instalment as paid, with or without its VAT. */
export function MarkPaidModal({
  orderId,
  schedule,
  onClose,
}: {
  orderId: number;
  schedule: PaymentSchedule;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [withTax, setWithTax] = useState(true);
  const mark = useMutation({
    mutationFn: () => markSchedulePaid(orderId, schedule.id, withTax),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.all }),
  });

  const save = async () => {
    try {
      await mark.mutateAsync();
      notify.success('Ödeme başarıyla işaretlendi.');
      onClose();
    } catch (error) {
      notify.error(error, { fallback: 'Ödeme işaretlenirken hata oluştu.' });
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Ödeme İşaretle"
      icon="fas fa-check-circle"
      size="lg"
      submitLabel="Ödeme İşaretle"
      submitting={mark.isPending}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Grid gap="sm">
        <Grid.Col span={12}>
          <TextInput label="Ödeme planı" value={schedule.label ?? ''} readOnly />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <TextInput
            label="Ödeme tutarı"
            value={money(schedulePayable(schedule, withTax), schedule.currency)}
            readOnly
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <TextInput label="Para birimi" value={schedule.currency ?? ''} readOnly />
        </Grid.Col>
        <Grid.Col span={12}>
          <TextInput label="Vade tarihi" value={formatDate(schedule.due_date)} readOnly />
        </Grid.Col>
        <Grid.Col span={12}>
          <Checkbox
            label="KDV dahil ödeme yapıldı"
            description="İşaretliyse ödeme KDV dahil olarak işaretlenir."
            checked={withTax}
            onChange={(event) => setWithTax(event.currentTarget.checked)}
          />
        </Grid.Col>
      </Grid>
    </FormModal>
  );
}
