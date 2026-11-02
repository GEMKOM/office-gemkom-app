import { Grid, Select, Textarea, TextInput } from '@mantine/core';
import { useState } from 'react';
import {
  createAttendanceHrRecord,
  patchAttendanceHrRecord,
  type AttendanceRecord,
} from '@/api/human_resources/userAttendance';
import { FormModal, ModalSection, notify } from '@/ui';
import { isoToLocalTime, LEAVE_TYPE_OPTIONS, normalizeTime, timeOnDateToIso } from '../userForm';
import { checkIn, checkOut } from './attendanceFormat';

const DAY_TYPE_OPTIONS = [
  { value: 'working', label: 'Çalışma Günü' },
  { value: 'weekend', label: 'Hafta Sonu' },
  { value: 'public_holiday', label: 'Resmi Tatil' },
  { value: 'leave', label: 'İzin' },
];

export interface AttendanceRecordModalProps {
  userId: number;
  /** YYYY-MM-DD */
  date: string;
  record: AttendanceRecord | null;
  /** The shift rule's times, filled into an empty time field on focus. */
  shiftStart: string;
  shiftEnd: string;
  onSaved: () => Promise<unknown> | void;
  onClose: () => void;
}

/**
 * Port of the "PDKS Kaydı" modal: adds or edits the HR record of one day.
 * Times only count on a working day; a leave day needs a leave type and
 * clears the times. (Legacy sends no day type for weekends and holidays,
 * only the note; so does this.)
 */
export function AttendanceRecordModal({
  userId,
  date,
  record,
  shiftStart,
  shiftEnd,
  onSaved,
  onClose,
}: AttendanceRecordModalProps) {
  const [dayType, setDayType] = useState('working');
  const [leaveType, setLeaveType] = useState('');
  const [inTime, setInTime] = useState(record ? isoToLocalTime(checkIn(record)) : '');
  const [outTime, setOutTime] = useState(record ? isoToLocalTime(checkOut(record)) : '');
  const [notes, setNotes] = useState(record?.notes || '');
  const [submitting, setSubmitting] = useState(false);

  const isWorking = dayType === 'working';
  const isLeave = dayType === 'leave';

  const changeDayType = (value: string | null) => {
    const next = value ?? 'working';
    setDayType(next);
    if (next !== 'leave') setLeaveType('');
    if (next !== 'working') {
      setInTime('');
      setOutTime('');
    }
  };

  const save = async () => {
    const checkInIso = isWorking ? timeOnDateToIso(date, inTime) : null;
    const checkOutIso = isWorking ? timeOnDateToIso(date, outTime) : null;
    if (isWorking && !checkInIso && !checkOutIso) {
      notify.warning('En az bir alan giriniz (Giriş veya Çıkış).');
      return;
    }
    if (isLeave && !leaveType) {
      notify.warning('Lütfen izin türü seçiniz.');
      return;
    }

    setSubmitting(true);
    try {
      if (record?.id) {
        const patch: Record<string, unknown> = {};
        if (isWorking) {
          if (checkInIso) patch.check_in_time = checkInIso;
          if (checkOutIso) patch.check_out_time = checkOutIso;
        }
        if (isLeave) {
          patch.leave_type = leaveType;
          patch.check_in_time = null;
          patch.check_out_time = null;
        }
        if (notes) patch.notes = notes;
        await patchAttendanceHrRecord(record.id, patch);
        notify.success('PDKS kaydı güncellendi');
      } else {
        const payload: Record<string, unknown> = { user: userId, date };
        if (isWorking) {
          if (checkInIso) payload.check_in_time = checkInIso;
          if (checkOutIso) payload.check_out_time = checkOutIso;
        }
        if (isLeave) payload.leave_type = leaveType;
        if (notes) payload.notes = notes;
        await createAttendanceHrRecord(payload);
        notify.success('PDKS kaydı oluşturuldu');
      }
      await onSaved();
      onClose();
    } catch (error) {
      notify.error(`Kaydedilemedi: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const fillOnFocus = (value: string, set: (v: string) => void, fallback: string) => () => {
    if (value) return;
    const time = normalizeTime(fallback);
    if (time) set(time);
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="PDKS Kaydı"
      subtitle={date}
      icon="fas fa-calendar-check"
      submitting={submitting}
      onSubmit={() => void save()}
    >
      <ModalSection title="Kayıt" icon="fas fa-edit">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput label="Tarih" type="date" value={date} readOnly />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Select
              label="Gün Türü"
              data={DAY_TYPE_OPTIONS}
              allowDeselect={false}
              value={dayType}
              onChange={changeDayType}
            />
          </Grid.Col>
          {isLeave ? (
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Select
                label="İzin Türü"
                placeholder="Seçiniz..."
                data={LEAVE_TYPE_OPTIONS}
                value={leaveType || null}
                onChange={(v) => setLeaveType(v ?? '')}
              />
            </Grid.Col>
          ) : null}
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput
              label="Giriş"
              type="time"
              step={1}
              disabled={!isWorking}
              value={inTime}
              onChange={(e) => setInTime(e.currentTarget.value)}
              onFocus={fillOnFocus(inTime, setInTime, shiftStart)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput
              label="Çıkış"
              type="time"
              step={1}
              disabled={!isWorking}
              value={outTime}
              onChange={(e) => setOutTime(e.currentTarget.value)}
              onFocus={fillOnFocus(outTime, setOutTime, shiftEnd)}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Not (opsiyonel)"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.currentTarget.value)}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}
