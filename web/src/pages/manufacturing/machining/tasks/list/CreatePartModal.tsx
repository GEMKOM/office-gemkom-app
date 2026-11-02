import {
  ActionIcon,
  Button,
  Checkbox,
  Collapse,
  Grid,
  Group,
  Modal,
  NumberInput,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { useMemo, useState } from 'react';
import {
  createPart,
  type MachiningPart,
  type OperationInput,
  type PartInput,
} from '@/api/manufacturing/machiningParts';
import type { MachineDropdownOption } from '@/api/manufacturing/finishedTimers';
import {
  DataTable,
  FaIcon,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalSection,
  modalClassNames,
  notify,
  type CellEdit,
  type DataTableColumn,
} from '@/ui';
import {
  allocationError,
  allocationRows,
  allocationsEmpty,
  allocationValue,
  JobAllocationsEditor,
  type AllocationRow,
} from './allocations';
import { formatPlanStamp } from './planFormat';

/** One row of the "Operasyonlar" editor (legacy addOperationRow). */
export interface NewOperationRow {
  id: string;
  order: number | null;
  name: string;
  description: string;
  machine: string;
  estimated_hours: number | null;
  interchangeable: boolean;
}

let opSequence = 0;
function newOperation(order: number): NewOperationRow {
  return {
    id: `op-${++opSequence}`,
    order,
    name: '',
    description: '',
    machine: '',
    estimated_hours: null,
    interchangeable: false,
  };
}

interface CreatePartModalProps {
  opened: boolean;
  onClose: () => void;
  machines: MachineDropdownOption[];
  onCreated: () => void;
}

/** Port of #createPartModal ("Yeni Parça Oluştur"). Mounted fresh on every open, like the legacy form reset. */
export function CreatePartModal({ opened, onClose, machines, onCreated }: CreatePartModalProps) {
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [imageNo, setImageNo] = useState('');
  const [positionNo, setPositionNo] = useState('');
  const [finishTime, setFinishTime] = useState('');
  const [description, setDescription] = useState('');
  const [material, setMaterial] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [weightKg, setWeightKg] = useState<number | string>('');
  // "Malzeme ve Özellikler" starts collapsed on every open.
  const [materialOpen, setMaterialOpen] = useState(false);
  const [allocations, setAllocations] = useState<AllocationRow[]>(() => allocationRows([]));
  const [allocError, setAllocError] = useState<string | null>(null);
  const [operations, setOperations] = useState<NewOperationRow[]>(() => [newOperation(1)]);
  const [saving, setSaving] = useState(false);

  const machineOptions = useMemo(
    () => machines.map((m) => ({ value: String(m.id), label: m.name })),
    [machines],
  );

  const columns = useMemo<DataTableColumn<NewOperationRow>[]>(
    () => [
      { key: 'order', header: 'Sıra', width: '8%', editable: { type: 'number', min: 1, step: 1 } },
      {
        key: 'name',
        header: 'Operasyon Adı *',
        width: '20%',
        editable: { placeholder: 'Operasyon adı' },
      },
      {
        key: 'description',
        header: 'Açıklama',
        width: '20%',
        editable: { placeholder: 'Açıklama' },
      },
      {
        key: 'machine',
        header: 'Makine *',
        width: '18%',
        editable: {
          type: 'select',
          options: [{ value: '', label: 'Makine seçin...' }, ...machineOptions],
        },
        render: (row) =>
          machineOptions.find((o) => o.value === row.machine)?.label ?? (
            <Text span size="sm" c="dimmed">
              Makine seçin...
            </Text>
          ),
      },
      {
        key: 'estimated_hours',
        header: 'Tahmini Saat',
        width: '12%',
        editable: { type: 'number', min: 0, step: 0.01, placeholder: '0.00' },
      },
      {
        key: 'interchangeable',
        header: 'Değiştirilebilir',
        width: '10%',
        render: (row) => (
          <Checkbox
            aria-label="Değiştirilebilir"
            checked={row.interchangeable}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              setOperations((rows) =>
                rows.map((r) => (r.id === row.id ? { ...r, interchangeable: checked } : r)),
              );
            }}
          />
        ),
      },
      {
        key: 'actions',
        header: 'İşlem',
        width: '12%',
        render: (row) => (
          <ActionIcon
            variant="default"
            color="red"
            title="Kaldır"
            aria-label="Operasyonu kaldır"
            onClick={() =>
              // Removing renumbers every row (legacy updateOperationOrders).
              setOperations((rows) =>
                rows.filter((r) => r.id !== row.id).map((r, i) => ({ ...r, order: i + 1 })),
              )
            }
          >
            <FaIcon icon="fas fa-trash" />
          </ActionIcon>
        ),
      },
    ],
    [machineOptions],
  );

  const editOperation = ({ rowId, columnKey, value }: CellEdit<NewOperationRow>) => {
    setOperations((rows) =>
      // Text and select editors hand over a string, number editors a number or null.
      rows.map((r) => (r.id === rowId ? { ...r, [columnKey]: value } : r)),
    );
  };

  const save = async () => {
    // Legacy form.checkValidity(): the part name, and each operation row's
    // order, name and machine are required.
    if (!name.trim()) {
      setNameError('Parça adı zorunludur');
      return;
    }
    const invalid = operations.findIndex(
      (op) => op.order === null || op.order < 1 || !op.name.trim() || !op.machine,
    );
    if (invalid !== -1) {
      notify.error(`Satır ${invalid + 1}: Sıra, operasyon adı ve makine zorunludur`);
      return;
    }

    const data: PartInput = {
      name,
      description: description || null,
      image_no: imageNo || null,
      position_no: positionNo || null,
      material: material || null,
      dimensions: dimensions || null,
      weight_kg: weightKg !== '' ? Number.parseFloat(String(weightKg)) : null,
      finish_time: finishTime || null,
      operations: [],
    };

    // With a job order picked send job_allocations; with none keep the legacy
    // shape so a part without a job order stays creatable.
    if (!allocationsEmpty(allocations)) {
      const error = allocationError(allocations);
      if (error) {
        setAllocError(error);
        notify.error(error);
        return;
      }
      data.job_allocations = allocationValue(allocations);
    } else {
      const first = allocations[0];
      const qty = first && first.quantity !== '' ? first.quantity : null;
      data.job_no = null;
      data.quantity = qty !== null && Number.isInteger(qty) && qty > 0 ? qty : null;
    }

    if (operations.length === 0) {
      notify.error('En az bir operasyon eklenmelidir');
      return;
    }
    const ops: OperationInput[] = operations
      .map((op) => ({
        name: op.name,
        description: op.description || null,
        order: op.order || 1,
        machine_fk: Number.parseInt(op.machine, 10),
        estimated_hours: op.estimated_hours,
        interchangeable: op.interchangeable,
      }))
      .filter((op) => op.name && op.machine_fk);
    if (ops.length === 0) {
      notify.error('En az bir geçerli operasyon eklenmelidir');
      return;
    }
    data.operations = ops;

    setSaving(true);
    try {
      const created = await createPart(data);
      notify.success(createdMessage(created, machines));
      onClose();
      onCreated();
    } catch (error) {
      notify.error(
        `Parça oluşturulurken hata oluştu: ${error instanceof Error && error.message ? error.message : 'Bilinmeyen hata'}`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (!saving) onClose();
      }}
      size="xl"
      withCloseButton={false}
      classNames={modalClassNames}
    >
      <ModalHeader title="Yeni Parça Oluştur" icon="fas fa-plus-circle" />
      <ModalBody>
        <ModalSection title="Temel Bilgiler" icon="fas fa-info-circle">
          <Grid gap="sm">
            <Grid.Col span={{ base: 12, md: 5 }}>
              <TextInput
                label="Parça Adı *"
                placeholder="Parça adını girin"
                description="Parçayı tanımlayan açıklayıcı isim"
                inputWrapperOrder={['label', 'input', 'description', 'error']}
                value={name}
                error={nameError}
                onChange={(event) => {
                  setName(event.currentTarget.value);
                  setNameError(null);
                }}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 6, md: 2 }}>
              <TextInput
                label="Resim No"
                placeholder="Resim no"
                description="Teknik çizim (ops.)"
                inputWrapperOrder={['label', 'input', 'description', 'error']}
                value={imageNo}
                onChange={(event) => setImageNo(event.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 6, md: 2 }}>
              <TextInput
                label="Pozisyon No"
                placeholder="Poz no"
                description="Montaj pozisyonu (ops.)"
                inputWrapperOrder={['label', 'input', 'description', 'error']}
                value={positionNo}
                onChange={(event) => setPositionNo(event.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 3 }}>
              <TextInput
                type="date"
                label="Bitiş Tarihi"
                description="Planlanan bitiş tarihi (ops.)"
                inputWrapperOrder={['label', 'input', 'description', 'error']}
                value={finishTime}
                onChange={(event) => setFinishTime(event.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={12}>
              <Text size="sm" fw={500} mb={4}>
                İş Emri ve Adet
              </Text>
              <JobAllocationsEditor
                rows={allocations}
                error={allocError}
                onChange={(rows) => {
                  setAllocations(rows);
                  setAllocError(null);
                }}
              />
              <Text size="xs" c="dimmed" mt={4}>
                Parça birden fazla iş emrine bölünebilir; adet iş emri başına girilir (opsiyonel)
              </Text>
            </Grid.Col>
            <Grid.Col span={12}>
              <Textarea
                label="Açıklama"
                placeholder="Parça hakkında ek bilgiler..."
                description="Parça ile ilgili özel notlar (opsiyonel)"
                inputWrapperOrder={['label', 'input', 'description', 'error']}
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
            </Grid.Col>
          </Grid>
        </ModalSection>

        <ModalSection>
          <UnstyledButton
            onClick={() => setMaterialOpen((o) => !o)}
            aria-expanded={materialOpen}
            aria-controls="part-material-section"
          >
            <Group gap={6}>
              <FaIcon icon="fas fa-cogs" />
              <Text fw={600} size="sm">
                Malzeme ve Özellikler
              </Text>
              <Text size="xs" c="dimmed">
                (opsiyonel)
              </Text>
              <FaIcon icon={materialOpen ? 'fas fa-chevron-up' : 'fas fa-chevron-down'} />
            </Group>
          </UnstyledButton>
          <Collapse expanded={materialOpen} id="part-material-section">
            <Grid gap="sm" pt="xs">
              <Grid.Col span={{ base: 12, md: 4 }}>
                <TextInput
                  label="Malzeme"
                  placeholder="Malzeme türü"
                  description="Kullanılacak malzeme"
                  inputWrapperOrder={['label', 'input', 'description', 'error']}
                  value={material}
                  onChange={(event) => setMaterial(event.currentTarget.value)}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <TextInput
                  label="Boyutlar"
                  placeholder="Örn: 100x50x25"
                  description="Parça boyutları"
                  inputWrapperOrder={['label', 'input', 'description', 'error']}
                  value={dimensions}
                  onChange={(event) => setDimensions(event.currentTarget.value)}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <NumberInput
                  label="Ağırlık (kg)"
                  placeholder="0.000"
                  description="Parça ağırlığı"
                  inputWrapperOrder={['label', 'input', 'description', 'error']}
                  min={0}
                  step={0.001}
                  decimalScale={3}
                  value={weightKg}
                  onChange={setWeightKg}
                />
              </Grid.Col>
            </Grid>
          </Collapse>
        </ModalSection>

        <ModalSection
          title="Operasyonlar *"
          icon="fas fa-tasks"
          description="Parça için en az bir operasyon eklenmelidir."
        >
          <Group justify="flex-end" mb="xs">
            <Button
              size="xs"
              variant="default"
              leftSection={<FaIcon icon="fas fa-plus" />}
              onClick={() => setOperations((rows) => [...rows, newOperation(rows.length + 1)])}
            >
              Operasyon Ekle
            </Button>
          </Group>
          <DataTable
            data={operations}
            columns={columns}
            getRowId={(row) => row.id}
            onCellEdit={editOperation}
            emptyMessage="Operasyon yok"
            withColumnBorders
          />
        </ModalSection>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="default"
          onClick={onClose}
          disabled={saving}
          leftSection={<FaIcon icon="fas fa-times" />}
        >
          İptal
        </Button>
        <Button
          onClick={() => void save()}
          loading={saving}
          leftSection={<FaIcon icon="fas fa-save" />}
        >
          Parça Oluştur
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/** "Parça oluşturuldu: PT-1 · Plana eklendi: 18.09.2026 08:00 (Makine)". */
function createdMessage(created: MachiningPart, machines: MachineDropdownOption[]): string {
  const ops = Array.isArray(created.operations)
    ? [...created.operations].sort((a, b) => (a.order || 0) - (b.order || 0))
    : [];
  const first = ops[0];
  let message = `Parça oluşturuldu: ${created.key || '-'}`;
  if (first?.planned_start_ms) {
    const machine =
      first.machine_name || machines.find((m) => m.id === first.machine_fk)?.name || '';
    message += ` · Plana eklendi: ${formatPlanStamp(first.planned_start_ms, true)}${machine ? ` (${machine})` : ''}`;
  }
  return message;
}
