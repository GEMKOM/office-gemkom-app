import { Stack, TextInput, Textarea } from '@mantine/core';
import { useState } from 'react';
import { holdJobOrder, reviseTargetCompletionDate } from '@/api/projects/jobOrders';
import { FormModal, ModalSection, notify } from '@/ui';
import { joinedErrorMessage } from './JobOrderFormModal';

// The two small forms behind the list's actions: Beklet (holdJobOrderModal)
// and Hedef Tarih Revize Et (targetDateRevisionModal).

export function HoldJobOrderModal({
  jobNo,
  onClose,
  onDone,
}: {
  jobNo: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const response = await holdJobOrder(jobNo, reason ? { reason } : {});
      if (response?.status !== 'success') throw new Error('İş emri bekletilemedi');
      notify.success(response.message || 'İş emri beklemede');
      onDone();
      onClose();
    } catch (error) {
      notify.error(joinedErrorMessage(error, 'İş emri bekletilirken hata oluştu'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="İş Emrini Beklet"
      subtitle={jobNo}
      icon="fas fa-pause"
      size="md"
      submitLabel="Beklet"
      submitIcon="fas fa-pause"
      submitting={saving}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <ModalSection title="Bekletme Nedeni">
        <Textarea
          label="Bekletme Nedeni (Opsiyonel)"
          description="İş emrinin neden bekletildiğini açıklayın"
          rows={4}
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
        />
      </ModalSection>
    </FormModal>
  );
}

export function TargetDateRevisionModal({
  jobNo,
  currentDate,
  onClose,
  onDone,
}: {
  jobNo: string;
  currentDate: string | null | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const [date, setDate] = useState(currentDate ? String(currentDate).split('T')[0]! : '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const targetDate = date.trim();
    const changeReason = reason.trim();
    if (!targetDate) {
      notify.error('Yeni hedef tarih gereklidir');
      return;
    }
    if (!changeReason) {
      notify.error('Değişiklik nedeni gereklidir');
      return;
    }
    setSaving(true);
    try {
      await reviseTargetCompletionDate(jobNo, {
        target_completion_date: targetDate,
        target_date_change_reason: changeReason,
      });
      notify.success('Hedef tarih revizesi kaydedildi');
      onDone();
      onClose();
    } catch (error) {
      notify.error(joinedErrorMessage(error, 'Hedef tarih revizesi kaydedilirken hata oluştu'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Hedef Tarih Revize Et"
      subtitle={jobNo}
      icon="fas fa-calendar-check"
      size="md"
      submitting={saving}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <ModalSection title="Hedef Tarih Revizesi">
        <Stack gap="sm">
          <TextInput
            type="date"
            label="Yeni Hedef Tamamlanma Tarihi"
            value={date}
            onChange={(event) => setDate(event.currentTarget.value)}
          />
          <Textarea
            label="Değişiklik Nedeni"
            placeholder="Örn: Tedarik gecikmesi"
            withAsterisk
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
          />
        </Stack>
      </ModalSection>
    </FormModal>
  );
}
