import {
  Button,
  Grid,
  Group,
  NumberInput,
  Select,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQueryClient } from '@tanstack/react-query';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { z } from 'zod';
import {
  bulkCreateCncParts,
  cncTaskKeys,
  createCncPart,
  deleteCncPart,
  fetchCncParts,
  updateCncPart,
  type CncPart,
  type CncPartInput,
} from '@/api/manufacturing/cncTasks';
import {
  confirm,
  DataTable,
  errorMessage,
  FaIcon,
  FormModal,
  ModalSection,
  notify,
  type DataTableColumn,
  type RowAction,
} from '@/ui';
import { PASTE_HELP } from './CreateCutModal';
import { useJobOrderChoices } from './cutForm';
import { parsePartsFromText, planPastedParts } from './partsPaste';

const dash = (value: unknown) =>
  value === null || value === undefined || value === '' ? '-' : String(value);

export const PART_COLUMNS: DataTableColumn<CncPart>[] = [
  { key: 'job_no', header: 'İş No', sortable: true },
  { key: 'image_no', header: 'Resim No', sortable: true },
  { key: 'position_no', header: 'Pozisyon No', sortable: true },
  {
    key: 'weight_kg',
    header: 'Ağırlık (kg)',
    sortable: true,
    accessor: (p) =>
      p.weight_kg === null || p.weight_kg === undefined ? null : Number(p.weight_kg),
    render: (p) => (p.weight_kg ? `${p.weight_kg} kg` : '-'),
  },
  {
    key: 'quantity',
    header: 'Adet',
    sortable: true,
    render: (p) => (p.quantity !== null && p.quantity !== undefined ? String(p.quantity) : '-'),
  },
];

