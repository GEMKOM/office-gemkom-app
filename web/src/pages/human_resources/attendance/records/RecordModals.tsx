import { Grid, Select, Textarea, TextInput } from '@mantine/core';
import { useState } from 'react';
import {
  usePatchAttendanceRecord,
  useSaveAttendanceSession,
  type AttendanceHrRecord,
  type AttendanceHrSession,
} from '@/api/human_resources/attendanceAdmin';
import { errorMessage, FormModal, ModalSection, notify } from '@/ui';
import {
  RECORD_LEAVE_TYPE_OPTIONS,
  RECORD_STATUS_OPTIONS,
  SESSION_METHOD_OPTIONS,
  SESSION_STATUS_OPTIONS,
  toLocalDateTimeInput,
} from './recordsFormat';

/** "Kayıt Düzenle": status, leave type and notes of one daily record. */
export function RecordEditModal({
  record,
  onClose,
}: {
  record: AttendanceHrRecord;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<string | null>(record.status || null);
  const [leaveType, setLeaveType] = useState<string | null>(record.leave_type || null);
  const [notes, setNotes] = useState(record.notes || '');
  const patch = usePatchAttendanceRecord();

  const save = async () => {
    // Legacy sends the status only when one is chosen; leave type and notes always.
    const data: Record<string, unknown> = {};
    if (status) data.status = status;
    data.leave_type = leaveType || null;
    data.notes = notes;
    try {
      await patch.mutateAsync({ id: record.id, data });
      notify.success('Kayıt güncellendi');
      onClose();
    } catch (error) {
      notify.error(`Güncelleme başarısız: ${errorMessage(error)}`);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Kayıt Düzenle"
      icon="fas fa-edit"
      size="lg"
      submitLabel="Kaydet"
      submitting={patch.isPending}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <ModalSection title="Günlük Kayıt" icon="fas fa-clipboard-list">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <TextInput label="Kullanıcı" value={record.user_display || ''} readOnly />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <TextInput label="İnceleyen" value={record.reviewed_by_display || ''} readOnly />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <TextInput label="Tarih" type="date" value={record.date || ''} readOnly />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Select
              label="Durum"
              placeholder="Seçiniz..."
              data={RECORD_STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
              clearable
              comboboxProps={{ withinPortal: true }}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Select
              label="İzin Türü"
              placeholder="—"
              data={RECORD_LEAVE_TYPE_OPTIONS}
              value={leaveType}
              onChange={setLeaveType}
              clearable
              searchable
              comboboxProps={{ withinPortal: true }}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Notlar"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.currentTarget.value)}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}

export type SessionTarget =
  { type: 'edit'; session: AttendanceHrSession } | { type: 'add'; recordId: number };

/** The "Oturum" modal, shared by edit and add (legacy SESSION_FIELDS). */
export function SessionModal({ target, onClose }: { target: SessionTarget; onClose: () => void }) {
  const session = target.type === 'edit' ? target.session : null;
  const [checkIn, setCheckIn] = useState(toLocalDateTimeInput(session?.check_in_time));
  const [checkOut, setCheckOut] = useState(toLocalDateTimeInput(session?.check_out_time));
  const [method, setMethod] = useState<string | null>(session?.method || 'hr_manual');
  const [status, setStatus] = useState<string | null>(session?.status || 'closed');
  const [reason, setReason] = useState(session?.override_reason || '');
  const saveSession = useSaveAttendanceSession();

  const save = async () => {
    const ci = checkIn.trim();
    if (!ci) {
      notify.error('Giriş saati zorunludur.');
      return;
    }
    const data = {
      check_in_time: ci,
      check_out_time: checkOut.trim() || null,
      method: method || 'hr_manual',
      status: status || 'closed',
      override_reason: reason.trim(),
    };
    try {
      if (target.type === 'edit') {
        await saveSession.mutateAsync({ sessionId: target.session.id, data });
        notify.success('Oturum güncellendi');
      } else {
        await saveSession.mutateAsync({ recordId: target.recordId, data });
        notify.success('Oturum eklendi');
      }
      onClose();
    } catch (error) {
      // Legacy only logged a failed save; the modal stays open with the message.
      notify.error(`Kaydetme başarısız: ${errorMessage(error)}`);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={session ? `Oturum #${session.id} Düzenle` : 'Yeni Oturum Ekle'}
      icon="fas fa-clock"
      size="lg"
      submitLabel="Kaydet"
      submitting={saveSession.isPending}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Grid gap="sm">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <TextInput
            label="Giriş Saati"
            type="datetime-local"
            withAsterisk
            value={checkIn}
            onChange={(event) => setCheckIn(event.currentTarget.value)}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <TextInput
            label="Çıkış Saati"
            type="datetime-local"
            value={checkOut}
            onChange={(event) => setCheckOut(event.currentTarget.value)}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Select
            label="Yöntem"
            data={SESSION_METHOD_OPTIONS}
            value={method}
            onChange={setMethod}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Select
            label="Durum"
            data={SESSION_STATUS_OPTIONS}
            value={status}
            onChange={setStatus}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
          />
        </Grid.Col>
        <Grid.Col span={12}>
          <TextInput
            label="Açıklama"
            placeholder="Override nedeni..."
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
          />
        </Grid.Col>
      </Grid>
    </FormModal>
  );
}
