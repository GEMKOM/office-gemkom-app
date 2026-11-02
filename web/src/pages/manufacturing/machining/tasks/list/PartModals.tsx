import {
  Button,
  Modal,
  NativeSelect,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { machiningOperatorsQueryOptions } from '@/api/general/overtime';
import type { MachineDropdownOption } from '@/api/manufacturing/finishedTimers';
import {
  convertPartsToDepartmentRequest,
  createManualTimeEntry,
  updatePart,
  type MachiningPart,
} from '@/api/manufacturing/machiningParts';
import { FaIcon, ModalBody, ModalFooter, ModalHeader, modalClassNames, notify } from '@/ui';
import {
  allocationError,
  allocationRows,
  allocationValue,
  firstApiMessage,
  getPartAllocations,
  JobAllocationsEditor,
  type AllocationRow,
} from './allocations';
import { toDateTimeLocal } from './planFormat';

// ---- İş Emri Dağılımı (#partAllocationsModal) ---------------------------------

interface PartAllocationsModalProps {
  part: MachiningPart;
  onClose: () => void;
  /** The PATCH response, to merge into the cached row. */
  onSaved: (updated: MachiningPart) => void;
}

export function PartAllocationsModal({ part, onClose, onSaved }: PartAllocationsModalProps) {
  const [rows, setRows] = useState<AllocationRow[]>(() =>
    allocationRows(
      getPartAllocations(part).map((a) => ({ job_no: a.job_no, quantity: a.quantity })),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const validation = allocationError(rows);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    try {
      const updated = await updatePart(part.key, { job_allocations: allocationValue(rows) });
      onSaved(updated);
      onClose();
      notify.success('İş emri dağılımı güncellendi');
    } catch (err) {
      const message = firstApiMessage(err, 'İş emri dağılımı güncellenirken hata oluştu');
      setError(message);
      notify.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened onClose={onClose} size="lg" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader title="İş Emri Dağılımı" icon="fas fa-sitemap" />
      <ModalBody>
        <Text size="sm" c="dimmed" mb="xs">
          Parça:{' '}
          <strong>
            {part.key}
            {part.name ? ` - ${part.name}` : ''}
          </strong>
        </Text>
        <JobAllocationsEditor
          rows={rows}
          error={error}
          onChange={(next) => {
            setRows(next);
            setError(null);
          }}
        />
      </ModalBody>
      <ModalFooter>
        <Button variant="default" onClick={onClose} leftSection={<FaIcon icon="fas fa-times" />}>
          İptal
        </Button>
        <Button
          onClick={() => void save()}
          loading={saving}
          leftSection={<FaIcon icon="fas fa-save" />}
        >
          Kaydet
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ---- Departman Talebine Dönüştür (#convertDepartmentRequestModal) ------------

function itemDescription(part: MachiningPart): string {
  return [part.image_no, part.position_no].filter(Boolean).join(' / ');
}

interface ConvertModalProps {
  parts: MachiningPart[];
  onClose: () => void;
  onConverted: () => void;
}

export function ConvertToDepartmentRequestModal({
  parts,
  onClose,
  onConverted,
}: ConvertModalProps) {
  const [title, setTitle] = useState('Parça Talebi');
  const [priority, setPriority] = useState('normal');
  const [neededDate, setNeededDate] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const summary = useMemo(() => {
    const totalLines = parts.reduce((n, p) => n + Math.max(1, getPartAllocations(p).length), 0);
    const distinctJobs = new Set(
      parts.flatMap((p) =>
        getPartAllocations(p)
          .map((a) => a.job_no)
          .filter(Boolean),
      ),
    ).size;
    return distinctJobs > 0
      ? `${distinctJobs} iş emri için ${totalLines} talep kalemi oluşturulacak`
      : `${totalLines} talep kalemi oluşturulacak`;
  }, [parts]);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      notify.warning('Başlık zorunludur');
      return;
    }
    setSubmitting(true);
    try {
      const result = await convertPartsToDepartmentRequest(
        parts.map((p) => p.key),
        {
          title: trimmed,
          priority,
          needed_date: neededDate || null,
          description: description.trim(),
        },
      );
      notify.success(
        <>
          Departman talebi oluşturuldu:{' '}
          <a href={`/general/department-requests/list?request=${result.id}`}>
            {result.request_number}
          </a>
        </>,
        { autoClose: 8000 },
      );
      onClose();
      onConverted();
    } catch (error) {
      notify.error(error, { fallback: 'Dönüştürme başarısız' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal opened onClose={onClose} size="lg" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader title="Departman Talebine Dönüştür" icon="fas fa-exchange-alt" />
      <ModalBody>
        <Text fw={600} size="sm">
          Önizleme
        </Text>
        <Text size="xs" c="dimmed" mb="xs">
          {summary}
        </Text>
        <Table withTableBorder withColumnBorders fz="sm" mb="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ürün Adı</Table.Th>
              <Table.Th>İş No</Table.Th>
              <Table.Th>Miktar</Table.Th>
              <Table.Th>Birim</Table.Th>
              <Table.Th>Açıklama</Table.Th>
              <Table.Th>Dosya</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {parts.map((part) => {
              const allocations = getPartAllocations(part);
              return (
                <Table.Tr key={part.key}>
                  <Table.Td>{part.name || '-'}</Table.Td>
                  <Table.Td>
                    {allocations.length
                      ? allocations.map((a, i) => (
                          <div key={`${a.job_no}-${i}`}>
                            {a.job_no}{' '}
                            <Text span c="dimmed" size="sm">
                              × {a.quantity ?? '-'}
                            </Text>
                          </div>
                        ))
                      : '-'}
                  </Table.Td>
                  <Table.Td>{part.quantity ?? '-'}</Table.Td>
                  <Table.Td>adet</Table.Td>
                  <Table.Td>{itemDescription(part) || '-'}</Table.Td>
                  <Table.Td>{part.files?.length || 0}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
        <Stack gap="sm">
          <TextInput
            label="Başlık *"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
          />
          <NativeSelect
            label="Öncelik"
            value={priority}
            onChange={(e) => setPriority(e.currentTarget.value)}
            data={[
              { value: 'normal', label: 'Normal' },
              { value: 'urgent', label: 'Acil' },
              { value: 'critical', label: 'Kritik' },
            ]}
          />
          <TextInput
            type="date"
            label="İhtiyaç Tarihi"
            value={neededDate}
            onChange={(e) => setNeededDate(e.currentTarget.value)}
          />
          <Textarea
            label="Açıklama"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
          />
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button variant="default" onClick={onClose}>
          İptal
        </Button>
        <Button onClick={() => void submit()} loading={submitting}>
          Oluştur ve Gönder
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ---- Manuel Zaman Girişi (#manualTimeModal) ----------------------------------

interface ManualTimeModalProps {
  operationKey: string;
  machineFk: number | null;
  machines: MachineDropdownOption[];
  onClose: () => void;
  onSaved: () => void;
}

/** Legacy saveManualTimeEntry's error mapping. */
function manualTimeError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (!message) return 'Manuel zaman girişi kaydedilirken hata oluştu';
  if (message.includes('overlap')) {
    return 'Bu makine için belirtilen zaman aralığında başka bir zamanlayıcı mevcut. Lütfen farklı bir zaman aralığı seçin.';
  }
  if (message.includes('not found')) return 'Operasyon bulunamadı';
  if (message.includes('Invalid timestamp')) return 'Geçersiz zaman formatı';
  return message;
}

export function ManualTimeModal({
  operationKey,
  machineFk,
  machines,
  onClose,
  onSaved,
}: ManualTimeModalProps) {
  const operators = useQuery(machiningOperatorsQueryOptions());
  const [operator, setOperator] = useState<string | null>(null);
  const [machine, setMachine] = useState(machineFk ? String(machineFk) : '');
  // Default: the last hour.
  const [start, setStart] = useState(() => toDateTimeLocal(new Date(Date.now() - 60 * 60 * 1000)));
  const [finish, setFinish] = useState(() => toDateTimeLocal(new Date()));
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (operators.isSuccess && operators.data.length === 0)
      notify.error('Operatör listesi yüklenemedi');
  }, [operators.isSuccess, operators.data]);

  const save = async () => {
    // Legacy form.checkValidity(): every field but the comment is required.
    const missing: Record<string, string> = {};
    if (!operator) missing.operator = 'Operatör seçin';
    if (!machine) missing.machine = 'Makine seçin';
    if (!start) missing.start = 'Başlangıç zamanı zorunludur';
    if (!finish) missing.finish = 'Bitiş zamanı zorunludur';
    setErrors(missing);
    if (Object.keys(missing).length) return;

    const startMs = new Date(start).getTime();
    const finishMs = new Date(finish).getTime();
    if (finishMs <= startMs) {
      notify.error('Bitiş zamanı başlangıç zamanından sonra olmalıdır');
      return;
    }
    setSaving(true);
    try {
      const result = await createManualTimeEntry({
        task_key: operationKey,
        // The timer is booked to this operator, not to whoever is logged in.
        user: Number.parseInt(operator!, 10),
        machine_fk: Number.parseInt(machine, 10),
        start_time: startMs,
        finish_time: finishMs,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      if (!result?.id) throw new Error('Unexpected response format');
      notify.success('Manuel zaman girişi başarıyla oluşturuldu');
      onClose();
      onSaved();
    } catch (error) {
      notify.error(manualTimeError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened onClose={onClose} withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader title="Manuel Zaman Girişi" icon="fas fa-clock" />
      <ModalBody>
        <Stack gap="sm">
          <Select
            label="Operatör"
            withAsterisk
            placeholder="Operatör seçin..."
            description="Süre bu operatörün çalışması olarak kaydedilir."
            inputWrapperOrder={['label', 'input', 'description', 'error']}
            searchable
            data={(operators.data ?? []).map((u) => ({
              value: String(u.id),
              label: u.full_name || u.username || String(u.id),
            }))}
            value={operator}
            onChange={setOperator}
            error={errors.operator}
          />
          <NativeSelect
            label="Makine"
            withAsterisk
            value={machine}
            onChange={(e) => setMachine(e.currentTarget.value)}
            data={[
              { value: '', label: 'Makine seçin...' },
              ...machines.map((m) => ({ value: String(m.id), label: m.name })),
            ]}
            error={errors.machine}
          />
          <TextInput
            type="datetime-local"
            label="Başlangıç Zamanı"
            withAsterisk
            description="Operasyonun başladığı tarih ve saat"
            inputWrapperOrder={['label', 'input', 'description', 'error']}
            value={start}
            onChange={(e) => setStart(e.currentTarget.value)}
            error={errors.start}
          />
          <TextInput
            type="datetime-local"
            label="Bitiş Zamanı"
            withAsterisk
            description="Operasyonun bittiği tarih ve saat"
            inputWrapperOrder={['label', 'input', 'description', 'error']}
            value={finish}
            onChange={(e) => setFinish(e.currentTarget.value)}
            error={errors.finish}
          />
          <Textarea
            label="Açıklama"
            rows={3}
            placeholder="Opsiyonel açıklama..."
            value={comment}
            onChange={(e) => setComment(e.currentTarget.value)}
          />
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button variant="default" onClick={onClose} leftSection={<FaIcon icon="fas fa-times" />}>
          İptal
        </Button>
        <Button
          onClick={() => void save()}
          loading={saving}
          leftSection={<FaIcon icon="fas fa-save" />}
        >
          Kaydet
        </Button>
      </ModalFooter>
    </Modal>
  );
}