/** The edit modal's "Parça Yönetimi": paste-to-update, the parts table, add/edit/delete. */
export function PartsManager({ taskKey, parts }: { taskKey: string; parts: readonly CncPart[] }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: cncTaskKeys.all });

  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [preview, setPreview] = useState<CncPartInput[] | null>(null);
  const [processing, setProcessing] = useState(false);
  const [editing, setEditing] = useState<CncPart | 'new' | null>(null);

  const showPreview = () => {
    if (!paste.trim()) {
      notify.warning('Lütfen yapıştırılacak veri girin');
      return;
    }
    const parsed = parsePartsFromText(paste);
    if (!parsed.length) {
      notify.warning('Yapıştırılan veriler ayrıştırılamadı');
      setPreview(null);
      return;
    }
    setPreview(parsed);
  };

  const applyPaste = async () => {
    if (processing) {
      notify.warning('İşlem devam ediyor, lütfen bekleyin...');
      return;
    }
    const parsed = preview?.length ? preview : parsePartsFromText(paste);
    if (!parsed.length) {
      notify.warning('Yapıştırılan veriler ayrıştırılamadı');
      return;
    }
    const ok = await confirm({
      title: 'Parçaları Güncelle',
      icon: 'fas fa-sync-alt',
      message: 'Mevcut parçalar güncellenecek ve yeni parçalar eklenecek',
      description: `${parsed.length} parça güncellenecek/eklenecek. Mevcut parçalar korunacak.`,
      confirmLabel: 'Evet, Güncelle',
      cancelLabel: 'İptal',
    });
    if (!ok) return;

    setProcessing(true);
    try {
      const existing = await fetchCncParts(taskKey);
      const plan = planPastedParts(existing, parsed);
      // Every update and the bulk create go out together.
      const [updates, created] = await Promise.all([
        Promise.allSettled(plan.updates.map((u) => updateCncPart(u.id, u.data))),
        plan.creates.length
          ? bulkCreateCncParts(plan.creates.map((p) => ({ ...p, cnc_task: taskKey }))).then(
              (data) => ({ ok: true as const, data }),
              () => ({ ok: false as const, data: null }),
            )
          : Promise.resolve(null),
      ]);
      const updateCount = updates.filter((r) => r.status === 'fulfilled').length;
      const updateErrors = updates.length - updateCount;
      let createCount = 0;
      let createErrors = 0;
      if (created) {
        if (!created.ok) createErrors = plan.creates.length;
        else if (Array.isArray(created.data)) createCount = created.data.length;
        else {
          const results = (created.data as { results?: unknown } | null)?.results;
          createCount = Array.isArray(results) ? results.length : plan.creates.length;
        }
      }
      const errors = updateErrors + createErrors;

      setPaste('');
      setPreview(null);
      await refresh();

      const messages: string[] = [];
      if (updateCount > 0) messages.push(`${updateCount} parça güncellendi`);
      if (createCount > 0) messages.push(`${createCount} parça eklendi`);
      if (errors > 0) messages.push(`${errors} parça işlenirken hata oluştu`);
      if (errors === 0) notify.success(messages.join(', '));
      else notify.warning(messages.join(', '));
    } catch {
      notify.error('Parçalar güncellenirken hata oluştu');
    } finally {
      setProcessing(false);
    }
  };

  const removePart = async (part: CncPart) => {
    const name = part.job_no ? `İş No: ${part.job_no}` : `Parça (ID: ${part.id})`;
    const ok = await confirm({
      title: 'Parça Silme Onayı',
      icon: 'fas fa-exclamation-triangle',
      message: 'Bu parçayı silmek istediğinize emin misiniz?',
      description: 'Bu işlem geri alınamaz ve parça kalıcı olarak silinecektir.',
      details: (
        <span>
          <strong>Parça:</strong> {name}
        </span>
      ),
      confirmLabel: 'Evet, Sil',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteCncPart(part.id);
      notify.success('Parça başarıyla silindi');
      await refresh();
    } catch (error) {
      // The backend's own reason (e.g. the part is in a plan), when it sent one.
      const detail = errorMessage(error, '').trim();
      notify.error(
        detail && !/^HTTP \d+$/.test(detail)
          ? `Parça silinemedi: ${detail}`
          : 'Parça silinirken hata oluştu',
      );
    }
  };

  const rowActions = (): RowAction<CncPart>[] => [
    { key: 'edit', label: 'Düzenle', icon: 'fas fa-edit', color: 'primary', onClick: setEditing },
    {
      key: 'delete',
      label: 'Sil',
      icon: 'fas fa-trash',
      color: 'danger',
      onClick: (p) => void removePart(p),
    },
  ];

  return (
    <ModalSection title="Parça Yönetimi" icon="fas fa-puzzle-piece">
      <Group justify="flex-end" mb="xs">
        <Button
          size="xs"
          variant="outline"
          color="cyan"
          leftSection={<FaIcon icon={pasteOpen ? 'fas fa-chevron-up' : 'fas fa-paste'} />}
          onClick={() => setPasteOpen((v) => !v)}
        >
          {pasteOpen ? 'Gizle' : 'Toplu Yapıştır'}
        </Button>
      </Group>
      {pasteOpen ? (
        <div>
          <Textarea
            label="Toplu Yapıştır (Excel kopyasını buraya yapıştırın - Tüm mevcut parçaları değiştirir)"
            placeholder="Excel'den kopyaladığınız verileri buraya yapıştırın"
            rows={4}
            value={paste}
            onChange={(e) => setPaste(e.currentTarget.value)}
          />
          <Group gap="xs" mt="xs" wrap="nowrap" align="flex-start">
            <Button
              size="xs"
              variant="outline"
              color="cyan"
              leftSection={<FaIcon icon="fas fa-eye" />}
              onClick={showPreview}
              style={{ flexShrink: 0 }}
            >
              Önizle
            </Button>
            {preview ? (
              <Button
                size="xs"
                variant="outline"
                color="green"
                loading={processing}
                leftSection={<FaIcon icon="fas fa-magic" />}
                onClick={() => void applyPaste()}
                style={{ flexShrink: 0 }}
              >
                Onayla ve Değiştir
              </Button>
            ) : null}
            <Text size="xs" c="dimmed">
              {PASTE_HELP}
            </Text>
          </Group>
          {preview ? (
            <div style={{ marginTop: 12 }}>
              <Text size="sm" fw={600} mb={4}>
                <FaIcon icon="fas fa-eye" /> Önizleme - {preview.length} parça bulundu
              </Text>
              <Table.ScrollContainer minWidth={500} maxHeight={300}>
                <Table striped highlightOnHover stickyHeader withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>İş No</Table.Th>
                      <Table.Th>Resim No</Table.Th>
                      <Table.Th>Pozisyon No</Table.Th>
                      <Table.Th>Ağırlık (kg)</Table.Th>
                      <Table.Th>Adet</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {preview.map((p, i) => (
                      <Table.Tr key={i}>
                        <Table.Td>{dash(p.job_no)}</Table.Td>
                        <Table.Td>{dash(p.image_no)}</Table.Td>
                        <Table.Td>{dash(p.position_no)}</Table.Td>
                        <Table.Td>{dash(p.weight_kg)}</Table.Td>
                        <Table.Td>{dash(p.quantity)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ marginTop: 12 }}>
        <DataTable
          title="Parçalar"
          icon="fas fa-puzzle-piece"
          data={parts}
          columns={PART_COLUMNS}
          getRowId={(p) => String(p.id)}
          rowActions={rowActions}
          striped
          verticalSpacing="xs"
          emptyMessage="Parça bulunamadı"
          toolbar={
            <Button
              size="xs"
              color="green"
              leftSection={<FaIcon icon="fas fa-plus" />}
              onClick={() => setEditing('new')}
            >
              Parça Ekle
            </Button>
          }
        />
      </div>

      {editing ? (
        <PartFormModal
          taskKey={taskKey}
          part={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => void refresh()}
        />
      ) : null}
    </ModalSection>
  );
}

const partSchema = z.object({
  job_no: z.string().refine((v) => v.trim() !== '', 'İş numarası gereklidir'),
  image_no: z.string(),
  position_no: z.string(),
  weight_kg: z.union([z.number(), z.string()]),
  quantity: z.union([z.number(), z.string()]),
});

type PartFormValues = z.infer<typeof partSchema>;

function partInput(values: PartFormValues): CncPartInput {
  const weight = values.weight_kg === '' ? null : Number(values.weight_kg);
  const quantity = values.quantity === '' ? null : parseInt(String(values.quantity), 10);
  return {
    job_no: values.job_no,
    image_no: values.image_no,
    position_no: values.position_no,
    weight_kg: weight !== null && Number.isFinite(weight) ? weight : null,
    quantity: quantity !== null && Number.isFinite(quantity) ? quantity : null,
  };
}

/** "Yeni Parça Ekle" / "Parça Düzenle". */
function PartFormModal({
  taskKey,
  part,
  onClose,
  onSaved,
}: {
  taskKey: string;
  part: CncPart | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useForm<PartFormValues>({
    initialValues: {
      job_no: part?.job_no || '',
      image_no: part?.image_no || '',
      position_no: part?.position_no || '',
      weight_kg: part?.weight_kg ? Number(part.weight_kg) : '',
      quantity: part?.quantity ?? '',
    },
    validate: zod4Resolver(partSchema),
  });
  const jobChoices = useJobOrderChoices([form.values.job_no]);
  const [saving, setSaving] = useState(false);

  const save = async (values: PartFormValues) => {
    setSaving(true);
    try {
      if (part) {
        await updateCncPart(part.id, partInput(values));
        notify.success('Parça başarıyla güncellendi');
      } else {
        await createCncPart({ ...partInput(values), cnc_task: taskKey });
        notify.success('Parça başarıyla eklendi');
      }
      onSaved();
      onClose();
    } catch {
      notify.error(part ? 'Parça güncellenirken hata oluştu' : 'Parça eklenirken hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={part ? 'Parça Düzenle' : 'Yeni Parça Ekle'}
      icon={part ? 'fas fa-edit' : 'fas fa-plus'}
      size="md"
      submitLabel={part ? 'Değişiklikleri Kaydet' : 'Parçayı Ekle'}
      submitting={saving}
      onSubmit={form.onSubmit((values) => void save(values))}
    >
      <ModalSection title="Parça Bilgileri" icon="fas fa-puzzle-piece">
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="İş No"
              withAsterisk
              placeholder="İş emri seçin"
              data={jobChoices}
              searchable
              clearable
              limit={100}
              data-autofocus
              {...form.getInputProps('job_no')}
              value={form.values.job_no || null}
              onChange={(value) => form.setFieldValue('job_no', value ?? '')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Resim No"
              placeholder="Resim numarasını girin"
              {...form.getInputProps('image_no')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Pozisyon No"
              placeholder="Pozisyon numarasını girin"
              {...form.getInputProps('position_no')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <NumberInput
              label="Ağırlık (kg)"
              placeholder="0.000"
              step={0.001}
              decimalScale={3}
              min={0}
              {...form.getInputProps('weight_kg')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <NumberInput
              label="Adet"
              placeholder="0"
              step={1}
              min={0}
              allowDecimal={false}
              {...form.getInputProps('quantity')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}
